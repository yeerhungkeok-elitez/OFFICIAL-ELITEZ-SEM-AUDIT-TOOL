"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  Tag,
  TrendingUp,
  FileText,
  BookmarkCheck,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Zap,
  Layers,
} from "lucide-react";

const navItems = [
  { label: "Dashboard",   href: "/",             icon: LayoutDashboard },
  { label: "Projects",    href: "/projects",     icon: FolderOpen },
  { label: "Keywords",    href: "/keywords",     icon: Tag },
  { label: "Categories",  href: "/calibration",  icon: Layers },
  { label: "Forecast",    href: "/forecast",     icon: TrendingUp },
  { label: "Reports",     href: "/reports",      icon: FileText },
  { label: "Snapshots",   href: "/snapshots",    icon: BookmarkCheck },
  { label: "Assumptions", href: "/assumptions",  icon: SlidersHorizontal },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay — hidden on lg */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 bg-slate-900 flex flex-col transition-all duration-300
          lg:relative lg:flex lg:translate-x-0
          ${collapsed ? "w-[68px]" : "w-64"}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-white" />
            </div>
            {!collapsed && (
              <span className="text-white font-semibold text-sm tracking-wide whitespace-nowrap">
                SEM Planner
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group
                  ${active
                    ? "bg-brand-500 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }
                `}
                title={collapsed ? label : undefined}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="whitespace-nowrap">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="px-3 pb-4 shrink-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-white transition-colors text-sm"
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
    </>
  );
}
