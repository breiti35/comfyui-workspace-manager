import type { WorkspaceRoute } from "./types/types";

// "root" is the canvas with nothing open - it is never itself pushed onto
// the stack, it's what an empty-of-overlays stack collapses to.
export const ROOT_ROUTE: WorkspaceRoute = "root";

export function initialRouteStack(): WorkspaceRoute[] {
  return [ROOT_ROUTE];
}

// Defensive fallback to "root" for an empty stack: callers should never be
// able to crash the app by driving the stack empty via popRoute et al.
export function currentRoute(stack: WorkspaceRoute[]): WorkspaceRoute {
  return stack[stack.length - 1] ?? ROOT_ROUTE;
}

export function pushRoute(
  stack: WorkspaceRoute[],
  route: WorkspaceRoute,
): WorkspaceRoute[] {
  // "root" means "nothing is open" - pushing it is really a full reset, not
  // another stack entry.
  if (route === ROOT_ROUTE) {
    return resetRouteStack(stack);
  }
  if (currentRoute(stack) === route) {
    // Already showing this route - keep the same reference so React bails
    // out of the re-render.
    return stack;
  }
  // An empty stack has no "root" entry of its own - only currentRoute()
  // falls back to it defensively above. Treat it as [root] here too, so
  // pushing onto an empty stack lands on ["root", route] just like it would
  // if the stack had started out via initialRouteStack().
  const base = stack.length === 0 ? [ROOT_ROUTE] : stack;
  const existingIndex = base.indexOf(route);
  if (existingIndex !== -1) {
    // Route is already lower in the stack (e.g. versionHistory can be
    // opened from two places, modelList can be re-entered from
    // installModels): navigate back to that level instead of growing the
    // stack or letting the same route appear twice.
    return base.slice(0, existingIndex + 1);
  }
  return [...base, route];
}

export function popRoute(stack: WorkspaceRoute[]): WorkspaceRoute[] {
  if (stack.length <= 1) {
    // Already at (or below) root - nothing to pop, keep the reference.
    return stack;
  }
  return stack.slice(0, -1);
}

export function resetRouteStack(stack: WorkspaceRoute[]): WorkspaceRoute[] {
  if (stack.length === 1 && stack[0] === ROOT_ROUTE) {
    // Already collapsed to root - keep the reference so callers can rely on
    // it as a no-op (e.g. the ErrorBoundary key in ModelManagerTopbar).
    return stack;
  }
  return [ROOT_ROUTE];
}

export function routeStackSignature(stack: WorkspaceRoute[]): string {
  return stack.join(">");
}
