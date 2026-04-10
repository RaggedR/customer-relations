import { describe, it, expect } from "vitest";
import path from "path";
import { loadSchema } from "@/engine/schema-loader";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("Schema Loader", () => {
  it("loads and validates the default schema.yaml", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));

    expect(schema.entities).toBeDefined();
    expect(Object.keys(schema.entities)).toContain("company");
    expect(Object.keys(schema.entities)).toContain("contact");
    expect(Object.keys(schema.entities)).toContain("interaction");
    expect(Object.keys(schema.entities)).toContain("deal");
  });

  it("parses entity fields correctly", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const contact = schema.entities.contact;

    expect(contact.fields.name.type).toBe("string");
    expect(contact.fields.name.required).toBe(true);
    expect(contact.fields.email.type).toBe("email");
    expect(contact.fields.phone.type).toBe("phone");
    expect(contact.fields.notes.type).toBe("text");
  });

  it("parses relations correctly", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const contact = schema.entities.contact;

    expect(contact.relations).toBeDefined();
    expect(contact.relations!.company.type).toBe("belongs_to");
    expect(contact.relations!.company.entity).toBe("company");
  });

  it("parses CardDAV config correctly", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const contact = schema.entities.contact;

    expect(contact.carddav).toBeDefined();
    expect(contact.carddav!.enabled).toBe(true);
    expect(contact.carddav!.mapping.name).toBe("fn");
    expect(contact.carddav!.mapping.email).toBe("email");
    expect(contact.carddav!.mapping.phone).toBe("tel");
    expect(contact.carddav!.mapping.company).toBe("org");
  });

  it("parses enum fields with values", () => {
    const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));
    const deal = schema.entities.deal;

    expect(deal.fields.stage.type).toBe("enum");
    expect(deal.fields.stage.values).toEqual([
      "lead",
      "qualified",
      "proposal",
      "negotiation",
      "closed_won",
      "closed_lost",
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
