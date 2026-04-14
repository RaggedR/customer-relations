"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { EntityConfig } from "@/lib/schema";
import { foreignKeyName, toSnakeCase } from "@/lib/schema";
import { renderFieldValue, renderEntitySummary, recordDisplayName } from "@/lib/renderers";

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
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const enumFields = Object.entries(entity.fields).filter(
    ([, f]) => f.type === "enum" && f.values
  );

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    fetch(`/api/${entityName}?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data === "object" && "items" in data) {
          setItems(data.items);
          setTotalCount(data.totalCount ?? 0);
        } else {
          // Backward compat: plain array response (e.g. from non-factory routes)
          setItems(Array.isArray(data) ? data : []);
          setTotalCount(Array.isArray(data) ? data.length : 0);
        }
      })
      .catch((err) => console.error(`Failed to load ${entityName}:`, err))
      .finally(() => setLoading(false));
  }, [entityName, search, page]);

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
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="h-8 text-sm"
        />
        {enumFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {enumFields.map(([name, field]) => (
              <select
                key={name}
                value={filters[name] || ""}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, [name]: e.target.value }));
                  setPage(1);
                }}
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
                    onItemSelect(item.id as number, recordDisplayName(item, entity));
                  } else {
                    setSelectedItem(item);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="px-3 py-1.5 border-t border-floating-border text-xs text-muted-foreground shrink-0 flex items-center justify-between">
        <span>{totalCount} result{totalCount !== 1 ? "s" : ""}</span>
        {totalCount > pageSize && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </Button>
            <span>{page}/{Math.ceil(totalCount / pageSize)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(totalCount / pageSize)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 6 15 12 9 18" /></svg>
            </Button>
          </div>
        )}
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
  const summary = renderEntitySummary(entityName, item, entity);

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-floating-muted transition-colors flex items-center justify-between gap-2"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{summary.title}</div>
        {summary.subtitle && (
          <div className="text-xs text-muted-foreground truncate">{summary.subtitle}</div>
        )}
        {summary.summary && (
          <div className="text-xs text-muted-foreground truncate">{summary.summary}</div>
        )}
      </div>
      {summary.badge && (
        <div className="flex gap-1 shrink-0">
          {summary.badge}
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
                  {renderFieldValue(value, field, "list")}
                </dd>
              </div>
            );
          })}

          {/* Relations */}
          {Object.entries(entity.relations ?? {}).map(([relName]) => {
              const snakeKey = toSnakeCase(relName);
              const fkValue = item[foreignKeyName(snakeKey)] ?? item[`${snakeKey}_id`];
              const relData = item[relName] ?? item[snakeKey];
              return (
                <div key={relName}>
                  <dt className="text-xs font-medium text-muted-foreground capitalize">
                    {relName.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm mt-0.5">
                    {relData && typeof relData === "object"
                      ? recordDisplayName(relData as Record<string, unknown>)
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
                            : String(v).replace(/_/g, " ")}
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

