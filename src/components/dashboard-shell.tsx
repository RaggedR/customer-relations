"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { AddContactDialog } from "@/components/add-contact-dialog";
import { FloatingWindow } from "@/components/floating-window";
import { EntitySearchPanel } from "@/components/entity-search-panel";
import { AiChatPanel, type ChartConfig } from "@/components/ai-chat-panel";
import { ChartDisplay } from "@/components/chart-display";
import type { SchemaConfig } from "@/engine/schema-loader";

interface OpenWindow {
  id: string;
  type: "entity" | "ai";
  entityName?: string;
  zIndex: number;
}

const WINDOW_OFFSET = 30;

export function DashboardShell({ children }: { children?: React.ReactNode }) {
  const [schema, setSchema] = useState<SchemaConfig | null>(null);
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  const [nextZ, setNextZ] = useState(9000);
  const [chart, setChart] = useState<ChartConfig | null>(null);

  useEffect(() => {
    fetch("/api/schema")
      .then((res) => res.json())
      .then((data: SchemaConfig) => setSchema(data))
      .catch((err) => console.error("Failed to load schema:", err));
  }, []);

  const entities = schema ? Object.keys(schema.entities) : [];
  const contactEntity = schema?.entities.contact;

  const openWindow = useCallback(
    (id: string, type: "entity" | "ai", entityName?: string) => {
      const existing = openWindows.find((w) => w.id === id);
      if (existing) {
        setOpenWindows((prev) =>
          prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
        );
        setNextZ((z) => z + 1);
      } else {
        const count = openWindows.length;
        setOpenWindows((prev) => [
          ...prev,
          { id, type, entityName, zIndex: nextZ },
        ]);
        setNextZ((z) => z + 1);
      }
    },
    [openWindows, nextZ]
  );

  const handleEntitySelect = useCallback(
    (entityName: string) => openWindow(`entity-${entityName}`, "entity", entityName),
    [openWindow]
  );

  const handleOpenAiChat = useCallback(
    () => openWindow("ai-chat", "ai"),
    [openWindow]
  );

  const handleCloseWindow = useCallback((id: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleFocusWindow = useCallback(
    (id: string) => {
      setOpenWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
      );
      setNextZ((z) => z + 1);
    },
    [nextZ]
  );

  async function handleCreateContact(data: Record<string, unknown>) {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.errors?.join(", ") || json.error || "Failed to create contact");
    }
  }

  const activeEntity = openWindows.length > 0
    ? (() => {
        const top = openWindows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
        return top.entityName ?? null;
      })()
    : null;

  const pluralize = (name: string) =>
    name === "company" ? "Companies" : `${name.charAt(0).toUpperCase()}${name.slice(1)}s`;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        entities={entities}
        activeEntity={activeEntity}
        onEntitySelect={handleEntitySelect}
        actions={
          <div className="space-y-1.5">
            {contactEntity && (
              <AddContactDialog
                entity={contactEntity}
                onSubmit={handleCreateContact}
              />
            )}
            <button
              onClick={handleOpenAiChat}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md border border-floating-border bg-floating text-floating-foreground hover:bg-floating-muted transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.2-5 7.5V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.5C6 16.2 4 13.3 4 10a8 8 0 0 1 8-8z" />
                <line x1="10" y1="22" x2="14" y2="22" />
              </svg>
              Ask AI
            </button>
          </div>
        }
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Customer Relations" />
        <main className="relative flex-1 overflow-auto p-6">
          {chart ? (
            <ChartDisplay chart={chart} onClose={() => setChart(null)} />
          ) : (
            children ?? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Click an entity in the sidebar to search
              </div>
            )
          )}

          {/* Floating windows */}
          {openWindows.map((win, i) => {
            if (win.type === "ai") {
              return (
                <FloatingWindow
                  key={win.id}
                  title="Ask AI"
                  onClose={() => handleCloseWindow(win.id)}
                  defaultPosition={{ x: 280 + i * WINDOW_OFFSET, y: 60 + i * WINDOW_OFFSET }}
                  defaultSize={{ width: 420, height: 520 }}
                  zIndex={win.zIndex}
                  onFocus={() => handleFocusWindow(win.id)}
                >
                  <AiChatPanel onChartGenerated={setChart} />
                </FloatingWindow>
              );
            }

            const entityConfig = win.entityName ? schema?.entities[win.entityName] : null;
            if (!entityConfig || !win.entityName) return null;
            return (
              <FloatingWindow
                key={win.id}
                title={pluralize(win.entityName)}
                onClose={() => handleCloseWindow(win.id)}
                defaultPosition={{ x: 280 + i * WINDOW_OFFSET, y: 60 + i * WINDOW_OFFSET }}
                zIndex={win.zIndex}
                onFocus={() => handleFocusWindow(win.id)}
              >
                <EntitySearchPanel
                  entityName={win.entityName}
                  entity={entityConfig}
                />
              </FloatingWindow>
            );
          })}
        </main>
      </div>
    </div>
  );
}
