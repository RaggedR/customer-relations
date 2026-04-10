import { describe, it, expect } from "vitest";
import { entityToVCard, vCardToEntity } from "@/carddav/vcard-adapter";

const mapping = {
  name: "fn",
  email: "email",
  phone: "tel",
  company: "org",
};

describe("vCard Adapter", () => {
  describe("entityToVCard", () => {
    it("converts an entity to a valid vCard string", () => {
      const entity = {
        name: "Alice Smith",
        email: "alice@example.com",
        phone: "+1-555-1234",
        company: "Acme Corp",
      };

      const vcard = entityToVCard(entity, mapping, "test-uid-123");

      expect(vcard).toContain("BEGIN:VCARD");
      expect(vcard).toContain("VERSION:3.0");
      expect(vcard).toContain("UID:test-uid-123");
      expect(vcard).toContain("FN:Alice Smith");
      expect(vcard).toContain("N:Alice Smith;;;;");
      expect(vcard).toContain("EMAIL;TYPE=INTERNET:alice@example.com");
      expect(vcard).toContain("TEL;TYPE=VOICE:+1-555-1234");
      expect(vcard).toContain("ORG:Acme Corp");
      expect(vcard).toContain("END:VCARD");
    });

    it("skips null/empty fields", () => {
      const entity = {
        name: "Bob",
        email: null,
        phone: "",
      };

      const vcard = entityToVCard(entity, mapping, "uid-456");
      expect(vcard).toContain("FN:Bob");
      expect(vcard).not.toContain("EMAIL");
      expect(vcard).not.toContain("TEL");
    });

    it("handles company as a related object", () => {
      const entity = {
        name: "Charlie",
        company: { name: "Globex", id: 1 },
      };

      const vcard = entityToVCard(entity, mapping, "uid-789");
      expect(vcard).toContain("ORG:Globex");
    });

    it("generates a UID if not provided", () => {
      const entity = { name: "Test" };
      const vcard = entityToVCard(entity, mapping);
      expect(vcard).toMatch(/UID:.+/);
    });
  });

  describe("vCardToEntity", () => {
    it("parses a vCard string into entity data", () => {
      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "UID:parse-test-uid",
        "FN:Alice Smith",
        "N:Smith;Alice;;;",
        "EMAIL;TYPE=INTERNET:alice@example.com",
        "TEL;TYPE=VOICE:+1-555-1234",
        "ORG:Acme Corp",
        "END:VCARD",
      ].join("\r\n");

      const { data, uid } = vCardToEntity(vcard, mapping);

      expect(uid).toBe("parse-test-uid");
      expect(data.name).toBe("Alice Smith");
      expect(data.email).toBe("alice@example.com");
      expect(data.phone).toBe("+1-555-1234");
      expect(data.company).toBe("Acme Corp");
    });

    it("uses N field as fallback when FN is missing", () => {
      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "UID:no-fn-uid",
        "N:Smith;Alice;;;",
        "END:VCARD",
      ].join("\r\n");

      const { data } = vCardToEntity(vcard, mapping);
      expect(data.name).toBe("Alice Smith");
    });

    it("generates a UID if vCard has none", () => {
      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:No UID Person",
        "END:VCARD",
      ].join("\r\n");

      const { uid } = vCardToEntity(vcard, mapping);
      expect(uid).toBeTruthy();
      expect(uid.length).toBeGreaterThan(0);
    });
  });

  describe("roundtrip", () => {
    it("entity → vCard → entity preserves data", () => {
      const original = {
        name: "Roundtrip Test",
        email: "round@trip.com",
        phone: "+44-20-1234-5678",
        company: "Test Corp",
      };

      const vcard = entityToVCard(original, mapping, "roundtrip-uid");
      const { data, uid } = vCardToEntity(vcard, mapping);

      expect(uid).toBe("roundtrip-uid");
      expect(data.name).toBe(original.name);
      expect(data.email).toBe(original.email);
      expect(data.phone).toBe(original.phone);
      expect(data.company).toBe(original.company);
    });
  });
});
