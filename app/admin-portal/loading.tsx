export default function AdminPortalLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8" role="status" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  );
}
