import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384; // 2^14 — NIST SP 800-132 recommended (16 MB with r=8)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64; // 512 bits
const SALT_LEN = 16; // 128 bits

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Hash a password using scrypt with a random salt.
 * Returns "salt:hash" as hex strings.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await deriveKey(password, salt);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

/**
 * Verify a password against a stored "salt:hash" string.
 * Uses timing-safe comparison to prevent side-channel attacks.
 * Returns false (never throws) on malformed input.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const colonIdx = stored.indexOf(":");
    if (colonIdx < 1) return false;

    const saltHex = stored.slice(0, colonIdx);
    const hashHex = stored.slice(colonIdx + 1);
    if (!saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const storedKey = Buffer.from(hashHex, "hex");
    if (salt.length === 0 || storedKey.length === 0) return false;

    const derivedKey = await deriveKey(password, salt);
    if (derivedKey.length !== storedKey.length) return false;

    return timingSafeEqual(derivedKey, storedKey);
  } catch {
    return false;
  }
}
