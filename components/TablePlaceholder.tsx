interface TablePlaceholderProps {
  title: string;
  subtitle?: string;
  columns: string[];
  rowCount?: number;
}

export default function TablePlaceholder({
  title,
  subtitle,
  columns,
  rowCount = 5,
}: TablePlaceholderProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-t border-slate-50 hover:bg-slate-50 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col} className="px-5 py-3.5">
                    <div className="h-3 bg-slate-100 rounded-full animate-pulse w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
        <p className="text-xs text-slate-400">No projects yet — start by creating one</p>
        <button className="text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors">
          + New Project
        </button>
      </div>
    </div>
  );
}
