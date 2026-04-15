import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { RequestContext } from "@/lib/request-context";

export interface AuditEvent {
  action: string;
  entity: string;
  entityId: string;
  details?: string;
  context?: RequestContext;
}

/**
 * Append-only audit log writer.
 * Never throws — logs to stderr on failure so the calling request is not blocked.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const userId = event.context?.userId ?? null;
  const ip = event.context?.ip;
  const userAgent = event.context?.userAgent;

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: event.action,
        entity: event.entity,
        entity_id: event.entityId,
        details: event.details,
        ip,
        user_agent: userAgent,
        timestamp: new Date(),
      },
    });
  } catch (err) {
    logger.error({ err, correlationId: event.context?.correlationId }, "Audit log write failed");
  }
}
