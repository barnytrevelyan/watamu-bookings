export default function Loading() {
  return (
    <div
      className="min-h-[50vh] flex items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-[3px] border-teal-200 border-t-teal-600 animate-spin" />
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );
}
