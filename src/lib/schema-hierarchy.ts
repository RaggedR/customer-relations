/**
 * Schema Hierarchy
 *
 * Derives the UI navigation structure from schema.yaml relations.
 *
 * First-order entities: entities with no belongs_to relations.
 * Properties: entities with a belongs_to relation to a first-order entity,
 *   grouped under their parent.
 *
 * This is the single source of truth for what appears in the sidebar
 * and what shows up in entity detail panels.
 */

import type { SchemaConfig } from "@/engine/schema-loader";

export interface SchemaHierarchy {
  /** Entity names with no belongs_to (e.g. ["patient", "nurse"]) */
  firstOrder: string[];
  /** Map from first-order entity → its property entity names */
  propertiesOf: Record<string, string[]>;
  /** Map from property entity → all parents [{ parentEntity, foreignKey }] */
  parentOf: Record<string, { entity: string; foreignKey: string }[]>;
}

export function deriveHierarchy(schema: SchemaConfig): SchemaHierarchy {
  const allEntities = Object.keys(schema.entities);

  // Find entities with no belongs_to relations → first-order
  const firstOrder = allEntities.filter((name) => {
    const entity = schema.entities[name];
    return !entity.relations || Object.keys(entity.relations).length === 0;
  });

  // Build propertiesOf: for each entity with relations, find which
  // first-order entity it belongs to
  const propertiesOf: Record<string, string[]> = {};
  const parentOf: Record<string, { entity: string; foreignKey: string }[]> = {};

  for (const fo of firstOrder) {
    propertiesOf[fo] = [];
  }

  for (const name of allEntities) {
    if (firstOrder.includes(name)) continue;
    const entity = schema.entities[name];
    if (!entity.relations) continue;

    if (!parentOf[name]) parentOf[name] = [];

    for (const [relName, rel] of Object.entries(entity.relations)) {
      if (rel.type === "belongs_to" && firstOrder.includes(rel.entity)) {
        if (!propertiesOf[rel.entity].includes(name)) {
          propertiesOf[rel.entity].push(name);
        }
        parentOf[name].push({
          entity: rel.entity,
          foreignKey: `${relName}Id`,
        });
      }
    }
  }

  return { firstOrder, propertiesOf, parentOf };
}

/** Convert snake_case entity name to display label */
export function entityLabel(name: string): string {
  const map: Record<string, string> = {
    clinical_note: "Clinical Notes",
    personal_note: "Personal Notes",
    hearing_aid: "Hearing Aids",
    claim_item: "Claim Items",
    nurse_specialty: "Specialties",
    calendar_connection: "Calendar Connections",
  };
  if (map[name]) return map[name];
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1) + "s";
}

/** Singular display label */
export function entityLabelSingular(name: string): string {
  const label = name.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
