interface ChartPlaceholderProps {
  title: string;
  subtitle?: string;
  height?: string;
}

export default function ChartPlaceholder({
  title,
  subtitle,
  height = "h-56",
}: ChartPlaceholderProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div
        className={`${height} rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2`}
      >
        {/* Skeleton bars */}
        <div className="flex items-end gap-2 opacity-30">
          {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
            <div
              key={i}
              className="w-6 bg-brand-500 rounded-t-sm"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 font-medium">Chart will appear here</p>
      </div>
    </div>
  );
}
