/**
 * Tests for AI SQL safety sanitiser.
 *
 * The AI endpoint generates SQL from user questions via an LLM.
 * The sanitiser must block anything that isn't a pure read query.
 */

import { describe, it, expect } from "vitest";
import { validateAiSql } from "@/lib/sql-safety";

describe("SQL safety — allowed queries", () => {
  it("allows simple SELECT", () => {
    const r = validateAiSql('SELECT * FROM "Patient"');
    expect(r.safe).toBe(true);
  });

  it("allows SELECT with WHERE", () => {
    const r = validateAiSql('SELECT name FROM "Patient" WHERE status = \'active\'');
    expect(r.safe).toBe(true);
  });

  it("allows SELECT with JOIN", () => {
    const r = validateAiSql(
      'SELECT p.name, r.referring_gp FROM "Patient" p LEFT JOIN "Referral" r ON r."patientId" = p.id'
    );
    expect(r.safe).toBe(true);
  });

  it("allows SELECT with subquery", () => {
    const r = validateAiSql(
      'SELECT * FROM "Patient" WHERE id IN (SELECT "patientId" FROM "Referral")'
    );
    expect(r.safe).toBe(true);
  });

  it("allows WITH ... SELECT (read-only CTE)", () => {
    const r = validateAiSql(
      'WITH recent AS (SELECT * FROM "ClinicalNote" WHERE date > NOW() - INTERVAL \'7 days\') SELECT * FROM recent'
    );
    expect(r.safe).toBe(true);
  });

  it("allows aggregate functions", () => {
    const r = validateAiSql(
      'SELECT COUNT(*), status FROM "Patient" GROUP BY status'
    );
    expect(r.safe).toBe(true);
  });

  it("allows CASE expressions", () => {
    const r = validateAiSql(
      'SELECT name, CASE WHEN status = \'active\' THEN \'Yes\' ELSE \'No\' END FROM "Patient"'
    );
    expect(r.safe).toBe(true);
  });

  it("allows COALESCE and string functions", () => {
    const r = validateAiSql(
      'SELECT COALESCE(name, \'Unknown\'), LOWER(email) FROM "Patient"'
    );
    expect(r.safe).toBe(true);
  });

  it("allows LIMIT and OFFSET", () => {
    const r = validateAiSql('SELECT * FROM "Patient" LIMIT 10 OFFSET 5');
    expect(r.safe).toBe(true);
  });

  it("allows similarity() for fuzzy matching", () => {
    const r = validateAiSql(
      'SELECT * FROM "Patient" WHERE similarity(LOWER(name), \'susan\') > 0.15'
    );
    expect(r.safe).toBe(true);
  });
});

describe("SQL safety — blocked DML/DDL", () => {
  // These all fail the "must start with SELECT/WITH" check first,
  // which is correct — they're blocked. The keyword scanner is the
  // second line of defence for when DML is embedded inside a CTE.

  it("blocks DELETE", () => {
    const r = validateAiSql('DELETE FROM "Patient"');
    expect(r.safe).toBe(false);
  });

  it("blocks INSERT", () => {
    const r = validateAiSql('INSERT INTO "Patient" (name) VALUES (\'x\')');
    expect(r.safe).toBe(false);
  });

  it("blocks UPDATE", () => {
    const r = validateAiSql('UPDATE "Patient" SET name = \'pwned\'');
    expect(r.safe).toBe(false);
  });

  it("blocks DROP TABLE", () => {
    const r = validateAiSql('DROP TABLE "Patient"');
    expect(r.safe).toBe(false);
  });

  it("blocks ALTER TABLE", () => {
    const r = validateAiSql('ALTER TABLE "Patient" ADD COLUMN pwned TEXT');
    expect(r.safe).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    const r = validateAiSql('TRUNCATE "Patient"');
    expect(r.safe).toBe(false);
  });

  it("blocks CREATE", () => {
    const r = validateAiSql('CREATE TABLE evil (id INT)');
    expect(r.safe).toBe(false);
  });

  it("blocks GRANT", () => {
    const r = validateAiSql('GRANT ALL ON "Patient" TO attacker');
    expect(r.safe).toBe(false);
  });

  it("blocks COPY", () => {
    const r = validateAiSql("COPY \"Patient\" TO '/tmp/dump.csv'");
    expect(r.safe).toBe(false);
  });
});

