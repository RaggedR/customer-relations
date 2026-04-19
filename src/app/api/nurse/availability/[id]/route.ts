/**
 * Nurse Portal — Delete Availability Slot
 *
 * DELETE /api/nurse/availability/:id
 *
 * Removes an availability slot. Only the owning nurse can delete their own slots.
 */

import { NextResponse } from "next/server";
import { nurseIdRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const DELETE = nurseIdRoute()
  .named("DELETE /api/nurse/availability/[id]")
  .handle(async (ctx) => {
    const slot = await prisma.nurseAvailability.findUnique({
      where: { id: ctx.entityId },
    });

    if (!slot || slot.nurseId !== ctx.nurse.id) {
      return NextResponse.json(
        { error: "Slot not found" },
        { status: 404 },
      );
    }

    await prisma.nurseAvailability.delete({
      where: { id: ctx.entityId },
    });

    return NextResponse.json({ success: true });
  });
