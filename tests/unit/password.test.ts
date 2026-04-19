import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, validatePasswordStrength, generateStrongPassword } from "@/lib/password";

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

describe("Password strength validation", () => {
  it("accepts a strong password with no errors", () => {
    expect(validatePasswordStrength("Str0ng!pw")).toEqual([]);
  });

  it("rejects a password shorter than 8 characters", () => {
    const errors = validatePasswordStrength("Ab1!");
    expect(errors).toContain("At least 8 characters");
  });

  it("rejects a password without uppercase", () => {
    const errors = validatePasswordStrength("lowercase1!");
    expect(errors).toContain("At least one uppercase letter");
  });

  it("rejects a password without lowercase", () => {
    const errors = validatePasswordStrength("UPPERCASE1!");
    expect(errors).toContain("At least one lowercase letter");
  });

  it("rejects a password without digits", () => {
    const errors = validatePasswordStrength("NoDigits!!");
    expect(errors).toContain("At least one digit");
  });

  it("rejects a password without special characters", () => {
    const errors = validatePasswordStrength("NoSpecial1A");
    expect(errors).toContain("At least one special character");
  });

  it("returns multiple errors for a completely weak password", () => {
    const errors = validatePasswordStrength("abc");
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe("Password generation", () => {
  it("generates a 16-character password", () => {
    const pw = generateStrongPassword();
    expect(pw).toHaveLength(16);
  });

  it("always passes strength validation", () => {
    // Run 20 times to check statistical guarantee
    for (let i = 0; i < 20; i++) {
      const pw = generateStrongPassword();
      const errors = validatePasswordStrength(pw);
      expect(errors).toEqual([]);
    }
  });

  it("generates unique passwords", () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 10; i++) {
      passwords.add(generateStrongPassword());
    }
    expect(passwords.size).toBe(10);
  });
});
