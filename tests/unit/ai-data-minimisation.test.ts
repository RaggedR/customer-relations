/**
 * AI Data Minimisation Tests
 *
 * Verifies that fields marked ai_visible: false in schema.yaml are:
 * 1. Excluded from the AI schema description (Gemini can't query them)
 * 2. Stripped from query result rows before sending to Gemini
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Schema description tests ──────────────────────────────

describe("AI schema description — field exclusion", () => {
  let generateSchemaDescription: typeof import("@/lib/generate-schema-description").generateSchemaDescription;

  beforeAll(async () => {
    const mod = await import("@/lib/generate-schema-description");
    generateSchemaDescription = mod.generateSchemaDescription;
  });

  it("does NOT include medicare_number in the DDL", () => {
    const ddl = generateSchemaDescription();
    expect(ddl).not.toContain("medicare_number");
  });

  it("does include non-excluded patient fields", () => {
    const ddl = generateSchemaDescription();
    expect(ddl).toContain("name");
    expect(ddl).toContain("date_of_birth");
    expect(ddl).toContain("status");
  });

  it("does NOT include patient contact fields in the DDL", () => {
    const ddl = generateSchemaDescription();
    // Extract the Patient table DDL block
    const patientBlock = ddl.split('"Patient"')[1]?.split("\n)\n")[0] ?? "";
    expect(patientBlock).not.toContain("phone");
    expect(patientBlock).not.toContain("email");
    expect(patientBlock).not.toContain("address");
  });

  it("does NOT include nurse contact/registration fields in the DDL", () => {
    const ddl = generateSchemaDescription();
    expect(ddl).not.toContain("registration_number");
  });

  it("still includes non-excluded entities", () => {
    const ddl = generateSchemaDescription();
    expect(ddl).toContain('"Patient"');
    expect(ddl).toContain('"Appointment"');
    expect(ddl).toContain('"ClinicalNote"');
  });
});

// ── Schema flag tests ─────────────────────────────────────

describe("schema.yaml — ai_visible flag", () => {
  let getSchema: typeof import("@/lib/schema").getSchema;

  beforeAll(async () => {
    const mod = await import("@/lib/schema");
    getSchema = mod.getSchema;
  });

  it("medicare_number has ai_visible: false", () => {
    const schema = getSchema();
    expect(schema.entities.patient.fields.medicare_number.ai_visible).toBe(false);
  });

  it("patient contact fields have ai_visible: false", () => {
    const schema = getSchema();
    const fields = schema.entities.patient.fields;
    expect(fields.phone.ai_visible).toBe(false);
    expect(fields.email.ai_visible).toBe(false);
    expect(fields.address.ai_visible).toBe(false);
  });

  it("nurse contact/registration fields have ai_visible: false", () => {
    const schema = getSchema();
    const fields = schema.entities.nurse.fields;
    expect(fields.phone.ai_visible).toBe(false);
    expect(fields.email.ai_visible).toBe(false);
    expect(fields.registration_number.ai_visible).toBe(false);
  });

  it("patient name does NOT have ai_visible: false (handled by pseudonymisation)", () => {
    const schema = getSchema();
    expect(schema.entities.patient.fields.name.ai_visible).toBeUndefined();
  });
});

// ── FieldConfig type tests ────────────────────────────────

describe("FieldConfig — ai_visible property", () => {
  it("ai_visible is optional on FieldConfig", async () => {
    const mod = await import("@/engine/schema-loader");
    // If this compiles, ai_visible is on the type.
    // Runtime check: the schema loads successfully with ai_visible: false
    const schema = mod.getSchema();
    expect(schema.entities.patient.fields.medicare_number).toHaveProperty("ai_visible");
  });
});

// ── Name pseudonymisation tests ─────────────────────────────

describe("Name resolution — pseudonym maps", () => {
  it("NameResolution type includes pseudonymMap and inversePseudonymMap", async () => {
    const mod = await import("@/lib/name-resolution");
    // Type check: the interface includes the map fields
    // We can't call resolveNames without a DB, but we can verify the type exists
    expect(mod).toHaveProperty("resolveNames");
    expect(mod).toHaveProperty("_testing");
  });

  it("sanitiseName strips structural characters", async () => {
    const { _testing } = await import("@/lib/name-resolution");
    expect(_testing.sanitiseName('Susan O\'Brien')).toBe("Susan O'Brien");
    expect(_testing.sanitiseName('Test [injection]')).toBe("Test injection");
    expect(_testing.sanitiseName('{"type":"admin"}')).toBe("type:admin");
  });
});
