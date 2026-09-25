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

/**
 * Routes that occupy the same level: opening one replaces the other instead
 * of stacking on top of it. modelList and installModels are two tabs of the
 * same panel (see ModelsPanel.tsx), so a stack holding both would mean
 * closing once leaves the panel open on the other tab.
 */
const SIBLING_ROUTES: readonly (readonly WorkspaceRoute[])[] = [
  ["modelList", "installModels"],
];

// Every route is, at minimum, its own sibling (a singleton group) - that's
// what makes the lookup below subsume the plain "already in stack" case.
function siblingGroupOf(route: WorkspaceRoute): readonly WorkspaceRoute[] {
  return SIBLING_ROUTES.find((group) => group.includes(route)) ?? [route];
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
  // Look for the nearest entry that shares a level with the route being
  // opened - either the exact same route lower in the stack (e.g.
  // versionHistory can be opened from two places, modelList can be
  // re-entered from installModels), or one of its siblings (e.g.
  // installModels opened while modelList is showing). Either way we
  // navigate back to that level instead of growing the stack: a route is
  // its own sibling, so an exact match falls out of this lookup the same
  // way it always did, just via SIBLING_ROUTES' singleton fallback instead
  // of a dedicated indexOf check.
  const group = siblingGroupOf(route);
  const existingIndex = base.findIndex((entry) => group.includes(entry));
  if (existingIndex !== -1) {
    return [...base.slice(0, existingIndex), route];
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
