import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { signSession, type Role } from "@/lib/auth";

// Mock Prisma session table — return a valid session record for any token lookup
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findFirst: vi.fn().mockResolvedValue({
        id: 1,
        token: "mocked",
        last_active: new Date(),
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000),
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Import proxy AFTER mock is registered
const { proxy } = await import("@/proxy");

const SECRET = "test-secret-must-be-at-least-32-bytes-long!!";

// Pre-sign tokens for each role so tests are synchronous after setup
let adminToken: string;
let nurseToken: string;
let patientToken: string;

beforeAll(async () => {
  // Set the secret env var that proxy.ts will read
  process.env.SESSION_SECRET = SECRET;
  adminToken = await signSession({ userId: "u1", role: "admin" }, SECRET);
  nurseToken = await signSession({ userId: "u2", role: "nurse" }, SECRET);
  patientToken = await signSession({ userId: "u3", role: "patient" }, SECRET);
});

function makeRequest(path: string, token?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers();
  if (token) {
    headers.set("cookie", `session=${token}`);
  }
  return new NextRequest(url, { headers });
}

function isRedirectToLogin(response: Response): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location") ?? "";
  return location.includes("/login");
}

describe("Proxy — admin routes (default-deny)", () => {
  it("admin cookie on root → passes through", async () => {
    const res = await proxy(makeRequest("/", adminToken));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("no cookie on root → redirects to /login", async () => {
    const res = await proxy(makeRequest("/"));
    expect(isRedirectToLogin(res)).toBe(true);
  });

  it("admin cookie on /patients → passes through", async () => {
    const res = await proxy(makeRequest("/patients", adminToken));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("no cookie on /patients → redirects to /login", async () => {
    const res = await proxy(makeRequest("/patients"));
    expect(isRedirectToLogin(res)).toBe(true);
  });

  it("nurse cookie on admin route → redirects to /login", async () => {
    const res = await proxy(makeRequest("/patients", nurseToken));
    expect(isRedirectToLogin(res)).toBe(true);
  });

  it("patient cookie on admin route → redirects to /login", async () => {
    const res = await proxy(makeRequest("/patients", patientToken));
    expect(isRedirectToLogin(res)).toBe(true);
  });
});

describe("Proxy — nurse routes", () => {
  it("nurse cookie on nurse route → passes through", async () => {
    const res = await proxy(makeRequest("/nurse/appointments", nurseToken));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("admin cookie on nurse route → passes through (superuser)", async () => {
    const res = await proxy(makeRequest("/nurse/appointments", adminToken));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("no cookie on nurse route → redirects", async () => {
    const res = await proxy(makeRequest("/nurse/appointments"));
    expect(isRedirectToLogin(res)).toBe(true);
  });

  it("patient cookie on nurse route → redirects", async () => {
    const res = await proxy(makeRequest("/nurse/appointments", patientToken));
    expect(isRedirectToLogin(res)).toBe(true);
  });
});

describe("Proxy — patient portal routes", () => {
  it("patient cookie on portal route → passes through", async () => {
    const res = await proxy(makeRequest("/portal/bookings", patientToken));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("admin cookie on portal route → passes through (superuser)", async () => {
    const res = await proxy(makeRequest("/portal/bookings", adminToken));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("no cookie on portal route → redirects", async () => {
    const res = await proxy(makeRequest("/portal/bookings"));
    expect(isRedirectToLogin(res)).toBe(true);
  });
});

describe("Proxy — public routes", () => {
  it("/login passes through without cookie", async () => {
    const res = await proxy(makeRequest("/login"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("/_next/static/* passes through without cookie", async () => {
    const res = await proxy(makeRequest("/_next/static/chunk.js"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("/.well-known/carddav passes through without cookie", async () => {
    const res = await proxy(makeRequest("/.well-known/carddav"));
    expect(isRedirectToLogin(res)).toBe(false);
  });

  it("/favicon.ico passes through without cookie", async () => {
    const res = await proxy(makeRequest("/favicon.ico"));
    expect(isRedirectToLogin(res)).toBe(false);
  });
});

describe("Proxy — anti-caching headers", () => {
  it("nurse route response includes no-store", async () => {
    const res = await proxy(makeRequest("/nurse/appointments", nurseToken));
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("no-store");
    expect(cc).toContain("no-cache");
    expect(cc).toContain("must-revalidate");
  });

  it("admin route response does NOT include anti-caching headers", async () => {
    const res = await proxy(makeRequest("/patients", adminToken));
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).not.toContain("no-store");
  });

  it("portal route response includes no-store", async () => {
    const res = await proxy(makeRequest("/portal/bookings", patientToken));
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toContain("no-store");
  });
});
