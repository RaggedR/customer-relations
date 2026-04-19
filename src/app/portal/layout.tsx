"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/portal", label: "Appointments", icon: "📅" },
  { href: "/portal/book", label: "Book", icon: "➕" },
  { href: "/portal/profile", label: "My Profile", icon: "👤" },
  { href: "/portal/privacy", label: "Privacy", icon: "🔒" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [patientName, setPatientName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/profile")
      .then((res) => {
        if (res.status === 401) { router.push("/portal/login"); return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.name) setPatientName(data.name);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/portal/login");
  }

  // Login page gets no chrome
  if (pathname === "/portal/login" || pathname === "/portal/claim") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <h1 className="text-base font-semibold text-sidebar-foreground">Patient Portal</h1>
          {patientName && (
            <p className="text-xs text-muted-foreground mt-0.5">Welcome, {patientName}</p>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/portal" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-border bg-card px-8 flex items-center">
          <h2 className="text-sm font-medium text-muted-foreground">
            {NAV_ITEMS.find((item) => pathname === item.href || (item.href !== "/portal" && pathname.startsWith(item.href)))?.label ?? "Patient Portal"}
          </h2>
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
