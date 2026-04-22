import { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

export default function KPICard({
  label,
  value,
  subtext,
  trend,
  trendValue,
  icon: Icon,
  iconColor,
  iconBg,
}: KPICardProps) {
  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
      ? "text-rose-500"
      : "text-slate-400";

  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "—";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={17} className={iconColor} />
        </div>
      </div>

      <div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        {(subtext || trendValue) && (
          <div className="mt-1 flex items-center gap-2">
            {trendValue && (
              <span className={`text-xs font-semibold ${trendColor}`}>
                {trendArrow} {trendValue}
              </span>
            )}
            {subtext && (
              <span className="text-xs text-slate-400">{subtext}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
