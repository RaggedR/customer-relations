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
    expect(output).toContain("model Company {");
    expect(output).toContain("model Contact {");
    expect(output).toContain("model Interaction {");
    expect(output).toContain("model Deal {");
  });

  it("generates required fields without ? suffix", () => {
    const output = generatePrismaSchema(schema);
    // name is required on Contact
    expect(output).toMatch(/name String\b(?!\?)/);
  });

  it("generates optional fields with ? suffix", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("email String?");
    expect(output).toContain("phone String?");
  });

  it("generates foreign key fields for belongs_to relations", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("companyId Int?");
    expect(output).toContain("contactId Int?");
  });

  it("generates relation fields", () => {
    const output = generatePrismaSchema(schema);
    expect(output).toContain("company Company? @relation");
    expect(output).toContain("contact Contact? @relation");
  });

  it("generates reverse relation arrays", () => {
    const output = generatePrismaSchema(schema);
    // Company should have contacts[] and deals[]
    expect(output).toContain("contacts Contact[]");
    expect(output).toContain("deals Deal[]");
  });

  it("includes id, createdAt, updatedAt on all models", () => {
    const output = generatePrismaSchema(schema);
    const models = output.split("model ");
    for (const model of models.slice(1)) {
      expect(model).toContain("id        Int      @id @default(autoincrement())");
      expect(model).toContain("createdAt DateTime @default(now())");
      expect(model).toContain("updatedAt DateTime @updatedAt");
    }
  });
});
