/**
 * Patient Export API
 *
 * GET /api/patient/:id/export?format=json|pdf
 *
 * Exports a patient's complete record: demographics, referrals,
 * clinical notes, personal notes, hearing aids, claim items,
 * and attachment metadata.
 *
 * JSON: full structured data
 * PDF: clinical-letter-style summary for GP correspondence
 */

import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-helpers";
import { logAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadPatient(id: number) {
  return prisma.patient.findUnique({
    where: { id },
    include: {
      referrals: { orderBy: { referral_date: "desc" } },
      clinical_notes: { orderBy: { date: "desc" } },
      personal_notes: { orderBy: { date: "desc" } },
      hearing_aids: true,
      claim_items: { orderBy: { date_of_service: "desc" } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
}

type PatientData = NonNullable<Awaited<ReturnType<typeof loadPatient>>>;

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function generatePdf(patient: PatientData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const grey = "#666666";
    const dark = "#1a1a1a";

    // ─── Header ──────────────────────────────────────
    doc.fontSize(18).fillColor(dark).text("Patient Summary", { align: "center" });
    doc.fontSize(9).fillColor(grey).text(`Generated ${fmtDate(new Date())}`, { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(0.5);

    // ─── Demographics ────────────────────────────────
    sectionHeading(doc, "Patient Details");
    const dob = fmtDate(patient.date_of_birth);
    const age = patient.date_of_birth
      ? `${Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / 31557600000)} yrs`
      : "";
    fieldRow(doc, "Name", patient.name);
    fieldRow(doc, "Date of Birth", age ? `${dob} (${age})` : dob);
    fieldRow(doc, "Medicare", patient.medicare_number ?? "—");
    fieldRow(doc, "Phone", patient.phone ?? "—");
    fieldRow(doc, "Email", patient.email ?? "—");
    fieldRow(doc, "Address", patient.address ?? "—");
    fieldRow(doc, "Status", (patient.status ?? "active").replace(/_/g, " "));
    if (patient.maintenance_plan_expiry) {
      fieldRow(doc, "Plan Expiry", fmtDate(patient.maintenance_plan_expiry));
    }
    doc.moveDown(0.3);

    // ─── Current Referral ────────────────────────────
    const activeReferral = patient.referrals.find(
      (r) => !r.expiry_date || new Date(r.expiry_date) > new Date()
    );
    if (activeReferral) {
      sectionHeading(doc, "Current Referral");
      fieldRow(doc, "Referring GP", activeReferral.referring_gp);
      fieldRow(doc, "Practice", activeReferral.gp_practice ?? "—");
      fieldRow(doc, "Referral Date", fmtDate(activeReferral.referral_date));
      fieldRow(doc, "Expiry", fmtDate(activeReferral.expiry_date));
      if (activeReferral.reason) {
        fieldRow(doc, "Reason", activeReferral.reason);
      }
      doc.moveDown(0.3);
    }

    // ─── Hearing Aids ────────────────────────────────
    if (patient.hearing_aids.length > 0) {
      sectionHeading(doc, "Hearing Aids");
      for (const ha of patient.hearing_aids) {
        doc
          .fontSize(10)
          .fillColor(dark)
          .text(
            `${(ha.ear ?? "").toUpperCase()} — ${ha.make ?? ""} ${ha.model ?? ""}`,
            { continued: false }
          );
        doc.fontSize(8).fillColor(grey);
        if (ha.serial_number) doc.text(`  Serial: ${ha.serial_number}`);
        if (ha.battery_type) doc.text(`  Battery: ${ha.battery_type}`);
        if (ha.dome) doc.text(`  Dome: ${ha.dome}`);
        if (ha.wax_filter) doc.text(`  Wax filter: ${ha.wax_filter}`);
        if (ha.hsp_code) doc.text(`  HSP: ${ha.hsp_code}`);
        if (ha.warranty_end_date) doc.text(`  Warranty until: ${fmtDate(ha.warranty_end_date)}`);
        doc.moveDown(0.3);
      }
    }

    // ─── Recent Clinical Notes (last 5) ──────────────
    const recentNotes = patient.clinical_notes.slice(0, 5);
    if (recentNotes.length > 0) {
      sectionHeading(doc, `Clinical Notes (${patient.clinical_notes.length} total, showing ${recentNotes.length} most recent)`);
      for (const note of recentNotes) {
        const typeLabel = (note.note_type ?? "note").replace(/_/g, " ");
        doc
          .fontSize(9)
          .fillColor(dark)
          .text(`${fmtDate(note.date)} — ${typeLabel}${note.clinician ? ` (${note.clinician})` : ""}`, {
            underline: true,
          });
        doc
          .fontSize(8)
          .fillColor(grey)
          .text(note.content, { indent: 10 });
        doc.moveDown(0.4);

        // Page break safety
        if (doc.y > 700) {
          doc.addPage();
        }
      }
    }

    // ─── Claim Summary ───────────────────────────────
    if (patient.claim_items.length > 0) {
      sectionHeading(doc, "Claim Summary");
      const byStatus: Record<string, { count: number; total: number }> = {};
      for (const ci of patient.claim_items) {
        const s = ci.status ?? "pending";
        if (!byStatus[s]) byStatus[s] = { count: 0, total: 0 };
        byStatus[s].count++;
        byStatus[s].total += ci.amount ?? 0;
      }
      for (const [status, { count, total }] of Object.entries(byStatus)) {
        doc
          .fontSize(9)
          .fillColor(dark)
          .text(`${status}: ${count} items — $${total.toFixed(2)}`);
      }
      doc.moveDown(0.3);
    }

    // ─── Footer ──────────────────────────────────────
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(0.3);
    doc.fontSize(7).fillColor(grey).text("Confidential patient record. Not for distribution without consent.", { align: "center" });

    doc.end();
  });
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.2);
  doc.fontSize(12).fillColor("#1e40af").text(title);
  doc.moveDown(0.2);
}

function fieldRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fontSize(9).fillColor("#666666").text(`${label}: `, { continued: true });
  doc.fillColor("#1a1a1a").text(value);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const format =
    request.nextUrl.searchParams.get("format")?.toLowerCase() || "json";

  if (!["json", "pdf"].includes(format)) {
    return NextResponse.json(
      { error: "format must be json or pdf" },
      { status: 400 }
    );
  }

  return withErrorHandler(`GET /api/patient/${numId}/export`, async () => {
    const patient = await loadPatient(numId);

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Audit: log patient data export (fire-and-forget)
    const session = await getSessionUser(request);
    logAuditEvent({
      userId: session?.userId ?? null,
      action: "export",
      entity: "patient",
      entityId: String(numId),
      details: `format=${format}`,
      ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    const safeName = patient.name.replace(/\s+/g, "-").toLowerCase();
    const dateStr = new Date().toISOString().split("T")[0];

    if (format === "pdf") {
      const buffer = await generatePdf(patient);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="patient-${safeName}-${dateStr}.pdf"`,
          "Content-Length": String(buffer.length),
        },
      });
    }

    // JSON export
    const sanitisedAttachments = patient.attachments.map(
      ({ storage_path, ...rest }) => ({
        ...rest,
        download_url: `/api/attachments/${rest.id}/download`,
      })
    );

    const exportData = {
      exported_at: new Date().toISOString(),
      patient: {
        id: patient.id,
        name: patient.name,
        date_of_birth: patient.date_of_birth,
        medicare_number: patient.medicare_number,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        status: patient.status,
        maintenance_plan_expiry: patient.maintenance_plan_expiry,
        notes: patient.notes,
        created_at: patient.createdAt,
      },
      referrals: patient.referrals,
      clinical_notes: patient.clinical_notes,
      personal_notes: patient.personal_notes,
      hearing_aids: patient.hearing_aids,
      claim_items: patient.claim_items,
      attachments: sanitisedAttachments,
    };

    return NextResponse.json(exportData, {
      headers: {
        "Content-Disposition": `attachment; filename="patient-${safeName}-${dateStr}.json"`,
      },
    });
  });
}
