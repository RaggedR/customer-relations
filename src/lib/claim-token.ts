import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";

const TOKEN_EXPIRY_HOURS = 24;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a single-use claim token for the given email.
 * Returns the raw token string (to be included in the claim URL).
 * Only the hash is stored in the database.
 */
export async function issueClaim(email: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.claimToken.create({
    data: { email, tokenHash, expiresAt },
  });

  return rawToken;
}

/**
 * Consume a claim token: verify it exists, is unused, and not expired.
 * Marks it as used atomically. Returns the email if valid, null otherwise.
 */
export async function consumeClaim(rawToken: string): Promise<{ email: string } | null> {
  const tokenHash = hashToken(rawToken);

  // Use a transaction to atomically check and mark as used (prevents replay)
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claimToken.findUnique({ where: { tokenHash } });

    if (!claim) return null;
    if (claim.usedAt) return null;
    if (claim.expiresAt < new Date()) return null;

    await tx.claimToken.update({
      where: { id: claim.id },
      data: { usedAt: new Date() },
    });

    return { email: claim.email };
  });
}

/**
 * Purge expired or used claim tokens older than 7 days.
 * Call periodically (e.g., from a cron or startup task).
 */
export async function purgeStaleClaims(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.claimToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { usedAt: { not: null }, createdAt: { lt: cutoff } },
      ],
    },
  });
  return result.count;
}
