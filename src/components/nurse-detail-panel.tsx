"use client";

import { useState, useEffect } from "react";

interface NurseRecord {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  registration_number: string | null;
  notes: string | null;
  nurse_specialtys: unknown[];
}

const PROPERTY_SECTIONS = [
  {
    key: "nurse_specialtys" as const,
    label: "Specialties",
    entityName: "nurse_specialty",
    icon: "M22 12h-4l-3 9L9 3l-3 9H2",
  },
];

interface NurseDetailPanelProps {
  nurseId: number;
  onOpenProperty: (entityName: string, nurseId: number, label: string) => void;
}

export function NurseDetailPanel({
  nurseId,
  onOpenProperty,
}: NurseDetailPanelProps) {
  const [nurse, setNurse] = useState<NurseRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/nurse/${nurseId}`)
      .then((r) => r.json())
      .then((data) => setNurse(data))
      .catch((err) => console.error("Failed to load nurse:", err))
      .finally(() => setLoading(false));
  }, [nurseId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!nurse) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Nurse not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Nurse header */}
      <div className="p-4 border-b border-floating-border space-y-2">
        <h2 className="text-base font-semibold">{nurse.name}</h2>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {nurse.phone && <div>{nurse.phone}</div>}
          {nurse.email && <div>{nurse.email}</div>}
          {nurse.registration_number && (
            <div>AHPRA: {nurse.registration_number}</div>
          )}
        </div>
        {nurse.notes && (
          <div className="text-xs text-muted-foreground mt-1">
            {nurse.notes}
          </div>
        )}
      </div>

      {/* Property sections */}
      <div className="flex-1 overflow-auto">
        <div className="p-2 space-y-0.5">
          {PROPERTY_SECTIONS.map((section) => {
            const count = (nurse[section.key] as unknown[])?.length ?? 0;
            return (
              <button
                key={section.key}
                onClick={() =>
                  onOpenProperty(section.entityName, nurseId, section.label)
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
    </div>
  );
}
