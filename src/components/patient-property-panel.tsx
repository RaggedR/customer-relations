"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { EntityConfig } from "@/lib/schema";
import { toSnakeCase } from "@/lib/schema";
import { renderFieldValue, renderEntitySummary } from "@/lib/renderers";

interface PropertyPanelProps {
  entityName: string;
  entity: EntityConfig;
  parentId: number;
  parentName: string;
  parentKey: string;
  features?: string[];
}

export function PropertyPanel({
  entityName,
  entity,
  parentId,
  parentName,
  parentKey,
  features = [],
}: PropertyPanelProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/${entityName}?${parentKey}=${parentId}`)
      .then((r) => r.json())
      .then((data: Record<string, unknown>[]) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(`Failed to load ${entityName}:`, err))
      .finally(() => setLoading(false));
  }, [entityName, parentId, parentKey]);

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
                    {renderFieldValue(value, field, "list")}
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
        {parentName}
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

      {/* Footer: count + export */}
      <div className="px-3 py-1.5 border-t border-floating-border flex items-center justify-between shrink-0">
        <span className="text-xs text-muted-foreground">
          {items.length} record{items.length !== 1 ? "s" : ""}
        </span>
        {features.includes("export-xlsx") && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2"
              onClick={() => window.open(`/api/${entityName}/export?format=xlsx`, "_blank")}>
              Excel
            </Button>
            <Button variant="outline" size="sm" className="text-[10px] h-6 px-2"
              onClick={() => window.open(`/api/${entityName}/export?format=csv`, "_blank")}>
              CSV
            </Button>
          </div>
        )}
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
  const summary = renderEntitySummary(entityName, item, entity);

  return (
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {summary.title}
          {summary.badge && <span className="ml-2">{summary.badge}</span>}
        </div>
        {summary.subtitle && (
          <div className="text-xs text-muted-foreground truncate">{summary.subtitle}</div>
        )}
        {summary.summary && (
          <div className="text-xs text-muted-foreground truncate">{summary.summary}</div>
        )}
      </div>
      {summary.actions?.map((action, i) => (
        <a
          key={i}
          href={action.href}
          className="text-[10px] px-2 py-1 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {action.label}
        </a>
      ))}
    </div>
  );
}
