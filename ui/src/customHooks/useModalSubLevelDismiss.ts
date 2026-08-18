import { useCallback } from "react";

/**
 * Several panels are Chakra <Modal>s that keep a second, panel-local
 * "detail view" in their own React state (on top of the app-wide route
 * stack). Chakra fires the exact same onClose for Esc, overlay click, and
 * the ModalCloseButton, so without this a stray Esc while a detail view is
 * open would blow away the whole panel - search, filters, scroll position -
 * instead of just backing out of the detail view.
 *
 * Esc and overlay-click are rerouted through Chakra's own `onEsc` /
 * `onOverlayClick` callbacks (fired in addition to `onClose`, from the same
 * dialog-level keydown handler and the same guarded overlay-click handler
 * Chakra already uses) so the event still only reaches the same place it
 * always did - nested Popovers/Menus/inputs that rely on that bubbling (e.g.
 * stopping propagation themselves) keep working unchanged. The
 * ModalCloseButton is untouched: it keeps calling the real onClose via
 * modal context, so the X always fully closes the panel.
 */
export function useModalSubLevelDismiss(
  hasSubLevel: boolean,
  closeSubLevel: () => void,
  onClose: () => void,
) {
  const dismiss = useCallback(() => {
    if (hasSubLevel) {
      closeSubLevel();
    } else {
      onClose();
    }
  }, [hasSubLevel, closeSubLevel, onClose]);

  return {
    closeOnEsc: false,
    closeOnOverlayClick: false,
    onEsc: dismiss,
    onOverlayClick: dismiss,
  } as const;
}
