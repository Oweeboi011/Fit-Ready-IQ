export default function LoadingSkeletonList() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-ink/[0.06] bg-ink/5 p-3.5">
          <div className="flex items-start gap-3">
            <div className="skeleton h-14 w-14 flex-shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-3/4 rounded-md" />
              <div className="skeleton h-2.5 w-1/2 rounded-md" />
              <div className="skeleton h-2.5 w-2/3 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
