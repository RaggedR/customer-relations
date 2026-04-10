"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface PatientRecord {
  id: number;
  name: string;
  date_of_birth: string | null;
  medicare_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string | null;
  maintenance_plan_expiry: string | null;
  notes: string | null;
  referrals: unknown[];
  clinical_notes: unknown[];
  personal_notes: unknown[];
  hearing_aids: unknown[];
  claim_items: unknown[];
  attachments: unknown[];
}

const PROPERTY_SECTIONS: {
  key: keyof Pick<
    PatientRecord,
    "referrals" | "clinical_notes" | "personal_notes" | "hearing_aids" | "claim_items" | "attachments"
  >;
  label: string;
  entityName: string;
  icon: string;
}[] = [
  {
    key: "referrals",
    label: "Referrals",
    entityName: "referral",
    icon: "M9 5H2v14h7M15 5h7v14h-7M12 5v14",
  },
  {
    key: "clinical_notes",
    label: "Clinical Notes",
    entityName: "clinical_note",
    icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  },
  {
    key: "personal_notes",
    label: "Personal Notes",
    entityName: "personal_note",
    icon: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
  },
  {
    key: "hearing_aids",
    label: "Hearing Aids",
    entityName: "hearing_aid",
    icon: "M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z",
  },
  {
    key: "claim_items",
    label: "Claim Items",
    entityName: "claim_item",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
  },
  {
    key: "attachments",
    label: "Attachments",
    entityName: "attachment",
    icon: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  },
];

interface PatientDetailPanelProps {
  patientId: number;
  onOpenProperty: (entityName: string, patientId: number, label: string) => void;
  onEditPatient: (patientId: number) => void;
  onExportPatient: (patientId: number, format: string) => void;
}

export function PatientDetailPanel({
  patientId,
  onOpenProperty,
  onEditPatient,
  onExportPatient,
}: PatientDetailPanelProps) {
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/patient/${patientId}`)
      .then((r) => r.json())
      .then((data) => setPatient(data))
      .catch((err) => console.error("Failed to load patient:", err))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Patient not found
      </div>
    );
  }

  const age = patient.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(patient.date_of_birth).getTime()) / 31557600000
      )
    : null;

  const planExpiry = patient.maintenance_plan_expiry
    ? new Date(patient.maintenance_plan_expiry)
    : null;
  const planExpiringSoon =
    planExpiry && planExpiry.getTime() - Date.now() < 30 * 86400000;

  return (
    <div className="flex flex-col h-full">
      {/* Patient header */}
      <div className="p-4 border-b border-floating-border space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">{patient.name}</h2>
            <div className="text-xs text-muted-foreground space-x-3">
              {age !== null && <span>{age} yrs</span>}
              {patient.medicare_number && (
                <span>Medicare: {patient.medicare_number}</span>
              )}
            </div>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              patient.status === "active"
                ? "bg-emerald-500/15 text-emerald-400"
                : patient.status === "discharged"
                  ? "bg-red-500/15 text-red-400"
                  : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {patient.status}
          </span>
        </div>

        {/* Contact info */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          {patient.phone && <div>{patient.phone}</div>}
          {patient.email && <div>{patient.email}</div>}
          {patient.address && (
            <div className="truncate">{patient.address}</div>
          )}
        </div>

        {/* Plan expiry warning */}
        {planExpiry && (
          <div
            className={`text-xs px-2 py-1 rounded ${
              planExpiringSoon
                ? "bg-amber-500/15 text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            Plan expires: {planExpiry.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            {planExpiringSoon && " — expiring soon"}
          </div>
        )}
      </div>

      {/* Property sections */}
      <div className="flex-1 overflow-auto">
        <div className="p-2 space-y-0.5">
          {PROPERTY_SECTIONS.map((section) => {
            const count = (patient[section.key] as unknown[])?.length ?? 0;
            return (
              <button
                key={section.key}
                onClick={() =>
                  onOpenProperty(section.entityName, patientId, section.label)
                }
                className="flex items-center justify-between w-full px-3 py-2.5 text-sm rounded-md hover:bg-floating-muted transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground"
                  >
                    <path d={section.icon} />
                  </svg>
                  <span>{section.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{count}</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-floating-border flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onEditPatient(patientId)}
        >
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onExportPatient(patientId, "pdf")}
        >
          Export PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onExportPatient(patientId, "json")}
        >
          Export JSON
        </Button>
      </div>
    </div>
  );
}
