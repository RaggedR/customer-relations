"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/portal/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">Patient Portal</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/portal" className="text-muted-foreground hover:text-foreground transition-colors">
              Appointments
            </Link>
            <Link href="/portal/profile" className="text-muted-foreground hover:text-foreground transition-colors">
              My Profile
            </Link>
            <Link href="/portal/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </Link>
          </nav>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </header>
      <main className="p-4 max-w-3xl mx-auto">{children}</main>
    </div>
  );
}
