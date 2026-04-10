import { describe, it, expect } from "vitest";
import path from "path";
import { loadSchema } from "@/engine/schema-loader";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("Schema Loader", () => {
  it("loads and validates the default schema.yaml", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));

    expect(schema.entities).toBeDefined();
    expect(Object.keys(schema.entities)).toContain("patient");
    expect(Object.keys(schema.entities)).toContain("referral");
    expect(Object.keys(schema.entities)).toContain("clinical_note");
    expect(Object.keys(schema.entities)).toContain("hearing_aid");
  });

  it("parses entity fields correctly", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const patient = schema.entities.patient;

    expect(patient.fields.name.type).toBe("string");
    expect(patient.fields.name.required).toBe(true);
    expect(patient.fields.email.type).toBe("email");
    expect(patient.fields.phone.type).toBe("phone");
    expect(patient.fields.notes.type).toBe("text");
  });

  it("parses relations correctly", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const referral = schema.entities.referral;

    expect(referral.relations).toBeDefined();
    expect(referral.relations!.patient.type).toBe("belongs_to");
    expect(referral.relations!.patient.entity).toBe("patient");
  });

  it("parses enum fields with values", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const patient = schema.entities.patient;

    expect(patient.fields.status.type).toBe("enum");
    expect(patient.fields.status.values).toEqual([
      "active",
      "inactive",
      "discharged",
    ]);
  });

  it("rejects schema with unknown field type", () => {
    expect(() =>
      loadSchema(path.resolve(FIXTURES_DIR, "bad-field-type.yaml"))
    ).toThrow("unknown type");
  });

  it("rejects schema with missing enum values", () => {
    expect(() =>
      loadSchema(path.resolve(FIXTURES_DIR, "bad-enum.yaml"))
    ).toThrow('missing "values"');
  });

  it("rejects schema with unknown relation target", () => {
    expect(() =>
      loadSchema(path.resolve(FIXTURES_DIR, "bad-relation.yaml"))
    ).toThrow("unknown entity");
  });
});
