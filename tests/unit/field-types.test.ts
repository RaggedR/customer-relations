import { describe, it, expect } from "vitest";
import { getFieldType, validateFieldValue, fieldTypes } from "@/engine/field-types";

describe("Field Types", () => {
  it("has all expected types registered", () => {
    const expected = [
      "string", "text", "email", "phone", "url",
      "number", "date", "datetime", "enum", "boolean", "json",
    ];
    for (const type of expected) {
      expect(fieldTypes[type]).toBeDefined();
    }
  });

  it("throws for unknown field type", () => {
    expect(() => getFieldType("banana")).toThrow('Unknown field type: "banana"');
  });

  describe("string validation", () => {
    it("accepts strings", () => {
      expect(validateFieldValue("string", "hello")).toBe(true);
    });
    it("rejects numbers", () => {
      expect(validateFieldValue("string", 123)).toBe(false);
    });
  });

  describe("email validation", () => {
    it("accepts valid emails", () => {
      expect(validateFieldValue("email", "alice@example.com")).toBe(true);
    });
    it("rejects invalid emails", () => {
      expect(validateFieldValue("email", "not-an-email")).toBe(false);
    });
  });

  describe("phone validation", () => {
    it("accepts valid phone numbers", () => {
      expect(validateFieldValue("phone", "+1 (555) 123-4567")).toBe(true);
    });
    it("rejects invalid phone numbers", () => {
      expect(validateFieldValue("phone", "abc")).toBe(false);
    });
  });

  describe("url validation", () => {
    it("accepts valid URLs", () => {
      expect(validateFieldValue("url", "https://example.com")).toBe(true);
    });
    it("rejects invalid URLs", () => {
      expect(validateFieldValue("url", "not-a-url")).toBe(false);
    });
  });

  describe("number validation", () => {
    it("accepts numbers", () => {
      expect(validateFieldValue("number", 42)).toBe(true);
      expect(validateFieldValue("number", 3.14)).toBe(true);
    });
    it("rejects strings", () => {
      expect(validateFieldValue("number", "42")).toBe(false);
    });
    it("rejects NaN", () => {
      expect(validateFieldValue("number", NaN)).toBe(false);
    });
  });

  describe("date/datetime validation", () => {
    it("accepts valid date strings", () => {
      expect(validateFieldValue("date", "2026-04-10")).toBe(true);
      expect(validateFieldValue("datetime", "2026-04-10T12:00:00Z")).toBe(true);
    });
    it("rejects invalid date strings", () => {
      expect(validateFieldValue("date", "not-a-date")).toBe(false);
    });
  });

  describe("enum validation", () => {
    it("accepts values in the allowed list", () => {
      expect(
        validateFieldValue("enum", "lead", { values: ["lead", "qualified", "closed"] })
      ).toBe(true);
    });
    it("rejects values not in the allowed list", () => {
      expect(
        validateFieldValue("enum", "unknown", { values: ["lead", "qualified", "closed"] })
      ).toBe(false);
    });
  });

  describe("boolean validation", () => {
    it("accepts booleans", () => {
      expect(validateFieldValue("boolean", true)).toBe(true);
      expect(validateFieldValue("boolean", false)).toBe(true);
    });
    it("rejects non-booleans", () => {
      expect(validateFieldValue("boolean", "true")).toBe(false);
    });
  });

  describe("HTML input types", () => {
    it("maps field types to correct HTML input types", () => {
      expect(getFieldType("string").htmlInputType).toBe("text");
      expect(getFieldType("text").htmlInputType).toBe("textarea");
      expect(getFieldType("email").htmlInputType).toBe("email");
      expect(getFieldType("phone").htmlInputType).toBe("tel");
      expect(getFieldType("url").htmlInputType).toBe("url");
      expect(getFieldType("number").htmlInputType).toBe("number");
      expect(getFieldType("date").htmlInputType).toBe("date");
      expect(getFieldType("datetime").htmlInputType).toBe("datetime-local");
      expect(getFieldType("enum").htmlInputType).toBe("select");
      expect(getFieldType("boolean").htmlInputType).toBe("checkbox");
      expect(getFieldType("json").htmlInputType).toBe("textarea");
    });
  });
});
