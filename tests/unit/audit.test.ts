import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { logAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const mockCreate = prisma.auditLog.create as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Audit — logAuditEvent", () => {
  it("calls prisma.auditLog.create with correct fields", async () => {
    mockCreate.mockResolvedValue({ id: "log-1" });

    await logAuditEvent({
      userId: 1,
      action: "view",
      entity: "patient",
      entityId: "p42",
      details: "Viewed patient record",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.userId).toBe(1);
    expect(call.data.action).toBe("view");
    expect(call.data.entity).toBe("patient");
    expect(call.data.entity_id).toBe("p42");
    expect(call.data.details).toBe("Viewed patient record");
    expect(call.data.timestamp).toBeInstanceOf(Date);
  });

  it("does NOT throw when Prisma throws", async () => {
    mockCreate.mockRejectedValue(new Error("DB connection lost"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw
    await expect(
      logAuditEvent({
        userId: 1,
        action: "view",
        entity: "patient",
        entityId: "p1",
      }),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("includes optional ip and userAgent when provided", async () => {
    mockCreate.mockResolvedValue({ id: "log-2" });

    await logAuditEvent({
      userId: 1,
      action: "update",
      entity: "appointment",
      entityId: "a5",
      ip: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    });

    const call = mockCreate.mock.calls[0][0];
    expect(call.data.ip).toBe("192.168.1.1");
    expect(call.data.user_agent).toBe("Mozilla/5.0");
  });
});

describe("Audit — module exports", () => {
  it("does NOT export update or delete functions", async () => {
    const auditModule = await import("@/lib/audit");
    const exportedNames = Object.keys(auditModule);

    expect(exportedNames).not.toContain("updateAuditEvent");
    expect(exportedNames).not.toContain("deleteAuditEvent");
    expect(exportedNames).not.toContain("updateAuditLog");
    expect(exportedNames).not.toContain("deleteAuditLog");
  });
});
