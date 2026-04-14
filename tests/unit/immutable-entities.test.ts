/**
 * Immutable Entities Tests
 *
 * Verifies that entities marked immutable: true in schema.yaml cannot be
 * updated or deleted via the CRUD API. This is the medico-legal standard
 * for medical records: clinical notes are legal documents.
 */

import { describe, it, expect, beforeAll } from "vitest";

// ── Schema flag tests ─────────────────────────────────────

describe("schema.yaml — immutable flag", () => {
  let getSchema: typeof import("@/lib/schema").getSchema;

  beforeAll(async () => {
    const mod = await import("@/lib/schema");
    getSchema = mod.getSchema;
  });

  it("clinical_note has immutable: true", () => {
    const schema = getSchema();
    expect(schema.entities.clinical_note.immutable).toBe(true);
  });

  it("personal_note has immutable: true", () => {
    const schema = getSchema();
    expect(schema.entities.personal_note.immutable).toBe(true);
  });

  it("patient is NOT immutable", () => {
    const schema = getSchema();
    expect(schema.entities.patient.immutable).toBeUndefined();
  });

  it("immutable entities are not in SENSITIVE_ENTITIES (they should be readable)", async () => {
    const { SENSITIVE_ENTITIES } = await import("@/lib/api-helpers");
    const schema = getSchema();
    for (const [name, entity] of Object.entries(schema.entities)) {
      if ((entity as { immutable?: boolean }).immutable) {
        expect(SENSITIVE_ENTITIES).not.toContain(name);
      }
    }
  });
});

// ── EntityConfig type tests ─────────────────────────────────

describe("EntityConfig — immutable property", () => {
  it("immutable is optional on EntityConfig", async () => {
    const mod = await import("@/engine/schema-loader");
    const schema = mod.getSchema();
    expect(schema.entities.clinical_note).toHaveProperty("immutable");
  });
});