describe("SQL safety — bypass attempts", () => {
  it("blocks writable CTE with DELETE", () => {
    const r = validateAiSql(
      'WITH del AS (DELETE FROM "Patient" RETURNING *) SELECT * FROM del'
    );
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("DELETE");
  });

  it("blocks writable CTE with UPDATE", () => {
    const r = validateAiSql(
      'WITH upd AS (UPDATE "Patient" SET name = \'x\' RETURNING *) SELECT * FROM upd'
    );
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("UPDATE");
  });

  it("blocks writable CTE with INSERT", () => {
    const r = validateAiSql(
      'WITH ins AS (INSERT INTO "Patient" (name) VALUES (\'x\') RETURNING *) SELECT * FROM ins'
    );
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("INSERT");
  });

  it("blocks multi-statement: SELECT; DROP TABLE", () => {
    const r = validateAiSql('SELECT 1; DROP TABLE "Patient"');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("multiple statements");
  });

  it("blocks multi-statement: SELECT; DELETE", () => {
    const r = validateAiSql('SELECT 1; DELETE FROM "Patient"');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("multiple statements");
  });

  it("blocks system catalog access: pg_stat_activity", () => {
    const r = validateAiSql("SELECT * FROM pg_stat_activity");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("system catalog");
  });

  it("blocks system catalog access: information_schema", () => {
    const r = validateAiSql("SELECT * FROM information_schema.tables");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("system catalog");
  });

  it("blocks system catalog access: pg_catalog", () => {
    const r = validateAiSql("SELECT * FROM pg_catalog.pg_class");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("system catalog");
  });

  it("blocks pg_shadow (password hashes)", () => {
    const r = validateAiSql("SELECT * FROM pg_shadow");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("system catalog");
  });

  it("blocks pg_authid", () => {
    const r = validateAiSql("SELECT * FROM pg_authid");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("system catalog");
  });

  it("blocks case-mixed DML: DeLeTe", () => {
    const r = validateAiSql('DeLeTe FROM "Patient"');
    expect(r.safe).toBe(false);
  });

  it("blocks DML inside comments (scanner strips comments first)", () => {
    const r = validateAiSql("SELECT 1 /* ; DELETE FROM Patient */");
    // Comments contain suspicious content but the scanner operates on
    // the comment-stripped version. Semicolons inside comments are fine.
    // But we shouldn't trust Gemini to use comments innocently.
    // Conservative: block queries with SQL comments entirely.
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("comment");
  });

  it("blocks single-line comment", () => {
    const r = validateAiSql('SELECT 1 -- DELETE FROM "Patient"');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("comment");
  });

  it("allows apostrophes in string literals (not confused with comments)", () => {
    const r = validateAiSql(
      "SELECT * FROM \"Patient\" WHERE name ILIKE '%o''brien%'"
    );
    expect(r.safe).toBe(true);
  });

  it("blocks empty string", () => {
    const r = validateAiSql("");
    expect(r.safe).toBe(false);
  });

  it("blocks whitespace-only string", () => {
    const r = validateAiSql("   \n\t  ");
    expect(r.safe).toBe(false);
  });

  it("does not false-positive on UPDATED_AT column name", () => {
    const r = validateAiSql('SELECT "updatedAt" FROM "Patient"');
    expect(r.safe).toBe(true);
  });

  it("does not false-positive on 'created' in column name", () => {
    const r = validateAiSql('SELECT "createdAt" FROM "Patient"');
    expect(r.safe).toBe(true);
  });

  it("does not false-positive on DELETE in a string literal", () => {
    const r = validateAiSql(
      "SELECT * FROM \"Patient\" WHERE notes ILIKE '%delete%'"
    );
    expect(r.safe).toBe(true);
  });

  it("does not false-positive on UPDATE in a string literal", () => {
    const r = validateAiSql(
      "SELECT * FROM \"ClinicalNote\" WHERE content ILIKE '%update the plan%'"
    );
    expect(r.safe).toBe(true);
  });
});
