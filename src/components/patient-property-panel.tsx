"use client";

import { useState, useEffect } from "react";
import type { EntityConfig, FieldConfig } from "@/engine/schema-loader";
import { Linkify } from "@/components/linkify";

interface PatientPropertyPanelProps {
  entityName: string;
  entity: EntityConfig;
  patientId: number;
  patientName: string;
}

export function PatientPropertyPanel({
  entityName,
  entity,
  patientId,
  patientName,
}: PatientPropertyPanelProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/${entityName}`)
      .then((r) => r.json())
      .then((data: Record<string, unknown>[]) => {
        // Filter to this patient's records
        const filtered = data.filter(
          (item) =>
            (item.patientId ?? item.patient_id) === patientId
        );
        setItems(filtered);
      })
      .catch((err) => console.error(`Failed to load ${entityName}:`, err))
      .finally(() => setLoading(false));
  }, [entityName, patientId]);

  if (selectedItem) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-floating-border shrink-0">
          <button
            onClick={() => setSelectedItem(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-sm font-medium">Detail</span>
        </div>
        <div className="flex-1 overflow-auto p-3">
          <dl className="space-y-3">
            {Object.entries(entity.fields).map(([name, field]) => {
              const value = selectedItem[name] ?? selectedItem[toSnakeCase(name)];
              return (
                <div key={name}>
                  <dt className="text-xs font-medium text-muted-foreground capitalize">
                    {name.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm mt-0.5">
                    {formatValue(value, field)}
                  </dd>
                </div>
              );
            })}
            <div className="pt-2 border-t">
              <dt className="text-xs font-medium text-muted-foreground">Created</dt>
              <dd className="text-sm mt-0.5">
                {selectedItem.createdAt
                  ? new Date(String(selectedItem.createdAt)).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-floating-border text-xs text-muted-foreground shrink-0">
        {patientName}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No records
          </div>
        ) : (
          <div className="divide-y divide-floating-border">
            {items.map((item) => (
              <button
                key={item.id as number}
                onClick={() => setSelectedItem(item)}
                className="w-full text-left px-3 py-2.5 hover:bg-floating-muted transition-colors"
              >
                <PropertyRow entityName={entityName} entity={entity} item={item} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Count */}
      <div className="px-3 py-1.5 border-t border-floating-border text-xs text-muted-foreground shrink-0">
        {items.length} record{items.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function PropertyRow({
  entityName,
  entity,
  item,
}: {
  entityName: string;
  entity: EntityConfig;
  item: Record<string, unknown>;
}) {
  const fields = Object.entries(entity.fields);

  // Entity-specific display logic
  if (entityName === "referral") {
    return (
      <div>
        <div className="text-sm font-medium">{String(item.referring_gp ?? "")}</div>
        <div className="text-xs text-muted-foreground">
          {item.referral_date ? new Date(String(item.referral_date)).toLocaleDateString() : ""}
          {item.gp_practice ? ` — ${item.gp_practice}` : ""}
        </div>
      </div>
    );
  }

  if (entityName === "clinical_note" || entityName === "personal_note") {
    const date = item.date ? new Date(String(item.date)).toLocaleDateString() : "";
    const noteType = item.note_type
      ? String(item.note_type).replace(/_/g, " ")
      : null;
    const content = String(item.content ?? "").slice(0, 80);
    return (
      <div>
        <div className="text-sm font-medium">
          {date}
          {noteType && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">
              {noteType}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{content}</div>
      </div>
    );
  }

  if (entityName === "hearing_aid") {
    return (
      <div>
        <div className="text-sm font-medium">
          {String(item.ear ?? "").toUpperCase()} — {String(item.make ?? "")} {String(item.model ?? "")}
        </div>
        <div className="text-xs text-muted-foreground">
          S/N: {String(item.serial_number ?? "—")}
        </div>
      </div>
    );
  }

  if (entityName === "claim_item") {
    const status = String(item.status ?? "pending");
    return (
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            {String(item.item_number ?? "")} — {item.date_of_service ? new Date(String(item.date_of_service)).toLocaleDateString() : ""}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {String(item.description ?? "")}
          </div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
            status === "paid"
              ? "bg-emerald-500/15 text-emerald-400"
              : status === "rejected"
                ? "bg-red-500/15 text-red-400"
                : status === "claimed"
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {status}
        </span>
      </div>
    );
  }

  if (entityName === "attachment") {
    return (
      <div>
        <div className="text-sm font-medium">{String(item.filename ?? "—")}</div>
        <div className="text-xs text-muted-foreground">
          {item.category ? String(item.category).replace(/_/g, " ") : ""}
          {item.size_bytes ? ` — ${((item.size_bytes as number) / 1024).toFixed(1)} KB` : ""}
        </div>
      </div>
    );
  }

  // Fallback: show first two fields
  const title = fields[0] ? String(item[toSnakeCase(fields[0][0])] ?? "") : `#${item.id}`;
  const subtitle = fields[1] ? String(item[toSnakeCase(fields[1][0])] ?? "") : null;
  return (
    <div>
      <div className="text-sm font-medium truncate">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
    </div>
  );
}

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function formatValue(value: unknown, field: FieldConfig): React.ReactNode {
  if (value === null || value === undefined) return "—";
  if (field.type === "date" || field.type === "datetime") {
    return new Date(value as string).toLocaleDateString();
  }
  if (field.type === "enum") {
    return String(value).replace(/_/g, " ");
  }
  if (field.type === "number") {
    const num = Number(value);
    if (!isNaN(num)) return num.toLocaleString();
  }
  const str = String(value);
  return <Linkify>{str}</Linkify>;
}
