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

// ── Password strength ────────────────────────────────────
// Rules and validation live in password-rules.ts (no node:crypto dependency)
// so they can be imported by both server and client code.

export { validatePasswordStrength, PASSWORD_STRENGTH_RULES } from "./password-rules";

// ── Password generation ─────────────────────────────────

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O (ambiguous)
const LOWER = "abcdefghjkmnpqrstuvwxyz"; // no i, l, o (ambiguous)
const DIGITS = "23456789"; // no 0, 1 (ambiguous)
const SPECIALS = "!@#$%&*+-=?";

/**
 * Generate a cryptographically random 16-character password that
 * is guaranteed to pass validatePasswordStrength().
 *
 * Strategy: place one char from each required class in random positions,
 * fill the rest randomly from the full alphabet, then shuffle.
 */
export function generateStrongPassword(): string {
  const allChars = UPPER + LOWER + DIGITS + SPECIALS;
  const len = 16;

  // Guarantee one from each class
  const guaranteed = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SPECIALS[randomInt(SPECIALS.length)],
  ];

  // Fill remaining slots
  const chars = [...guaranteed];
  for (let i = chars.length; i < len; i++) {
    chars.push(allChars[randomInt(allChars.length)]);
  }

  // Fisher-Yates shuffle using crypto randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

/**
 * Crypto-safe random int in [0, max) using rejection sampling.
 * Avoids modulo bias by discarding values >= the largest multiple of max.
 */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  let val: number;
  do {
    val = randomBytes(4).readUInt32BE(0);
  } while (val >= limit);
  return val % max;
}
