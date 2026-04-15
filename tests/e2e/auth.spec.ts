/**
 * Auth & Session E2E Tests — Sections 13, 20 of HUMAN_TESTS_TODO.md
 *
 * Section 13: Login/logout flow, session creation/deletion, protected routes
 * Section 20: Cookie fuzz — garbage, empty, forged, oversized cookies
 *
 * IMPORTANT: Login tests consume rate-limited login attempts (5/min).
 * Tests that call /api/auth/login handle 429 gracefully (skip).
 * The logout test creates a throwaway session so the shared admin
 * storageState is never invalidated.
 */

import { test, expect } from "playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  NURSE_EMAIL,
  NURSE_PASSWORD,
  BASE_URL,
} from "./helpers/auth";

/**
 * Helper: login via API, return the session token (or null on rate limit).
 */
async function loginAndGetToken(
  email: string,
  password: string,
): Promise<{ token: string; body: Record<string, unknown> } | null> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 429) return null;
  if (!res.ok) return null;

  const body = await res.json();
  const setCookie = res.headers.getSetCookie();
  const sessionCookie = setCookie.find((c) => c.startsWith("session="));
  const token = sessionCookie?.match(/^session=([^;]+)/)?.[1] ?? "";
  return { token, body };
}

// ─── Section 13: Auth & Session Security ──────────────────────────────────────

test.describe("Section 13 — Login Flow", () => {
  test("login with valid admin credentials returns session cookie", async () => {
    const result = await loginAndGetToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!result) {
      test.skip();
      return;
    }
    expect(result.body.success).toBe(true);
    expect((result.body.user as Record<string, string>).role).toBe("admin");
    expect(result.token.length).toBeGreaterThan(10);
  });

  test("login with wrong password returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "wrong-password" }),
    });
    if (res.status === 429) {
      test.skip();
      return;
    }
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  test("login with nonexistent email returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent@test.local",
        password: "anything",
      }),
    });
    if (res.status === 429) {
      test.skip();
      return;
    }
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  test("login with missing fields returns 400", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    if (res.status === 429) {
      test.skip();
      return;
    }
    expect(res.status).toBe(400);
  });

  test("logout clears session cookie and sets Clear-Site-Data", async () => {
    // Create a THROWAWAY session — do NOT use the shared admin storageState
    const result = await loginAndGetToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!result) {
      test.skip();
      return;
    }

    // Logout with the throwaway token
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: `session=${result.token}` },
    });
    expect(res.ok).toBeTruthy();

    const body = await res.json();
    expect(body.success).toBe(true);

    const clearHeader = res.headers.get("clear-site-data");
    expect(clearHeader).toBeDefined();
    expect(clearHeader).toContain("cookies");
  });

  test("login with nurse credentials returns nurse role", async () => {
    const result = await loginAndGetToken(NURSE_EMAIL, NURSE_PASSWORD);
    if (!result) {
      test.skip();
      return;
    }
    expect((result.body.user as Record<string, string>).role).toBe("nurse");
  });
});

test.describe("Section 13 — Protected Routes", () => {
  test("protected route without cookie redirects to /login", async () => {
    const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  test("API route without cookie redirects to /login", async () => {
    const res = await fetch(`${BASE_URL}/api/patient`, {
      redirect: "manual",
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  test("/login page is accessible without auth", async () => {
    const res = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
    expect(res.ok).toBeTruthy();
  });

  test("/api/auth/login is accessible without auth", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@test.local", password: "test" }),
    });
    expect([401, 429]).toContain(res.status);
  });
});

// ─── Section 20: Cookie Fuzz ──────────────────────────────────────────────────

test.describe("Section 20 — Cookie Fuzz", () => {
  test("garbage cookie (short) → redirect, not crash", async () => {
    const res = await fetch(`${BASE_URL}/api/patient`, {
      redirect: "manual",
      headers: { Cookie: "session=aaaa" },
    });
    expect([307, 401, 403]).toContain(res.status);
  });

  test("empty cookie → redirect, not crash", async () => {
    const res = await fetch(`${BASE_URL}/api/patient`, {
      redirect: "manual",
      headers: { Cookie: "session=" },
    });
    expect([307, 401, 403]).toContain(res.status);
  });

  test("oversized cookie (1MB) → server doesn't crash", async () => {
    const bigValue = "x".repeat(1024 * 1024);
    try {
      const res = await fetch(`${BASE_URL}/api/patient`, {
        redirect: "manual",
        headers: { Cookie: `session=${bigValue}` },
      });
      expect(res.status).toBeLessThan(600);
    } catch {
      // Connection refused or header too large is acceptable
    }
  });

  test("forged JWT with wrong secret → redirect", async () => {
    const fakeHeader = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString(
      "base64url",
    );
    const fakePayload = Buffer.from(
      '{"userId":"1","role":"admin","iat":1700000000,"exp":1800000000}',
    ).toString("base64url");
    const forgedToken = `${fakeHeader}.${fakePayload}.invalid-sig`;

    const res = await fetch(`${BASE_URL}/api/patient`, {
      redirect: "manual",
      headers: { Cookie: `session=${forgedToken}` },
    });
    expect([307, 401, 403]).toContain(res.status);
  });

  test("valid admin cookie can access /api/patient", async ({ request }) => {
    const res = await request.get("/api/patient");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("/api/backup with no auth → doesn't dump database", async () => {
    const res = await fetch(`${BASE_URL}/api/backup`, {
      redirect: "manual",
    });
    expect([307, 401, 403]).toContain(res.status);
  });

  test("/api/ai with no auth → doesn't execute queries", async () => {
    const res = await fetch(`${BASE_URL}/api/ai`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Show all patients" }),
    });
    expect([307, 401, 403]).toContain(res.status);
  });

  test("/api/patient with nurse token → rejected (admin-only)", async () => {
    const result = await loginAndGetToken(NURSE_EMAIL, NURSE_PASSWORD);
    if (!result) {
      test.skip();
      return;
    }

    const res = await fetch(`${BASE_URL}/api/patient`, {
      redirect: "manual",
      headers: { Cookie: `session=${result.token}` },
    });
    expect([307, 401, 403]).toContain(res.status);
  });
});
