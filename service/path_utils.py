"""Path confinement helpers shared by all routes that take a path from the
client.

ComfyUI has no authentication of its own and is often reachable from the
internet (RunPod proxy & co.), so every path that arrives in a request body or
query string has to be treated as hostile. The old code used a plain
os.path.join(base, user_path) everywhere - which silently drops `base` as soon
as `user_path` is absolute ("/etc", "C:\\Windows") and happily walks out with
"../..". safe_join() is the one place that gets this right.
"""

import os
import re
import threading

from aiohttp import web


class UnsafePathError(ValueError):
    """A client supplied path would leave the directory it is confined to."""


# "C:foo" (drive-relative) - on Windows os.path.join("G:\\base", "C:foo")
# returns "C:foo", i.e. relative to the *current directory of drive C:*, which
# is neither absolute nor inside base. Rejected outright on every platform: no
# legitimate client path looks like that, and on Linux it would only be a
# confusing file name anyway.
_DRIVE_RELATIVE_RE = re.compile(r"^[A-Za-z]:(?![\\/])")


def _norm(path):
    # normcase so the prefix comparison is case-insensitive on Windows, where
    # "G:\\Foo" and "g:\\foo" are the same directory.
    return os.path.normcase(os.path.realpath(path))


def is_within(base, path):
    """True if `path` (after resolving symlinks and "..") lies inside `base`
    or is `base` itself."""
    base_n = _norm(base)
    path_n = _norm(path)
    try:
        return os.path.commonpath([base_n, path_n]) == base_n
    except ValueError:
        # commonpath raises for paths on different drives (Windows) or a
        # mix of absolute and relative - both mean "not inside".
        return False


def safe_join(base, *parts, allow_absolute=True):
    """Join `parts` onto `base` and guarantee the result stays inside `base`.

    Returns the resolved (realpath) result. Raises UnsafePathError if the
    result would escape, if a part is not a string, contains a NUL byte or is
    a Windows drive-relative path ("C:foo").

    allow_absolute: the frontend sometimes sends absolute paths that already
    point into the base dir (e.g. the folder picker, older API callers).
    Those are fine as long as they end up inside `base`; an absolute path
    anywhere else is rejected by the containment check below. Pass False for
    callers that must only ever get relative paths (media serving).
    """
    if base is None:
        raise UnsafePathError("No base directory configured")
    base_real = os.path.realpath(base)
    candidate = base_real
    for part in parts:
        if part is None:
            raise UnsafePathError("Missing path")
        if isinstance(part, os.PathLike):
            part = os.fspath(part)
        if not isinstance(part, str):
            raise UnsafePathError("Path must be a string")
        if "\x00" in part:
            raise UnsafePathError("Invalid path")
        if _DRIVE_RELATIVE_RE.match(part):
            raise UnsafePathError(f"Drive-relative paths are not allowed: {part}")
        if not allow_absolute and (
            os.path.isabs(part) or part.startswith(("/", "\\"))
        ):
            raise UnsafePathError(f"Absolute paths are not allowed: {part}")
        candidate = os.path.join(candidate, part)

    resolved = os.path.realpath(candidate)
    if not is_within(base_real, resolved):
        raise UnsafePathError(f"Path escapes the allowed directory: {parts}")
    return resolved


def safe_name(name):
    """Validate a bare file/folder name (rename targets, upload names).

    A name must not contain any separator or be "." / ".." - otherwise a
    "rename" could move the entry anywhere. Returns the name unchanged.
    """
    if not isinstance(name, str) or not name.strip():
        raise UnsafePathError("Name must be a non-empty string")
    if "\x00" in name or "/" in name or "\\" in name:
        raise UnsafePathError(f"Name must not contain path separators: {name}")
    if name in (".", "..") or _DRIVE_RELATIVE_RE.match(name):
        raise UnsafePathError(f"Invalid name: {name}")
    return name


def browse_roots():
    """Optional allowlist from WORKSPACE_MANAGER_BROWSE_ROOTS (os.pathsep
    separated, e.g. "/workspace" on RunPod).

    The folder picker legitimately browses outside the current workflows dir
    (that is its whole purpose: choosing a new one), so it cannot simply be
    confined to it. On a publicly reachable pod that means anyone can list
    directory names of the whole filesystem and point the workflows dir - the
    base every other confinement check uses - at "/". Setting this env var
    limits the picker, the copy target and the accepted workflows dir to the
    given roots. Unset = previous behavior, so local installs are unchanged.
    """
    raw = os.environ.get("WORKSPACE_MANAGER_BROWSE_ROOTS", "")
    return [os.path.realpath(r) for r in raw.split(os.pathsep) if r.strip()]


# The workflows dir is the base for every file delete/rename route. Even
# without WORKSPACE_MANAGER_BROWSE_ROOTS it must never be the filesystem root
# or a system directory - otherwise one save_settings call makes the whole
# machine deletable.
_SYSTEM_DIRS = (
    "/etc", "/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/boot",
    "/proc", "/sys", "/dev", "/root", "/var", "/run",
)


def is_forbidden_workflows_dir(path):
    """True for a filesystem/drive root or a system directory (or anything
    inside one)."""
    real = os.path.realpath(path)
    if os.path.dirname(real) == real:
        return True
    windir = os.environ.get("SystemRoot") or os.environ.get("WINDIR")
    bad = list(_SYSTEM_DIRS)
    if windir:
        bad.append(windir)
        bad.append(os.path.join(os.path.splitdrive(windir)[0] + os.sep, "Program Files"))
        bad.append(os.path.join(os.path.splitdrive(windir)[0] + os.sep, "Program Files (x86)"))
    return any(is_within(d, real) for d in bad if os.path.exists(d))


def check_browse_allowed(path):
    """Raise UnsafePathError if browse roots are configured and `path` is
    outside all of them."""
    roots = browse_roots()
    if roots and not any(is_within(root, path) for root in roots):
        # "Operation not permitted" is the exact marker the settings dialog
        # looks for to show its "no permission" hint.
        raise UnsafePathError(
            "Operation not permitted: path is outside of WORKSPACE_MANAGER_BROWSE_ROOTS"
        )


def atomic_write_text(path, text):
    """Write `text` as UTF-8 to `path` without ever leaving a half-written file.

    The db/*.json tables and settings.json are rewritten on every change; a
    crash or a full disk in the middle of a plain open('w') used to leave a
    truncated file behind, which read_table() then treats as "no data" - i.e.
    the whole table was silently gone. Writing to a temp file in the same
    directory and os.replace()-ing it over the target is atomic on both
    Windows and POSIX. encoding='utf-8' because the platform default (cp1252
    on Windows) cannot encode many prompt/workflow names.
    """
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    tmp_path = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise


def bad_path_response(error):
    """HTTP 400 in the JSON shape the frontend already understands: every
    caller checks `result.error` and alerts/logs it."""
    return web.json_response({"success": False, "error": str(error)}, status=400)
