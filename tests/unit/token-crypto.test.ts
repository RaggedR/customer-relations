import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptToken, decryptToken } from "@/lib/token-crypto";

// 32 bytes = 64 hex chars
const TEST_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

describe("token-crypto — AES-256-GCM", () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    }
  });

  it("round-trips encrypt and decrypt", () => {
    const plaintext = "ya29.a0AfH6SMBx_oauth_access_token_value";
    const encrypted = encryptToken(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const plaintext = "same-token-value";
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
    // Both decrypt to the same value
    expect(decryptToken(a)).toBe(plaintext);
    expect(decryptToken(b)).toBe(plaintext);
  });

  it("uses iv:tag:ciphertext hex format", () => {
    const encrypted = encryptToken("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // IV = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptToken("secret");
    const parts = encrypted.split(":");
    // Flip a byte in the ciphertext
    const tampered = parts[2].slice(0, -2) + "ff";
    expect(() => decryptToken(`${parts[0]}:${parts[1]}:${tampered}`)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const encrypted = encryptToken("secret");
    const parts = encrypted.split(":");
    const badTag = "00".repeat(16);
    expect(() => decryptToken(`${parts[0]}:${badTag}:${parts[2]}`)).toThrow();
  });

  it("throws on malformed format (missing colons)", () => {
    expect(() => decryptToken("not-valid-format")).toThrow(
      /invalid format/,
    );
  });

  it("throws when TOKEN_ENCRYPTION_KEY is not set", () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => encryptToken("test")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = saved;
    }
  });

  it("throws when TOKEN_ENCRYPTION_KEY is wrong length", () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = "tooshort";
    try {
      expect(() => encryptToken("test")).toThrow(/64 hex characters/);
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = saved;
    }
  });

  it("handles empty string", () => {
    const encrypted = encryptToken("");
    expect(decryptToken(encrypted)).toBe("");
  });

  it("handles unicode content", () => {
    const token = "token-with-émojis-🔑";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });
});
