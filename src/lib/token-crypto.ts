/**
 * Token Encryption — AES-256-GCM
 *
 * Encrypts OAuth tokens before storing in the database and
 * decrypts them when reading. Uses authenticated encryption
 * (GCM) so tampering is detected.
 *
 * Wire format: "iv_hex:tag_hex:ciphertext_hex"
 * (matches the salt:hash convention from password.ts)
 *
 * Requires TOKEN_ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("TOKEN_ENCRYPTION_KEY env var is not set");
  }
  if (hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be ${KEY_HEX_LENGTH} hex characters (${KEY_HEX_LENGTH / 2} bytes)`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a stored token, falling back to plaintext for legacy
 * rows that were stored before encryption was enabled.
 */
export function tryDecrypt(token: string | null): string | undefined {
  if (!token) return undefined;
  try {
    return decryptToken(token);
  } catch {
    // Legacy plaintext token — return as-is for graceful migration
    return token;
  }
}

export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error("Token decryption failed: invalid format");
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
