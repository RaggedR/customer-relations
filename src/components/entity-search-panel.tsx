"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EntityConfig, FieldConfig } from "@/engine/schema-loader";
import { fieldTypes } from "@/engine/field-types";
import { Linkify } from "@/components/linkify";

interface EntitySearchPanelProps {
  entityName: string;
  entity: EntityConfig;
  onItemSelect?: (id: number, name: string) => void;
}

export function EntitySearchPanel({ entityName, entity, onItemSelect }: EntitySearchPanelProps) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const enumFields = Object.entries(entity.fields).filter(
    ([, f]) => f.type === "enum" && f.values
  );

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);

    fetch(`/api/${entityName}${params.toString() ? `?${params}` : ""}`)
      .then((res) => res.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => console.error(`Failed to load ${entityName}:`, err))
      .finally(() => setLoading(false));
  }, [entityName, search]);

  useEffect(() => {
    const timeout = setTimeout(fetchItems, 200);
    return () => clearTimeout(timeout);
  }, [fetchItems]);

  // Client-side enum filtering
  const filtered = items.filter((item) => {
    for (const [field, value] of Object.entries(filters)) {
      if (value && item[field] !== value) return false;
    }
    return true;
  });

  if (selectedItem) {
    return (
      <DetailView
        entityName={entityName}
        entity={entity}
        item={selectedItem}
        onBack={() => setSelectedItem(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + filters */}
      <div className="p-3 space-y-2 border-b border-floating-border shrink-0">
        <Input
          placeholder={`Search ${entityName}s...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        {enumFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {enumFields.map(([name, field]) => (
              <select
                key={name}
                value={filters[name] || ""}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, [name]: e.target.value }))
                }
                className="h-7 rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">All {name.replace(/_/g, " ")}s</option>
                {field.values!.map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No {entityName}s found
          </div>
        ) : (
          <div className="divide-y divide-floating-border">
            {filtered.map((item) => (
              <ResultRow
                key={item.id as number}
                entityName={entityName}
                entity={entity}
                item={item}
                onClick={() => {
                  if (onItemSelect) {
                    const name = String(item.name ?? item[Object.keys(entity.fields)[0]] ?? `#${item.id}`);
                    onItemSelect(item.id as number, name);
                  } else {
                    setSelectedItem(item);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Count */}
      <div className="px-3 py-1.5 border-t border-floating-border text-xs text-muted-foreground shrink-0">
        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function ResultRow({
  entityName,
  entity,
  item,
  onClick,
}: {
  entityName: string;
  entity: EntityConfig;
  item: Record<string, unknown>;
  onClick: () => void;
}) {
  // Find the best display fields: first string/email field as title, second as subtitle
  const fieldEntries = Object.entries(entity.fields);
  const titleField = fieldEntries[0];
  const subtitleField = fieldEntries.find(
    ([, f]) => f.type === "email" || f.type === "string"
  );

  const title = titleField ? String(item[toSnakeCase(titleField[0])] ?? "") : `#${item.id}`;
  const subtitle =
    subtitleField && subtitleField[0] !== titleField?.[0]
      ? String(item[toSnakeCase(subtitleField[0])] ?? "")
      : null;

  // Find enum fields to show as badges
  const badges = fieldEntries
    .filter(([, f]) => f.type === "enum")
    .map(([name]) => ({
      name,
      value: item[toSnakeCase(name)] as string | null,
    }))
    .filter((b) => b.value);

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-floating-muted transition-colors flex items-center justify-between gap-2"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        )}
      </div>
      {badges.length > 0 && (
        <div className="flex gap-1 shrink-0">
          {badges.map((b) => (
            <span
              key={b.name}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                getStageBadgeClass(b.value!)
              )}
            >
              {b.value!.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function DetailView({
  entityName,
  entity,
  item,
  onBack,
}: {
  entityName: string;
  entity: EntityConfig;
  item: Record<string, unknown>;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Back bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-floating-border shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Button>
        <span className="text-sm font-medium capitalize">{entityName} Detail</span>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-auto p-3">
        <dl className="space-y-3">
          {Object.entries(entity.fields).map(([name, field]) => {
            const snakeKey = toSnakeCase(name);
            const value = item[name] ?? item[snakeKey];
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

          {/* Relations */}
          {Object.entries(entity.relations ?? {}).map(([relName]) => {
              const snakeKey = toSnakeCase(relName);
              const fkValue = item[`${snakeKey}Id`] ?? item[`${snakeKey}_id`];
              const relData = item[relName] ?? item[snakeKey];
              return (
                <div key={relName}>
                  <dt className="text-xs font-medium text-muted-foreground capitalize">
                    {relName.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm mt-0.5">
                    {relData && typeof relData === "object"
                      ? String((relData as Record<string, unknown>).name ?? JSON.stringify(relData))
                      : fkValue
                        ? `ID: ${String(fkValue)}`
                        : "—"}
                  </dd>
                </div>
              );
            })}

          {/* Reverse relations (arrays) */}
          <ReverseRelations item={item} />

          {/* Metadata */}
          <div className="pt-2 border-t">
            <dt className="text-xs font-medium text-muted-foreground">ID</dt>
            <dd className="text-sm mt-0.5">{String(item.id)}</dd>
          </div>
          {(item.createdAt != null || item.created_at != null) ? (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Created</dt>
              <dd className="text-sm mt-0.5">
                {new Date(String(item.createdAt ?? item.created_at)).toLocaleString()}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}

function ReverseRelations({ item }: { item: Record<string, unknown> }) {
  const entries = getArrayEntries(item);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([key, arr]) => (
        <div key={key}>
          <dt className="text-xs font-medium text-muted-foreground capitalize mb-1">
            {key.replace(/_/g, " ")} ({arr.length})
          </dt>
          {arr.length === 0 ? (
            <dd className="text-sm text-muted-foreground">None</dd>
          ) : (
            <dd className="space-y-1.5">
              {arr.map((relItem, i) => (
                <div
                  key={i}
                  className="text-xs bg-floating-muted rounded-md p-2 space-y-0.5"
                >
                  {Object.entries(relItem)
                    .filter(
                      ([k]) =>
                        !["id", "createdAt", "updatedAt", "created_at", "updated_at"].includes(k) &&
                        !k.endsWith("Id") &&
                        !k.endsWith("_id")
                    )
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-muted-foreground capitalize shrink-0">
                          {k.replace(/_/g, " ")}:
                        </span>
                        <span className="truncate">
                          {v === null
                            ? "—"
                            : typeof v === "string" && !isNaN(Date.parse(v)) && (k.includes("date") || k.includes("close"))
                              ? new Date(v).toLocaleDateString()
                              : <Linkify>{String(v).replace(/_/g, " ")}</Linkify>}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </dd>
          )}
        </div>
      ))}
    </>
  );
}

// --- Helpers ---

function getArrayEntries(
  item: Record<string, unknown>
): [string, Record<string, unknown>[]][] {
  const result: [string, Record<string, unknown>[]][] = [];
  for (const [key, val] of Object.entries(item)) {
    if (Array.isArray(val) && !key.startsWith("_")) {
      result.push([key, val as Record<string, unknown>[]]);
    }
  }
  return result;
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

function getStageBadgeClass(stage: string): string {
  switch (stage) {
    case "lead":
      return "bg-blue-500/15 text-blue-400";
    case "qualified":
      return "bg-indigo-500/15 text-indigo-400";
    case "proposal":
      return "bg-violet-500/15 text-violet-400";
    case "negotiation":
      return "bg-amber-500/15 text-amber-400";
    case "closed_won":
      return "bg-emerald-500/15 text-emerald-400";
    case "closed_lost":
      return "bg-red-500/15 text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}
