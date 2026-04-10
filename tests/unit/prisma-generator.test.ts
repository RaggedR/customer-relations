import { describe, it, expect } from "vitest";
import { loadSchema } from "@/engine/schema-loader";
import { generatePrismaSchema } from "@/engine/prisma-generator";
import path from "path";

describe("Prisma Generator", () => {
  const schema = loadSchema(path.resolve(process.cwd(), "schema.yaml"));

  it("generates valid Prisma schema string", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("generator client");
    expect(output).toContain("datasource db");
    expect(output).toContain('provider = "postgresql"');
  });

  it("generates models for all entities", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("model Patient {");
    expect(output).toContain("model Referral {");
    expect(output).toContain("model ClinicalNote {");
    expect(output).toContain("model HearingAid {");
  });

  it("generates required fields without ? suffix", () => {
    const output = generatePrismaSchema(schema);
    // name is required on Patient
    expect(output).toMatch(/name String\b(?!\?)/);
  });

  it("generates optional fields with ? suffix", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("email String?");
    expect(output).toContain("phone String?");
  });

  it("generates foreign key fields for belongs_to relations", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("patientId Int?");
  });

  it("generates relation fields", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("patient Patient? @relation");
  });

  it("generates reverse relation arrays", () => {
    const output = generatePrismaSchema(schema);
    // Patient should have referrals[], clinical_notes[], etc.
    expect(output).toContain("referrals Referral[]");
    expect(output).toContain("clinical_notes ClinicalNote[]");
  });

  it("includes id, createdAt, updatedAt on all models", () => {
    const output = generatePrismaSchema(schema);
    // Split on "model " at the start of a line to avoid matching field names like "model String?"
    const models = output.split(/\nmodel /);
    for (const model of models.slice(1)) {
      expect(model).toContain("id        Int      @id @default(autoincrement())");
      expect(model).toContain("createdAt DateTime @default(now())");
      expect(model).toContain("updatedAt DateTime @updatedAt");
    }
  });
});
