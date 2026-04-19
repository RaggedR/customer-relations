"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NurseLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [nurseName, setNurseName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nurse/me")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.name) setNurseName(data.name);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-semibold">Nurse Portal</h1>
            <p className="text-xs text-muted-foreground">Clinical data is watermarked and access-logged</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/nurse" className="text-muted-foreground hover:text-foreground transition-colors">
              Appointments
            </Link>
            <Link href="/nurse/availability" className="text-muted-foreground hover:text-foreground transition-colors">
              Availability
            </Link>
            <Link href="/nurse/records" className="text-muted-foreground hover:text-foreground transition-colors">
              Patient Records
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {nurseName && (
            <span className="text-sm text-muted-foreground">
              Logged in as <span className="text-foreground font-medium">{nurseName}</span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="p-4 max-w-4xl mx-auto">{children}</main>
    </div>
  );
}
