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
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

/**
 * Matches the encrypted wire format: iv_hex:tag_hex:ciphertext_hex
 * All three segments must be non-empty hex strings.
 */
const ENCRYPTED_FORMAT = /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/;

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
 * Decrypt a stored token with safe legacy-plaintext fallback.
 *
 * Two-path logic:
 *   - Token matches encrypted format (iv:tag:ciphertext hex) → MUST decrypt or throw.
 *     Silent fallback to plaintext would mask key mismatch, corruption, or tampering.
 *   - Token does NOT match encrypted format → treat as a legacy plaintext token stored
 *     before encryption was enabled. Log a warning and return as-is.
 *
 * Rename note: was `tryDecrypt`. Renamed to `tryDecryptLegacy` to make the dual
 * behavior explicit and searchable.
 */
export function tryDecryptLegacy(token: string | null): string | undefined {
  if (!token) return undefined;

  if (ENCRYPTED_FORMAT.test(token)) {
    // Looks encrypted — must succeed or the token is corrupt / wrong key.
    return decryptToken(token);
  }

  // Does not match encrypted format → legacy plaintext row.
  logger.warn(
    { tokenPrefix: token.slice(0, 8) },
    "tryDecryptLegacy: returning legacy plaintext token — migrate to encrypted storage",
  );
  return token;
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
