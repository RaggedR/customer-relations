"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { entityLabel, findReverseRelationKey, toSnakeCase, type SchemaConfig } from "@/lib/schema-client";
import { renderFieldValue, recordDisplayName } from "@/lib/renderers";

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
  onDelete?: (id: number) => void;
  onExport?: (id: number, format: string) => void;
  /** Navigate to a related entity (e.g. click nurse name in appointment detail) */
  onNavigateToRelated?: (entity: string, id: number, name: string) => void;
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
  onDelete,
  onExport,
  onNavigateToRelated,
}: EntityDetailPanelProps) {
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    const reverseKey = findReverseRelationKey(record, propEntity);
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
                  {renderFieldValue(value, field, "detail")}
                </span>
              </div>
            );
          })}
          {/* Clickable relation links (e.g. nurse, patient on appointment) */}
          {entityConfig.relations && onNavigateToRelated && Object.entries(entityConfig.relations).map(([relName, rel]) => {
            const relObj = record[relName] as Record<string, unknown> | undefined;
            if (!relObj || typeof relObj !== "object") return null;
            const relId = relObj.id as number;
            const relDisplayName = recordDisplayName(relObj, schema.entities[rel.entity]);
            return (
              <div key={relName} className="flex gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 w-28 text-right">
                  {relName.replace(/_/g, " ")}
                </span>
                <button
                  onClick={() => onNavigateToRelated(rel.entity, relId, relDisplayName)}
                  className="text-primary hover:text-primary/80 hover:underline transition-colors"
                >
                  {relDisplayName}
                </button>
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
                      onOpenProperty(propEntity, entityId, entityLabel(propEntity, schema))
                    }
                    className="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md hover:bg-floating-muted transition-colors"
                  >
                    <span>{entityLabel(propEntity, schema)}</span>
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
                  <span>{entityLabel(propEntity, schema)}</span>
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
            <div className={`text-[10px] ${uploadMsg === "Uploaded" ? "text-emerald-600" : "text-destructive"}`}>
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
        {hasFeature("delete") && onDelete && !confirmDelete && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        )}
        {confirmDelete && onDelete && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-destructive bg-destructive/10 border-destructive/40"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  const res = await fetch(`/api/${entityName}/${entityId}`, { method: "DELETE" });
                  if (res.ok) {
                    onDelete(entityId);
                  }
                } finally {
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
            >
              {deleting ? "..." : "Confirm delete"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </>
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
        {hasFeature("export-xlsx") && onExport && (
          <Button variant="outline" size="sm" className="flex-1 text-xs"
            onClick={() => onExport(entityId, "xlsx")}>
            Excel
          </Button>
        )}
      </div>
    </div>
  );
}