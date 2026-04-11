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
import { CalendarPanel } from "@/components/calendar-panel";
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

/** Roles that render in the main area, not as floating windows */
const NON_FLOATING_ROLES = new Set(["calendar", "wizard"]);

/**
 * Component registry: maps window type name (from navigation.yaml)
 * to the React element that renders it.
 */
function renderWindowContent(
  win: WindowState,
  schema: SchemaConfig | null,
  hierarchy: ReturnType<typeof deriveHierarchy> | null,
  nav: NavigationConfig,
  navigate: (win: Omit<WindowState, "zIndex">) => void,
  onChart: (chart: ChartConfig) => void,
  onCloseWindow: (id: string) => void
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
          onDelete={(_id: number) => onCloseWindow(win.id)}
          onNavigateToRelated={(entity, id, name) =>
            navigate({
              id: `detail-${entity}-${id}`,
              type: "detail",
              entityName: entity,
              entityId: id,
              entityLabel: name,
            })
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
          initialValues={win.initialValues}
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

  // Calendar event handlers
  const handleEventClick = useCallback(
    (id: number, name: string) => {
      if (!nav) return;
      navigate({
        id: `detail-appointment-${id}`,
        type: "detail",
        entityName: "appointment",
        entityId: id,
        entityLabel: name,
      });
    },
    [nav, navigate]
  );

  const handleSlotClick = useCallback(
    (date: string, time: string) => {
      if (!nav) return;
      navigate({
        id: `form-appointment-new-${date}-${time}`,
        type: "form",
        entityName: "appointment",
        initialValues: {
          date,
          start_time: time,
          end_time: slotEndTime(time),
        },
      } as Omit<WindowState, "zIndex">);
    },
    [nav, navigate]
  );

  if (!nav) return null; // wait for navigation config

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        firstOrderEntities={hierarchy?.firstOrder ?? []}
        addableEntities={[...(hierarchy?.firstOrder ?? []), "appointment"]}
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
        <main className="relative flex-1 overflow-hidden">
          {/* Calendar is the home view — always visible behind floating windows */}
          {chart ? (
            <ChartDisplay chart={chart} onClose={() => setChart(null)} />
          ) : (
            <CalendarPanel
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
          {openWindows.map((win, i) => {
            const def = nav.windows[win.type];
            if (!def) return null;

            // Skip non-floating roles (calendar, wizard render in main area)
            if (NON_FLOATING_ROLES.has(def.role)) return null;

            const content = renderWindowContent(
              win, schema, hierarchy, nav, navigate, setChart, closeWindow
            );
            if (!content) return null;

            // Use fallback sizes/positions for roles not in the layout config
            const role = def.role as keyof typeof layout.window.sizes;
            const size = layout.window.sizes[role] ?? layout.window.sizes.detail;
            const pos = windowPosition(
              (layout.window.positions[role] ? role : "detail") as keyof typeof layout.window.positions,
              i
            );

            return (
              <FloatingWindow
                key={win.id}
                title={windowTitle(nav, win)}
                onClose={() => closeWindow(win.id)}
                defaultPosition={pos}
                defaultSize={size}
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

/** Compute a default end time 30 minutes after start */
function slotEndTime(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const totalMinutes = h * 60 + m + 30;
  const eh = Math.floor(totalMinutes / 60);
  const em = totalMinutes % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}
