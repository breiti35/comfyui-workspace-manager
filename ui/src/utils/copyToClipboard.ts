import type { useToast } from "@chakra-ui/react";

/** Writes text to the clipboard; resolves false when unavailable or rejected. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copies and shows a success toast, or an error toast when copying failed. */
export async function copyWithToast(
  toast: ReturnType<typeof useToast>,
  text: string,
  successTitle: string,
  failTitle: string,
): Promise<boolean> {
  const ok = await copyText(text);
  toast(
    ok
      ? { title: successTitle, status: "success", duration: 1400 }
      : { title: failTitle, status: "error", duration: 2500 },
  );
  return ok;
}
