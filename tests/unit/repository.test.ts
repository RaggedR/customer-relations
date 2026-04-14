import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SchemaConfig } from "@/lib/schema";

/**
 * Minimal schema for testing validateEntity() in isolation.
 * We mock getSchema() to return this instead of loading from disk.
 */
const TEST_SCHEMA: SchemaConfig = {
  entities: {
    patient: {
      fields: {
        name: { type: "string", required: true },
        email: { type: "email" },
        phone: { type: "phone" },
        date_of_birth: { type: "date" },
        status: { type: "enum", values: ["active", "inactive", "discharged"] },
        notes: { type: "text" },
        age: { type: "number" },
      },
    },
    referral: {
      fields: {
        referring_gp: { type: "string", required: true },
        referral_date: { type: "date", required: true },
        reason: { type: "text" },
      },
      relations: {
        patient: { type: "belongs_to", entity: "patient" },
      },
    },
  },
};

// Mock the schema-loader so validateEntity() uses our test schema
vi.mock("@/engine/schema-loader", () => ({
  getSchema: () => TEST_SCHEMA,
  loadSchema: () => TEST_SCHEMA,
}));

// Import AFTER mocking
const { validateEntity } = await import("@/lib/repository");

describe("validateEntity()", () => {
  // ── Unknown entity ───────────────────────────────────────────

  it("returns error for unknown entity", () => {
    const errors = validateEntity("unicorn", { name: "Test" });
    expect(errors).toContain("Unknown entity: unicorn");
  });

  // ── Required fields ──────────────────────────────────────────

  it("returns no errors for valid complete patient", () => {
    const errors = validateEntity("patient", {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "0400000001",
      date_of_birth: "1815-12-10",
      status: "active",
    });
    expect(errors).toEqual([]);
  });

  it("returns error when required field is missing", () => {
    const errors = validateEntity("patient", {
      email: "ada@example.com",
    });
    expect(errors).toContain("name is required");
  });

  it("returns error when required field is empty string", () => {
    const errors = validateEntity("patient", { name: "" });
    expect(errors).toContain("name is required");
  });

  it("returns error when required field is null", () => {
    const errors = validateEntity("patient", { name: null });
    expect(errors).toContain("name is required");
  });

  it("catches multiple missing required fields at once", () => {
    const errors = validateEntity("referral", {});
    expect(errors).toContain("referring_gp is required");
    expect(errors).toContain("referral_date is required");
    expect(errors.length).toBe(2);
  });

  // ── Type validation ──────────────────────────────────────────

  it("rejects invalid email format", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      email: "not-an-email",
    });
    expect(errors).toContain("email must be a valid email");
  });

  it("accepts valid email", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      email: "valid@example.com",
    });
    expect(errors).toEqual([]);
  });

  it("rejects invalid phone format", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      phone: "abc-not-phone",
    });
    expect(errors).toContain("phone must be a valid phone");
  });

  it("accepts valid phone with spaces and dashes", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      phone: "+61 400 000 001",
    });
    expect(errors).toEqual([]);
  });

  it("rejects invalid date", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      date_of_birth: "not-a-date",
    });
    expect(errors).toContain("date_of_birth must be a valid date");
  });

  it("accepts valid ISO date", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      date_of_birth: "1990-05-15",
    });
    expect(errors).toEqual([]);
  });

  // ── Enum validation ──────────────────────────────────────────

  it("rejects value not in enum list", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      status: "deleted",
    });
    expect(errors).toContain("status must be a valid enum");
  });

  it("accepts valid enum value", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      status: "active",
    });
    expect(errors).toEqual([]);
  });

  it("accepts all defined enum values", () => {
    for (const status of ["active", "inactive", "discharged"]) {
      const errors = validateEntity("patient", { name: "Test", status });
      expect(errors).toEqual([]);
    }
  });

  // ── Optional fields ──────────────────────────────────────────

  it("skips validation for optional fields that are undefined", () => {
    const errors = validateEntity("patient", { name: "Test" });
    expect(errors).toEqual([]);
  });

  it("skips validation for optional fields that are null", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      email: null,
      phone: null,
    });
    expect(errors).toEqual([]);
  });

  it("skips validation for optional fields that are empty string", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      notes: "",
    });
    expect(errors).toEqual([]);
  });

  // ── Number validation ────────────────────────────────────────

  it("rejects non-numeric value for number field", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      age: "not-a-number",
    });
    expect(errors).toContain("age must be a valid number");
  });

  it("accepts numeric value for number field", () => {
    const errors = validateEntity("patient", {
      name: "Test",
      age: 42,
    });
    expect(errors).toEqual([]);
  });
});
