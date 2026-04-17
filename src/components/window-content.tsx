/**
 * Window Content Registry
 *
 * Maps window type names (from navigation.yaml) to the React components
 * that render them. This is the component registry — the switch statement
 * that wires WindowState fields into the correct component props.
 *
 * Extracted from dashboard-shell.tsx. React components can't be serialized
 * in YAML, so this code-level mapping is necessary. Adding a new window
 * type requires editing both navigation.yaml AND this file.
 */

import React from "react";
import { EntitySearchPanel } from "@/components/entity-search-panel";
import { EntityDetailPanel } from "@/components/entity-detail-panel";
import { EntityFormPanel } from "@/components/entity-form-panel";
import { PropertyPanel } from "@/components/patient-property-panel";
import { AiChatPanel, type ChartConfig } from "@/components/ai-chat-panel";
import { transition, type NavigationConfig, type WindowState } from "@/lib/navigation";
import { foreignKeyName, type SchemaConfig, type SchemaHierarchy } from "@/lib/schema-client";

export interface WindowContentProps {
  win: WindowState;
  schema: SchemaConfig | null;
  hierarchy: SchemaHierarchy | null;
  nav: NavigationConfig;
  navigate: (win: Omit<WindowState, "zIndex">) => void;
  onChart: (chart: ChartConfig) => void;
  onCloseWindow: (id: string) => void;
}

export function renderWindowContent({
  win,
  schema,
  hierarchy,
  nav,
  navigate,
  onChart,
  onCloseWindow,
}: WindowContentProps): React.ReactNode {
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
              transition(nav, { from: "search", to: "detail" }, {
                entity: win.entityName!,
                id,
                displayName: name,
              }, schema ?? undefined)
            )
          }
        />
      );
    }

    case "detail": {
      if (!win.entityName || !win.entityId || !schema || !hierarchy)
        return null;
      const properties = hierarchy.propertiesOf[win.entityName] ?? [];
      const parentKey = foreignKeyName(win.entityName);
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
              transition(nav, { from: "detail", to: "property" }, {
                entity: win.entityName!,
                id: parentId,
                displayName: win.displayName,
                propertyEntity: propEntity,
                parentKey,
                label,
              }, schema ?? undefined)
            )
          }
          onEdit={(id) =>
            navigate(
              transition(nav, { from: "detail", to: "form" }, {
                entity: win.entityName!,
                id,
              }, schema ?? undefined)
            )
          }
          onExport={
            schema?.entities[win.entityName ?? ""]?.exportable
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
              displayName: name,
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
          parentName={win.displayName ?? ""}
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
