/**
 * Shared route-level loading UI for portal segment `loading.tsx` files.
 * Matches admin work order reference spinner (ring + partial border).
 */
export function PortalRouteLoading() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8"
      role="status"
      aria-label="Loading"
    >
      <div className="h-11 w-11 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}
