"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface NavItem { href: string; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { href: "/portal", label: "Appointments", icon: "📅" },
  { href: "/portal/profile", label: "My Profile", icon: "👤" },
  { href: "/portal/privacy", label: "Privacy", icon: "🔒" },
];

const NO_CHROME_PATHS = ["/portal/login", "/portal/claim"];

/** Match exact path or prefix (with trailing slash guard). */
function isActive(pathname: string, item: NavItem, basePath: string): boolean {
  if (pathname === item.href) return true;
  return item.href !== basePath && pathname.startsWith(item.href + "/");
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [patientName, setPatientName] = useState<string | null>(null);

  const isChromeless = NO_CHROME_PATHS.includes(pathname);

  useEffect(() => {
    if (isChromeless) return;
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
  }, [isChromeless, router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/portal/login");
  }

  if (isChromeless) {
    return <>{children}</>;
  }

  const currentLabel = NAV_ITEMS.find((item) => isActive(pathname, item, "/portal"))?.label ?? "Patient Portal";

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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(pathname, item, "/portal")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
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
          <h2 className="text-sm font-medium text-muted-foreground">{currentLabel}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
