import { describe, it, expect } from "vitest";
import {
  signSession,
  verifyToken,
  hasRole,
  requiresRole,
  type Role,
  type SessionPayload,
} from "@/lib/auth";

describe("Auth — session crypto", () => {
  const secret = "test-secret-must-be-at-least-32-bytes-long!!";

  it("round-trips: sign then verify returns the original payload", async () => {
    const token = await signSession(
      { userId: "u1", role: "admin" as Role },
      secret,
    );
    const payload = await verifyToken(token, secret);

    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("u1");
    expect(payload!.role).toBe("admin");
  });

  it("verifyToken returns null for wrong secret", async () => {
    const token = await signSession(
      { userId: "u1", role: "admin" as Role },
      secret,
    );
    const payload = await verifyToken(token, "wrong-secret-that-is-also-32-bytes-long!!");
    expect(payload).toBeNull();
  });

  it("verifyToken returns null for expired token", async () => {
    const token = await signSession(
      { userId: "u1", role: "nurse" as Role },
      secret,
      "0s", // expires immediately
    );
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 50));
    const payload = await verifyToken(token, secret);
    expect(payload).toBeNull();
  });

  it("verifyToken returns null for malformed string", async () => {
    const payload = await verifyToken("not.a.valid.jwt", secret);
    expect(payload).toBeNull();
  });

  it("verifyToken returns null for empty string", async () => {
    const payload = await verifyToken("", secret);
    expect(payload).toBeNull();
  });
});

describe("Auth — role predicates", () => {
  const adminPayload: SessionPayload = { userId: "u1", role: "admin" };
  const nursePayload: SessionPayload = { userId: "u2", role: "nurse" };
  const patientPayload: SessionPayload = { userId: "u3", role: "patient" };

  it("hasRole: admin passes admin check", () => {
    expect(hasRole(adminPayload, "admin")).toBe(true);
  });

  it("hasRole: nurse fails admin check", () => {
    expect(hasRole(nursePayload, "admin")).toBe(false);
  });

  it("hasRole: patient fails nurse check", () => {
    expect(hasRole(patientPayload, "nurse")).toBe(false);
  });

  it("hasRole: admin passes any role (admin is superuser)", () => {
    expect(hasRole(adminPayload, "nurse")).toBe(true);
    expect(hasRole(adminPayload, "patient")).toBe(true);
  });
});

describe("Auth — requiresRole (default-deny)", () => {
  // Default-deny: everything not explicitly public requires admin
  it("root path requires admin (default-deny)", () => {
    expect(requiresRole("/")).toBe("admin");
  });

  it("top-level pages require admin (default-deny)", () => {
    expect(requiresRole("/patients")).toBe("admin");
    expect(requiresRole("/calendar")).toBe("admin");
    expect(requiresRole("/settings")).toBe("admin");
  });

  it("API routes require admin (default-deny)", () => {
    expect(requiresRole("/api/patients")).toBe("admin");
    expect(requiresRole("/api/backup")).toBe("admin");
  });

  it("nurse routes require nurse", () => {
    expect(requiresRole("/nurse/appointments")).toBe("nurse");
    expect(requiresRole("/nurse/schedule")).toBe("nurse");
  });

  it("nurse API routes require nurse", () => {
    expect(requiresRole("/api/nurse/appointments")).toBe("nurse");
  });

  it("portal routes require patient", () => {
    expect(requiresRole("/portal/bookings")).toBe("patient");
    expect(requiresRole("/portal/profile")).toBe("patient");
  });

  it("portal API routes require patient", () => {
    expect(requiresRole("/api/portal/profile")).toBe("patient");
  });

  // Explicit public routes
  it("login page requires no role", () => {
    expect(requiresRole("/login")).toBeNull();
  });

  it("static assets require no role", () => {
    expect(requiresRole("/_next/static/chunk.js")).toBeNull();
    expect(requiresRole("/_next/data/build-id/page.json")).toBeNull();
  });

  it("favicon requires no role", () => {
    expect(requiresRole("/favicon.ico")).toBeNull();
  });

  it(".well-known routes require no role", () => {
    expect(requiresRole("/.well-known/carddav")).toBeNull();
  });

  // Unknown paths default to admin (fail-closed)
  it("unknown paths require admin (fail-closed)", () => {
    expect(requiresRole("/unknown/page")).toBe("admin");
    expect(requiresRole("/anything")).toBe("admin");
  });
});
