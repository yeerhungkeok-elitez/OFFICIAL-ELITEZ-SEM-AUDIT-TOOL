import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import Sidebar from "@/components/Sidebar";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import ScenarioSwitcher from "@/components/ScenarioSwitcher";

export const metadata: Metadata = {
  title: "Elitez SEM Planner",
  description: "Professional SEM planning and forecasting tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-slate-50 font-sans" suppressHydrationWarning>
        <AppProvider>
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Top bar */}
            <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-100 shrink-0">
              <h2 className="text-sm font-medium text-slate-400">Elitez Digital</h2>
              <div className="flex items-center gap-3">
                <ScenarioSwitcher />
                <ProjectSwitcher />
                <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-semibold">
                  AD
                </div>
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto p-6 lg:p-8">
              {children}
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
