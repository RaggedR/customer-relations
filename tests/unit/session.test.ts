import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

// Ensure demo mode is disabled for session tests — we're testing real auth
process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const SECRET = "test-secret-must-be-at-least-32-bytes-long!!";

function makeRequest(token?: string): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set("cookie", `session=${token}`);
  }
  return new NextRequest("http://localhost:3000/api/test", { headers });
}

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});

describe("getSessionUser", () => {
  it("returns userId as number and role for valid token", async () => {
    const token = await signSession({ userId: "42", role: "admin" }, SECRET);
    const session = await getSessionUser(makeRequest(token));

    expect(session).not.toBeNull();
    expect(session!.userId).toBe(42);
    expect(typeof session!.userId).toBe("number");
    expect(session!.role).toBe("admin");
  });

  it("returns null when no cookie", async () => {
    const session = await getSessionUser(makeRequest());
    expect(session).toBeNull();
  });

  it("returns null for invalid token", async () => {
    const session = await getSessionUser(makeRequest("garbage.token.here"));
    expect(session).toBeNull();
  });

  it("returns null for expired token", async () => {
    const token = await signSession({ userId: "1", role: "nurse" }, SECRET, "0s");
    await new Promise((r) => setTimeout(r, 50));
    const session = await getSessionUser(makeRequest(token));
    expect(session).toBeNull();
  });

  it("returns null when userId in token is not numeric", async () => {
    const token = await signSession({ userId: "not-a-number", role: "admin" }, SECRET);
    const session = await getSessionUser(makeRequest(token));
    expect(session).toBeNull();
  });

  it("returns null when SESSION_SECRET is missing", async () => {
    const saved = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      const token = await signSession({ userId: "1", role: "admin" }, SECRET);
      const session = await getSessionUser(makeRequest(token));
      expect(session).toBeNull();
    } finally {
      process.env.SESSION_SECRET = saved;
    }
  });
});
