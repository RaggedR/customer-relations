"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { FloatingWindow } from "@/components/floating-window";
import { EntitySearchPanel } from "@/components/entity-search-panel";
import { EntityDetailPanel } from "@/components/entity-detail-panel";
import { EntityFormPanel } from "@/components/entity-form-panel";
import { PropertyPanel } from "@/components/patient-property-panel";
import { AiChatPanel, type ChartConfig } from "@/components/ai-chat-panel";
import { ChartDisplay } from "@/components/chart-display";
import { deriveHierarchy } from "@/lib/schema-hierarchy";
import { layout, windowPosition } from "@/lib/layout";
import {
  transition,
  windowTitle,
  type NavigationConfig,
  type WindowState,
} from "@/lib/navigation";
import type { SchemaConfig } from "@/engine/schema-loader";

/** Which entities have /api/{entity}/{id}/export endpoints */
const EXPORTABLE = new Set(["patient"]);

/**
 * Component registry: maps window type name (from navigation.yaml)
 * to the React element that renders it.
 *
 * To add a new window type:
 *   1. Add an entry to navigation.yaml
 *   2. Create the component
 *   3. Add a case here
 */
function renderWindowContent(
  win: WindowState,
  schema: SchemaConfig | null,
  hierarchy: ReturnType<typeof deriveHierarchy> | null,
  nav: NavigationConfig,
  navigate: (win: Omit<WindowState, "zIndex">) => void,
  onChart: (chart: ChartConfig) => void
): React.ReactNode {
  switch (win.type) {
    case "search": {
      const entity = win.entityName ? schema?.entities[win.entityName] : null;
      if (!entity || !win.entityName) return null;
      return (
        <EntitySearchPanel
          entityName={win.entityName}
          entity={entity}
          onItemSelect={(id, name) =>
            navigate(
              transition(nav, "search→detail", {
                entity: win.entityName!,
                id,
                name,
              })
            )
          }
        />
      );
    }

    case "detail": {
      if (!win.entityName || !win.entityId || !schema || !hierarchy)
        return null;
      const properties = hierarchy.propertiesOf[win.entityName] ?? [];
      const parentKey = `${win.entityName}Id`;
      return (
        <EntityDetailPanel
          entityName={win.entityName}
          entityId={win.entityId}
          schema={schema}
          properties={properties}
          parentKey={parentKey}
          features={nav.windows["detail"]?.features ?? []}
          onOpenProperty={(propEntity, parentId, label) =>
            navigate(
              transition(nav, "detail→property", {
                entity: win.entityName!,
                id: parentId,
                name: win.entityLabel,
                propertyEntity: propEntity,
                parentKey,
                label,
              })
            )
          }
          onEdit={(id) =>
            navigate(
              transition(nav, "detail→form", {
                entity: win.entityName!,
                id,
              })
            )
          }
          onExport={
            EXPORTABLE.has(win.entityName)
              ? (id, fmt) =>
                  window.open(
                    `/api/${win.entityName}/${id}/export?format=${fmt}`,
                    "_blank"
                  )
              : undefined
          }
        />
      );
    }

    case "property": {
      if (!win.entityId || !win.propertyEntity || !win.parentKey) return null;
      const entityConfig = schema?.entities[win.propertyEntity];
      if (!entityConfig) return null;
      return (
        <PropertyPanel
          entityName={win.propertyEntity}
          entity={entityConfig}
          parentId={win.entityId}
          parentName={win.entityLabel ?? ""}
          parentKey={win.parentKey}
          features={nav.windows["property"]?.features ?? []}
        />
      );
    }

    case "form": {
      if (!win.entityName || !schema) return null;
      return (
        <EntityFormPanel
          entityName={win.entityName}
          schema={schema}
          entityId={win.entityId}
        />
      );
    }

    case "ai":
      return <AiChatPanel onChartGenerated={onChart} />;

    default:
      return null;
  }
}

export function DashboardShell({ children }: { children?: React.ReactNode }) {
  const [schema, setSchema] = useState<SchemaConfig | null>(null);
  const [nav, setNav] = useState<NavigationConfig | null>(null);
  const [openWindows, setOpenWindows] = useState<WindowState[]>([]);
  const [nextZ, setNextZ] = useState(9000);
  const [chart, setChart] = useState<ChartConfig | null>(null);

  // Fetch schema and navigation config in parallel on mount
  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then(setSchema)
      .catch((err) => console.error("Failed to load schema:", err));
    fetch("/api/navigation")
      .then((r) => r.json())
      .then(setNav)
      .catch((err) => console.error("Failed to load navigation:", err));
  }, []);

  const hierarchy = useMemo(
    () => (schema ? deriveHierarchy(schema) : null),
    [schema]
  );

  const addWindow = useCallback(
    (win: Omit<WindowState, "zIndex">) => {
      setOpenWindows((prev) => {
        const existing = prev.find((w) => w.id === win.id);
        if (existing) {
          return prev.map((w) =>
            w.id === win.id ? { ...w, zIndex: nextZ } : w
          );
        }
        return [...prev, { ...win, zIndex: nextZ }];
      });
      setNextZ((z) => z + 1);
    },
    [nextZ]
  );

  const closeWindow = useCallback((id: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const focusWindow = useCallback(
    (id: string) => {
      setOpenWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
      );
      setNextZ((z) => z + 1);
    },
    [nextZ]
  );

  const navigate = useCallback(
    (win: Omit<WindowState, "zIndex">) => addWindow(win),
    [addWindow]
  );

  if (!nav) return null; // wait for navigation config

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        firstOrderEntities={hierarchy?.firstOrder ?? []}
        onOpenEntity={(name) =>
          navigate(transition(nav, "sidebar→search", { entity: name }))
        }
        onAddEntity={(name) =>
          navigate(transition(nav, "sidebar→form", { entity: name }))
        }
        onOpenAiChat={() =>
          navigate(transition(nav, "sidebar→ai", {}))
        }
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Patient Management" />
        <main className="relative flex-1 overflow-auto p-6">
          {chart ? (
            <ChartDisplay chart={chart} onClose={() => setChart(null)} />
          ) : (
            children ?? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select an entity from the sidebar
              </div>
            )
          )}
          {openWindows.map((win, i) => {
            const def = nav.windows[win.type];
            if (!def) return null;

            const content = renderWindowContent(
              win, schema, hierarchy, nav, navigate, setChart
            );
            if (!content) return null;

            return (
              <FloatingWindow
                key={win.id}
                title={windowTitle(nav, win)}
                onClose={() => closeWindow(win.id)}
                defaultPosition={windowPosition(def.role, i)}
                defaultSize={layout.window.sizes[def.role]}
                zIndex={win.zIndex}
                onFocus={() => focusWindow(win.id)}
              >
                {content}
              </FloatingWindow>
            );
          })}
        </main>
      </div>
    </div>
  );
}
