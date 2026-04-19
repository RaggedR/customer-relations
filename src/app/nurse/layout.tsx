"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface NavItem { href: string; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { href: "/nurse", label: "Appointments", icon: "📋" },
  { href: "/nurse/availability", label: "Availability", icon: "🗓️" },
  { href: "/nurse/records", label: "Patient Records", icon: "📁" },
];

/** Match exact path or prefix (with trailing slash guard to prevent /nurse matching /nursery). */
function isActive(pathname: string, item: NavItem, basePath: string): boolean {
  if (pathname === item.href) return true;
  return item.href !== basePath && pathname.startsWith(item.href + "/");
}

export default function NurseLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [nurseName, setNurseName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nurse/me")
      .then((res) => {
        if (res.status === 401) { router.push("/login"); return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => { if (data?.name) setNurseName(data.name); })
      .catch(() => {});
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const currentLabel = NAV_ITEMS.find((item) => isActive(pathname, item, "/nurse"))?.label ?? "Nurse Portal";

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <h1 className="text-base font-semibold text-sidebar-foreground">Nurse Portal</h1>
          {nurseName && <p className="text-sm text-sidebar-foreground mt-0.5">{nurseName}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">Clinical data is watermarked and access-logged</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(pathname, item, "/nurse")
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
