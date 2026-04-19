/**
 * Nurse Portal — Patient Records List (Pseudonymised)
 *
 * GET /api/nurse/records
 *
 * Returns a list of patients who have appointments assigned to this nurse.
 * PRIVACY: Patients are identified by number only (Patient #N), never by name.
 * This ensures a leaked screenshot of this list cannot identify patients.
 */

import { NextResponse } from "next/server";
import { nurseRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const GET = nurseRoute()
  .named("GET /api/nurse/records")
  .handle(async (ctx) => {
    // Find all distinct patients with appointments assigned to this nurse
    const appointments = await prisma.appointment.findMany({
      where: { nurseId: ctx.nurse.id },
      select: { patientId: true },
      distinct: ["patientId"],
    });

    const patientIds = appointments
      .map((a) => a.patientId)
      .filter((id): id is number => id !== null);

    // Count notes per patient for the summary
    const [clinicalCounts, personalCounts] = await Promise.all([
      prisma.clinicalNote.groupBy({
        by: ["patientId"],
        where: { patientId: { in: patientIds } },
        _count: true,
      }),
      prisma.personalNote.groupBy({
        by: ["patientId"],
        where: { patientId: { in: patientIds } },
        _count: true,
      }),
    ]);

    const clinicalMap = new Map(clinicalCounts.map((c) => [c.patientId, c._count]));
    const personalMap = new Map(personalCounts.map((c) => [c.patientId, c._count]));

    const patients = patientIds.map((id) => ({
      patientRef: `Patient #${id}`,
      patientId: id,
      noteCount: (clinicalMap.get(id) ?? 0) + (personalMap.get(id) ?? 0),
    }));

    return NextResponse.json({ patients });
  });
