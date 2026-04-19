"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toSnakeCase, type EntityConfig } from "@/lib/schema-client";
import { renderFieldValue, renderEntitySummary } from "@/lib/renderers";

interface PropertyPanelProps {
  entityName: string;
  entity: EntityConfig;
  parentId: number;
  parentName: string;
  parentKey: string;
  features?: string[];
}

const NOTE_ENTITIES = new Set(["clinical_note", "personal_note"]);
const AUTO_CLOSE_MS = 5 * 60 * 1000;

const NOTE_TYPE_LABELS: Record<string, string> = {
  initial_assessment: "Initial Assessment",
  progress_note: "Progress Note",
  discharge_summary: "Discharge Summary",
  treatment_plan: "Treatment Plan",
  personal_note: "Personal Note",
};

interface WatermarkedNote {
  id: number;
  date: string;
  noteType: string;
  clinician: string | null;
  imageDataUri: string;
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

  // Watermarked notes state (for clinical_note and personal_note)
  const isNoteEntity = NOTE_ENTITIES.has(entityName);
  const [notesVisible, setNotesVisible] = useState(false);
  const [notes, setNotes] = useState<WatermarkedNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const closeNotes = useCallback(() => {
    setNotesVisible(false);
    setNotes([]);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    closeTimerRef.current = null;
    countdownRef.current = null;
    setRemainingSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Load data on mount: notes auto-show, other entities fetch list
  useEffect(() => {
    if (isNoteEntity) {
      // Load notes directly — don't go through handleShowNotes (which toggles)
      let cancelled = false;
      setNotesLoading(true);
      fetch(`/api/admin/notes/${parentId}`)
        .then((r) => { if (!r.ok) throw new Error("Failed to load notes"); return r.json(); })
        .then((data) => {
          if (cancelled) return;
          const filtered = entityName === "clinical_note"
            ? data.notes.filter((n: WatermarkedNote) => n.noteType !== "personal_note")
            : data.notes.filter((n: WatermarkedNote) => n.noteType === "personal_note");
          setNotes(filtered);
          setNotesVisible(true);
          setRemainingSeconds(AUTO_CLOSE_MS / 1000);
          closeTimerRef.current = setTimeout(closeNotes, AUTO_CLOSE_MS);
          countdownRef.current = setInterval(() => {
            setRemainingSeconds((prev) => prev <= 1 ? 0 : prev - 1);
          }, 1000);
        })
        .catch((err) => console.error("Failed to load notes:", err))
        .finally(() => { if (!cancelled) setNotesLoading(false); });
      return () => { cancelled = true; };
    }
    setLoading(true);
    fetch(`/api/${entityName}?${parentKey}=${parentId}`)
      .then((r) => r.json())
      .then((data: Record<string, unknown>[]) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(`Failed to load ${entityName}:`, err))
      .finally(() => setLoading(false));
  }, [entityName, parentId, parentKey, isNoteEntity]);

  async function handleShowNotes() {
    if (notesVisible) { closeNotes(); return; }
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/admin/notes/${parentId}`);
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      // Filter to only the note type matching this entity
      const filtered = entityName === "clinical_note"
        ? data.notes.filter((n: WatermarkedNote) => n.noteType !== "personal_note")
        : data.notes.filter((n: WatermarkedNote) => n.noteType === "personal_note");
      setNotes(filtered);
      setNotesVisible(true);
      setRemainingSeconds(AUTO_CLOSE_MS / 1000);
      closeTimerRef.current = setTimeout(closeNotes, AUTO_CLOSE_MS);
      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => prev <= 1 ? 0 : prev - 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setNotesLoading(false);
    }
  }

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Render watermarked notes view for clinical_note / personal_note
  if (isNoteEntity) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-floating-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">Patient #{parentId}</span>
          <div className="flex items-center gap-3">
            {notesVisible && remainingSeconds > 0 && (
              <span className="text-xs text-amber-400 font-mono">{formatCountdown(remainingSeconds)}</span>
            )}
            <button
              onClick={handleShowNotes}
              disabled={notesLoading}
              className={`text-[10px] font-medium px-2 py-1 rounded transition-colors ${
                notesVisible
                  ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              } disabled:opacity-50`}
            >
              {notesLoading ? "Loading..." : notesVisible ? "Hide Notes" : "Show Notes"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {!notesVisible && !notesLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Notes hidden. Click &quot;Show Notes&quot; to view.
            </div>
          )}
          {notesLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading notes...
            </div>
          )}

          {notesVisible && notes.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No notes recorded.</div>
          )}

          {notesVisible && notes.length > 0 && (
            <div
              className="p-3 space-y-4"
              style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {notes.map((note) => (
                <div key={`${note.noteType}-${note.id}`} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {NOTE_TYPE_LABELS[note.noteType] ?? note.noteType}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(note.date).toLocaleDateString("en-AU")}
                      {note.clinician && ` — ${note.clinician}`}
                    </span>
                  </div>
                  <img
                    src={note.imageDataUri}
                    alt="Note (watermarked)"
                    className="w-full rounded border border-border"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

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
