"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_ACCOUNTS = [
  { label: "Admin (Clare)", email: "admin@callonclare.com.au", password: "demo", role: "admin" },
  { label: "Nurse (Emma)", email: "emma@callonclare.com.au", password: "demo", role: "nurse" },
  { label: "Patient (Margaret)", email: "margaret.t@example.com", password: "demo", role: "patient" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // Force password change before role-based redirect
      if (data.user?.mustChangePassword) {
        router.push("/change-password");
        return;
      }

      // Role-based redirect: patients go to portal, nurses to nurse dashboard
      const role = data.user?.role;
      if (role === "patient") {
        router.push("/portal");
      } else if (role === "nurse") {
        router.push("/nurse");
      } else {
        router.push("/");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8"
      >
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access the practice dashboard
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="clare@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required={!isDemo}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isDemo}
              autoComplete="current-password"
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>

        {isDemo && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Demo — quick login
            </p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <Button
                  key={acct.email}
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-sm"
                  disabled={loading}
                  onClick={() => doLogin(acct.email, acct.password)}
                >
                  <span className="mr-2 inline-block w-16 rounded bg-muted px-1.5 py-0.5 text-center text-xs font-medium">
                    {acct.role}
                  </span>
                  {acct.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
