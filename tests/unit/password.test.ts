import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("Password hashing — scrypt", () => {
  it("round-trips: hash then verify returns true", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const ok = await verifyPassword("correct-horse-battery-staple", hash);
    expect(ok).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    const ok = await verifyPassword("wrong-password", hash);
    expect(ok).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });

  it("hash format is salt:hash in hex", async () => {
    const hash = await hashPassword("test");
    const parts = hash.split(":");
    expect(parts).toHaveLength(2);
    // Salt is 16 bytes = 32 hex chars, hash is 64 bytes = 128 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[1]).toMatch(/^[0-9a-f]{128}$/);
  });

  it("returns false for malformed stored hash (no colon)", async () => {
    const ok = await verifyPassword("test", "not-a-valid-hash");
    expect(ok).toBe(false);
  });

  it("returns false for malformed stored hash (empty parts)", async () => {
    const ok = await verifyPassword("test", ":");
    expect(ok).toBe(false);
  });

  it("returns false for empty password against valid hash", async () => {
    const hash = await hashPassword("real-password");
    const ok = await verifyPassword("", hash);
    expect(ok).toBe(false);
  });
});
