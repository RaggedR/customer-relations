/**
 * Public — Available Specialties
 *
 * GET /api/nurse-specialties
 *
 * Returns distinct specialty names from the nurse_specialty table.
 * Public endpoint — no auth required. Used by patient booking form.
 */

import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/middleware";
import { prisma } from "@/lib/prisma";

export const GET = publicRoute()
  .named("GET /api/nurse-specialties")
  .handle(async () => {
    const records = await prisma.nurseSpecialty.findMany({
      select: { specialty: true },
      distinct: ["specialty"],
      orderBy: { specialty: "asc" },
    });

    return NextResponse.json({
      specialties: records.map((r) => r.specialty),
    });
  });
