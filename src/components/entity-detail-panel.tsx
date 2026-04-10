"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Linkify } from "@/components/linkify";
import type { SchemaConfig, FieldConfig } from "@/engine/schema-loader";
import { entityLabel } from "@/lib/schema-hierarchy";

interface EntityDetailPanelProps {
  entityName: string;
  entityId: number;
  schema: SchemaConfig;
  properties: string[];
  parentKey: string;
  /** Features declared in navigation.yaml for this window type */
  features: string[];
  onOpenProperty: (entityName: string, parentId: number, label: string) => void;
  onEdit?: (id: number) => void;
  onExport?: (id: number, format: string) => void;
}

export function EntityDetailPanel({
  entityName,
  entityId,
  schema,
  properties,
  parentKey,
  features,
  onOpenProperty,
  onEdit,
  onExport,
}: EntityDetailPanelProps) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const hasFeature = (f: string) => features.includes(f);
  const hasAttachment = properties.includes("attachment");

  const entityConfig = schema.entities[entityName];

  useEffect(() => {
    setLoading(true);
    fetch(`/api/${entityName}/${entityId}`)
      .then((r) => r.json())
      .then((data) => setRecord(data))
      .catch((err) => console.error(`Failed to load ${entityName}:`, err))
      .finally(() => setLoading(false));
  }, [entityName, entityId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!record || !entityConfig) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Not found
      </div>
    );
  }

  // Precompute property counts
  const propertyCounts: Record<string, number> = {};
  for (const propEntity of properties) {
    const reverseKey = findReverseKey(record, propEntity);
    propertyCounts[propEntity] = reverseKey
      ? (record[reverseKey] as unknown[])?.length ?? 0
      : 0;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {/* Fields — compact key:value layout */}
        <div className="p-3 border-b border-floating-border space-y-1">
          {Object.entries(entityConfig.fields).map(([fieldName, field]) => {
            const value = record[fieldName] ?? record[toSnakeCase(fieldName)];
            if (value === null || value === undefined) return null;
            return (
              <div key={fieldName} className="flex gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 w-28 text-right">
                  {fieldName.replace(/_/g, " ")}
                </span>
                <span className="text-foreground">
                  {renderFieldValue(value, field)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Property links — only items with data are clickable */}
        {properties.length > 0 && (
          <div className="p-2 space-y-0.5 border-b border-floating-border">
            {properties.map((propEntity) => {
              const count = propertyCounts[propEntity];
              if (count > 0) {
                return (
                  <button
                    key={propEntity}
                    onClick={() =>
                      onOpenProperty(propEntity, entityId, entityLabel(propEntity))
                    }
                    className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md hover:bg-floating-muted transition-colors"
                  >
                    <span>{entityLabel(propEntity)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{count}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </button>
                );
              }
              return (
                <div
                  key={propEntity}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm text-muted-foreground opacity-50"
                >
                  <span>{entityLabel(propEntity)}</span>
                  <span className="text-xs">0</span>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Upload section */}
      {hasFeature("upload") && hasAttachment && (
        <div className="px-3 py-2 border-t border-floating-border space-y-2 shrink-0">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="text-xs w-full"
              />
            </div>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="referral_letter">Referral letter</option>
              <option value="test_result">Test result</option>
              <option value="clinical_document">Clinical doc</option>
              <option value="other">Other</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              className="text-xs shrink-0"
              disabled={!uploadFile || uploading}
              onClick={async () => {
                if (!uploadFile) return;
                setUploading(true);
                setUploadMsg("");
                try {
                  const fd = new FormData();
                  fd.append("file", uploadFile);
                  fd.append("patientId", String(entityId));
                  fd.append("category", uploadCategory);
                  const res = await fetch("/api/attachments/upload", { method: "POST", body: fd });
                  if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
                  setUploadMsg("Uploaded");
                  setUploadFile(null);
                  // Refresh record to update attachment count
                  const updated = await fetch(`/api/${entityName}/${entityId}`).then(r => r.json());
                  setRecord(updated);
                } catch (err) {
                  setUploadMsg((err as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            >
              {uploading ? "..." : "Upload"}
            </Button>
          </div>
          {uploadMsg && (
            <div className={`text-[10px] ${uploadMsg === "Uploaded" ? "text-emerald-400" : "text-destructive"}`}>
              {uploadMsg}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-3 border-t border-floating-border flex gap-2 shrink-0">
        {hasFeature("edit") && onEdit && (
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onEdit(entityId)}>
            Edit
          </Button>
        )}
        {hasFeature("export-pdf") && onExport && (
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onExport(entityId, "pdf")}>
            PDF
          </Button>
        )}
        {hasFeature("export-json") && onExport && (
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => onExport(entityId, "json")}>
            JSON
          </Button>
        )}
        {hasFeature("export-xlsx") && (
          <Button variant="outline" size="sm" className="flex-1 text-xs"
            onClick={() => window.open("/api/hearing-aid/export?format=xlsx", "_blank")}>
            HA Excel
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Inline property summaries ---

function PropertySummary({
  entityName,
  items,
  schema,
  parentEntityName,
  parentId,
}: {
  entityName: string;
  items: Record<string, unknown>[];
  schema: SchemaConfig;
  parentEntityName: string;
  parentId: number;
}) {
  const propConfig = schema.entities[entityName];
  if (!propConfig) return null;
  const fields = Object.entries(propConfig.fields);

  return (
    <div>
      <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        {entityLabel(entityName)} ({items.length})
      </h4>
      <div className="space-y-1.5">
        {items.slice(0, 5).map((item, idx) => (
          <div
            key={idx}
            className="text-xs bg-floating-muted rounded-md p-2 space-y-0.5"
          >
            {renderInlineItem(entityName, item, fields)}
          </div>
        ))}
        {items.length > 5 && (
          <div className="text-[10px] text-muted-foreground px-2">
            + {items.length - 5} more
          </div>
        )}
      </div>
    </div>
  );
}

function renderInlineItem(
  entityName: string,
  item: Record<string, unknown>,
  fields: [string, FieldConfig][]
): React.ReactNode {
  // Hearing aids: show device-specific layout
  if (entityName === "hearing_aid") {
    return (
      <>
        <div className="font-medium">
          {String(item.ear ?? "").toUpperCase()} — {String(item.make ?? "")} {String(item.model ?? "")}
        </div>
        {item.serial_number && <div>S/N: {String(item.serial_number)}</div>}
        {item.battery_type && <div>Battery: {String(item.battery_type)}</div>}
        {item.wax_filter && <div>Wax filter: {String(item.wax_filter)}</div>}
        {item.dome && <div>Dome: {String(item.dome)}</div>}
        {item.programming_cable && <div>Cable: {String(item.programming_cable)}</div>}
        {item.programming_software && <div>Software: {String(item.programming_software)}</div>}
        {item.hsp_code && <div>HSP: {String(item.hsp_code)}</div>}
        {item.warranty_end_date && (
          <div>Warranty: {new Date(String(item.warranty_end_date)).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</div>
        )}
        {item.last_repair_details && <div>Last repair: {String(item.last_repair_details)}</div>}
        {item.repair_address && <div>Repair to: {String(item.repair_address)}</div>}
      </>
    );
  }

  // Clinical notes: date + type + content preview
  if (entityName === "clinical_note") {
    const date = item.date ? new Date(String(item.date)).toLocaleDateString() : "";
    const noteType = item.note_type ? String(item.note_type).replace(/_/g, " ") : "";
    return (
      <>
        <div className="font-medium">
          {date}
          {noteType && (
            <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
              {noteType}
            </span>
          )}
        </div>
        <div className="text-muted-foreground truncate">{String(item.content ?? "").slice(0, 100)}</div>
      </>
    );
  }

  // Personal notes: date + content preview
  if (entityName === "personal_note") {
    const date = item.date ? new Date(String(item.date)).toLocaleDateString() : "";
    return (
      <>
        <div className="font-medium">{date}</div>
        <div className="text-muted-foreground">{String(item.content ?? "").slice(0, 120)}</div>
      </>
    );
  }

  // Claim items: item number + date + status
  if (entityName === "claim_item") {
    const status = String(item.status ?? "pending");
    return (
      <div className="flex justify-between">
        <div>
          <span className="font-medium">{String(item.item_number ?? "")}</span>
          {" — "}
          {item.date_of_service ? new Date(String(item.date_of_service)).toLocaleDateString() : ""}
        </div>
        <span className={`text-[9px] px-1 py-0.5 rounded-full font-medium ${
          status === "paid" ? "bg-emerald-500/15 text-emerald-400"
            : status === "rejected" ? "bg-red-500/15 text-red-400"
            : status === "claimed" ? "bg-blue-500/15 text-blue-400"
            : "bg-amber-500/15 text-amber-400"
        }`}>
          {status}
        </span>
      </div>
    );
  }

  // Attachments: filename + download link
  if (entityName === "attachment") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{String(item.filename ?? "—")}</span>
          {item.category ? ` — ${String(item.category).replace(/_/g, " ")}` : ""}
        </div>
        <a
          href={`/api/attachments/${item.id}/download`}
          className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
        >
          Download
        </a>
      </div>
    );
  }

  // Fallback: show first two non-null fields
  const display = fields
    .map(([name]) => {
      const val = item[name] ?? item[toSnakeCase(name)];
      return val != null ? { name, val: String(val) } : null;
    })
    .filter(Boolean)
    .slice(0, 2);

  return (
    <>
      {display.map((d, i) => (
        <div key={i}>
          <span className="text-muted-foreground">{d!.name.replace(/_/g, " ")}: </span>
          {d!.val}
        </div>
      ))}
    </>
  );
}

// --- Helpers ---

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function findReverseKey(
  record: Record<string, unknown>,
  propEntity: string
): string | null {
  const candidates = [
    `${propEntity}s`,
    propEntity.replace(/_/g, "") + "s",
    propEntity,
  ];
  for (const key of candidates) {
    if (Array.isArray(record[key])) return key;
  }
  for (const [key, val] of Object.entries(record)) {
    if (Array.isArray(val) && key.toLowerCase().includes(propEntity.replace(/_/g, ""))) {
      return key;
    }
  }
  return null;
}

function renderFieldValue(value: unknown, field: FieldConfig): React.ReactNode {
  if (value === null || value === undefined) return "—";
  if (field.type === "date" || field.type === "datetime") {
    return new Date(value as string).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (field.type === "enum") {
    const str = String(value).replace(/_/g, " ");
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-400">
        {str}
      </span>
    );
  }
  if (field.type === "number") {
    const num = Number(value);
    if (!isNaN(num)) return num.toLocaleString();
  }
  return <Linkify>{String(value)}</Linkify>;
}
