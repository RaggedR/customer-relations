import { prisma } from "@/lib/prisma";

export interface AuditEvent {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Append-only audit log writer.
 * Never throws — logs to stderr on failure so the calling request is not blocked.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: typeof event.userId === "string" ? parseInt(event.userId, 10) : event.userId,
        action: event.action,
        entity: event.entity,
        entity_id: event.entityId,
        details: event.details,
        ip: event.ip,
        user_agent: event.userAgent,
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}
