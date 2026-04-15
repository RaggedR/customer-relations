/**
 * Bearer Token — per-nurse iCal feed tokens
 *
 * Each nurse has a single feed token stored as a SHA-256 hash in the DB.
 * The raw token is only ever returned at generation time; the DB never
 * holds the plaintext, mirroring the pattern in claim-token.ts.
 *
 * Usage:
 *   const raw = await generateFeedToken(nurseId);  // store raw in URL
 *   const ok  = await verifyFeedToken(nurseId, raw);
 *   await revokeFeedToken(nurseId);                // regenerate / invalidate
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate a new feed token for the given nurse.
 * Stores the SHA-256 hash in the DB and returns the raw 64-hex-char token.
 * Any existing token is replaced atomically.
 */
export async function generateFeedToken(nurseId: number): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const hash = hashToken(raw);

  await prisma.nurse.update({
    where: { id: nurseId },
    data: { feed_token: hash },
  });

  return raw;
}

/**
 * Verify that `rawToken` matches the stored hash for the given nurse.
 * Uses timing-safe comparison to prevent side-channel attacks.
 * Returns false (never throws) on any mismatch, missing token, or DB error.
 */
export async function verifyFeedToken(
  nurseId: number,
  rawToken: string,
): Promise<boolean> {
  try {
    const nurse = await prisma.nurse.findUnique({
      where: { id: nurseId },
      select: { feed_token: true },
    });

    if (!nurse?.feed_token) return false;

    const expected = Buffer.from(nurse.feed_token, "hex");
    const actual = Buffer.from(hashToken(rawToken), "hex");

    if (expected.length !== actual.length) return false;

    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Revoke the feed token for the given nurse.
 * After this call, any previously issued feed URL will return 401.
 * Call generateFeedToken() to issue a new one.
 */
export async function revokeFeedToken(nurseId: number): Promise<void> {
  await prisma.nurse.update({
    where: { id: nurseId },
    data: { feed_token: null },
  });
}
