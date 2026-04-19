"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_STRENGTH_RULES } from "@/lib/password-rules";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ruleResults = PASSWORD_STRENGTH_RULES.map((r) => ({
    label: r.message,
    met: r.test(newPassword),
  }));
  const allRulesMet = ruleResults.every((r) => r.met);
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    allRulesMet &&
    passwordsMatch &&
    confirmPassword.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }

      // Role-based redirect using the role returned by the API
      const role = data.role;
      if (role === "nurse") {
        router.push("/nurse");
      } else if (role === "patient") {
        router.push("/portal");
      } else {
        router.push("/");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8"
      >
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Change your password
          </h1>
          <p className="text-sm text-muted-foreground">
            You must set a new password before continuing
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {/* Live strength feedback */}
            {newPassword.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {ruleResults.map((r) => (
                  <li
                    key={r.label}
                    className={
                      r.met
                        ? "text-emerald-700"
                        : "text-muted-foreground"
                    }
                  >
                    {r.met ? "\u2713" : "\u2717"} {r.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
          {loading ? "Changing password..." : "Change password"}
        </Button>
      </form>
    </div>
  );
}
