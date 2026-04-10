"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { FloatingWindow } from "@/components/floating-window";
import { EntitySearchPanel } from "@/components/entity-search-panel";
import { PatientDetailPanel } from "@/components/patient-detail-panel";
import { PatientPropertyPanel } from "@/components/patient-property-panel";
import { PatientFormPanel } from "@/components/patient-form-panel";
import { AiChatPanel, type ChartConfig } from "@/components/ai-chat-panel";
import { ChartDisplay } from "@/components/chart-display";
import type { SchemaConfig } from "@/engine/schema-loader";

interface OpenWindow {
  id: string;
  type: "patient-search" | "patient-detail" | "patient-property" | "patient-form" | "ai";
  patientId?: number;
  patientName?: string;
  entityName?: string;
  label?: string;
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

  const addWindow = useCallback(
    (win: Omit<OpenWindow, "zIndex">) => {
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

  // Sidebar: open patient search
  const handleOpenPatients = useCallback(() => {
    addWindow({ id: "patient-search", type: "patient-search" });
  }, [addWindow]);

  // Patient search: click a patient → open detail window
  const handlePatientSelected = useCallback(
    (patientId: number, patientName: string) => {
      addWindow({
        id: `patient-${patientId}`,
        type: "patient-detail",
        patientId,
        patientName,
      });
    },
    [addWindow]
  );

  // Patient detail: click a property → open property window
  const handleOpenProperty = useCallback(
    (entityName: string, patientId: number, label: string) => {
      // Find the patient name from the detail window
      const detailWin = openWindows.find(
        (w) => w.type === "patient-detail" && w.patientId === patientId
      );
      addWindow({
        id: `property-${patientId}-${entityName}`,
        type: "patient-property",
        patientId,
        patientName: detailWin?.patientName ?? "",
        entityName,
        label,
      });
    },
    [addWindow, openWindows]
  );

  // Patient detail: edit button
  const handleEditPatient = useCallback(
    (patientId: number) => {
      addWindow({
        id: `patient-form-${patientId}`,
        type: "patient-form",
        patientId,
      });
    },
    [addWindow]
  );

  // Patient detail: export
  const handleExportPatient = useCallback(
    (patientId: number, format: string) => {
      window.open(`/api/patient/${patientId}/export?format=${format}`, "_blank");
    },
    []
  );

  const handleOpenPatientForm = useCallback(() => {
    addWindow({ id: "patient-form-new", type: "patient-form" });
  }, [addWindow]);

  const handleOpenAiChat = useCallback(() => {
    addWindow({ id: "ai-chat", type: "ai" });
  }, [addWindow]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        onOpenPatients={handleOpenPatients}
        onAddPatient={handleOpenPatientForm}
        onOpenAiChat={handleOpenAiChat}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar title="Patient Management" />
        <main className="relative flex-1 overflow-auto p-6">
          {chart ? (
            <ChartDisplay chart={chart} onClose={() => setChart(null)} />
          ) : (
            children ?? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Click Patients in the sidebar to get started
              </div>
            )
          )}

          {openWindows.map((win, i) => {
            if (win.type === "patient-search") {
              const patientEntity = schema?.entities.patient;
              if (!patientEntity) return null;
              return (
                <FloatingWindow
                  key={win.id}
                  title="Patients"
                  onClose={() => closeWindow(win.id)}
                  defaultPosition={{ x: 260, y: 50 }}
                  defaultSize={{ width: 400, height: 520 }}
                  zIndex={win.zIndex}
                  onFocus={() => focusWindow(win.id)}
                >
                  <EntitySearchPanel
                    entityName="patient"
                    entity={patientEntity}
                    onItemSelect={handlePatientSelected}
                  />
                </FloatingWindow>
              );
            }

            if (win.type === "patient-detail" && win.patientId) {
              return (
                <FloatingWindow
                  key={win.id}
                  title={win.patientName ?? "Patient"}
                  onClose={() => closeWindow(win.id)}
                  defaultPosition={{ x: 340 + i * WINDOW_OFFSET, y: 50 + i * WINDOW_OFFSET }}
                  defaultSize={{ width: 380, height: 540 }}
                  zIndex={win.zIndex}
                  onFocus={() => focusWindow(win.id)}
                >
                  <PatientDetailPanel
                    patientId={win.patientId}
                    onOpenProperty={handleOpenProperty}
                    onEditPatient={handleEditPatient}
                    onExportPatient={handleExportPatient}
                  />
                </FloatingWindow>
              );
            }

            if (win.type === "patient-property" && win.patientId && win.entityName) {
              const entityConfig = schema?.entities[win.entityName];
              if (!entityConfig) return null;
              return (
                <FloatingWindow
                  key={win.id}
                  title={win.label ?? win.entityName}
                  onClose={() => closeWindow(win.id)}
                  defaultPosition={{ x: 420 + i * WINDOW_OFFSET, y: 60 + i * WINDOW_OFFSET }}
                  defaultSize={{ width: 440, height: 500 }}
                  zIndex={win.zIndex}
                  onFocus={() => focusWindow(win.id)}
                >
                  <PatientPropertyPanel
                    entityName={win.entityName}
                    entity={entityConfig}
                    patientId={win.patientId}
                    patientName={win.patientName ?? ""}
                  />
                </FloatingWindow>
              );
            }

            if (win.type === "patient-form") {
              return (
                <FloatingWindow
                  key={win.id}
                  title={win.patientId ? "Edit Patient" : "Add Patient"}
                  onClose={() => closeWindow(win.id)}
                  defaultPosition={{ x: 300 + i * WINDOW_OFFSET, y: 40 + i * WINDOW_OFFSET }}
                  defaultSize={{ width: 520, height: 640 }}
                  zIndex={win.zIndex}
                  onFocus={() => focusWindow(win.id)}
                >
                  <PatientFormPanel patientId={win.patientId} />
                </FloatingWindow>
              );
            }

            if (win.type === "ai") {
              return (
                <FloatingWindow
                  key={win.id}
                  title="Ask AI"
                  onClose={() => closeWindow(win.id)}
                  defaultPosition={{ x: 280 + i * WINDOW_OFFSET, y: 60 + i * WINDOW_OFFSET }}
                  defaultSize={{ width: 420, height: 520 }}
                  zIndex={win.zIndex}
                  onFocus={() => focusWindow(win.id)}
                >
                  <AiChatPanel onChartGenerated={setChart} />
                </FloatingWindow>
              );
            }

            return null;
          })}
        </main>
      </div>
    </div>
  );
}
