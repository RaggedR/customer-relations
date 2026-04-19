"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { FloatingWindow } from "@/components/floating-window";
import { type ChartConfig } from "@/components/ai-chat-panel";
import { ChartDisplay } from "@/components/chart-display";
import { CalendarPanel } from "@/components/calendar-panel";
import { renderWindowContent } from "@/components/window-content";
import { useAppConfig } from "@/hooks/use-app-config";
import { useWindowManager } from "@/hooks/use-window-manager";
import { layout, windowPosition } from "@/lib/layout";
import { transition, windowTitle } from "@/lib/navigation";
import type { WindowState } from "@/lib/navigation";

export function DashboardShell({ children }: { children?: React.ReactNode }) {
  const { schema, nav, hierarchy } = useAppConfig();
  const { openWindows, closeWindow, focusWindow, navigate } = useWindowManager();
  const [chart, setChart] = useState<ChartConfig | null>(null);

  // Calendar event handlers
  const handleEventClick = useCallback(
    (id: number, name: string) => {
      if (!nav) return;
      navigate({
        id: `detail-appointment-${id}`,
        type: "detail",
        entityName: "appointment",
        entityId: id,
        displayName: name,
      });
    },
    [nav, navigate]
  );

  const handleSlotClick = useCallback(
    (date: string, time: string) => {
      if (!nav) return;
      navigate({
        id: "form-appointment-new",
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
        addableEntities={[
          ...(hierarchy?.firstOrder ?? []),
          ...Object.entries(schema?.entities ?? {})
            .filter(([, e]) => e.sidebar_addable)
            .map(([name]) => name),
        ]}
        schema={schema}
        onOpenEntity={(name) =>
          navigate(transition(nav, { from: "sidebar", to: "search" }, { entity: name }, schema ?? undefined))
        }
        onAddEntity={(name) =>
          navigate(transition(nav, { from: "sidebar", to: "form" }, { entity: name }, schema ?? undefined))
        }
        onOpenAiChat={() =>
          navigate(transition(nav, { from: "sidebar", to: "ai" }, {}, schema ?? undefined))
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

            // Skip non-floating windows (e.g. calendar renders in main area)
            if (def.floating === false) return null;

            const content = renderWindowContent({
              win, schema, hierarchy, nav, navigate, onChart: setChart, onCloseWindow: closeWindow,
            });
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
                title={windowTitle(nav, win, schema ?? undefined)}
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

/** Compute a default end time 45 minutes after start */
function slotEndTime(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const totalMinutes = h * 60 + m + 45;
  const eh = Math.floor(totalMinutes / 60);
  const em = totalMinutes % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}
