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

  it("generates @unique on fields with unique: true", () => {
    const output = generatePrismaSchema(schema);
    // session.token: required + unique
    expect(output).toContain("token String @unique");
    // patient.medicare_number: optional + unique
    expect(output).toContain("medicare_number String? @unique");
  });

  it("does not emit @unique on fields without unique: true", () => {
    const output = generatePrismaSchema(schema);
    // patient.name is required but NOT unique
    expect(output).toMatch(/^\s+name String$/m);
  });

  it("generates @default on fields with default values", () => {
    const output = generatePrismaSchema(schema);
    // user.active has default: true in schema.yaml
    expect(output).toContain("active Boolean? @default(true)");
  });

  it("generates @@index for fields with indexed: true", () => {
    const output = generatePrismaSchema(schema);
    // appointment.date has indexed: true
    expect(output).toContain("@@index([date])");
    // audit_log.timestamp has indexed: true
    expect(output).toContain("@@index([timestamp])");
  });

  it("auto-indexes FK columns from relations", () => {
    const output = generatePrismaSchema(schema);
    // Every belongs_to relation should have @@index on its FK
    expect(output).toContain("@@index([patientId])");
    expect(output).toContain("@@index([nurseId])");
    expect(output).toContain("@@index([userId])");
  });

  it("generates compound @@index from entity indexes", () => {
    const output = generatePrismaSchema(schema);
    // appointment has indexes: [[nurseId, date]]
    expect(output).toContain("@@index([nurseId, date])");
    // audit_log has indexes: [[entity, entity_id]]
    expect(output).toContain("@@index([entity, entity_id])");
  });
});
