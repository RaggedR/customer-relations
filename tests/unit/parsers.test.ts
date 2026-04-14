import { describe, it, expect } from "vitest";
import { parseFile, MAX_IMPORT_BYTES } from "@/lib/parsers";

describe("parseFile — file size limit", () => {
  it("rejects buffers larger than MAX_IMPORT_BYTES", async () => {
    const oversized = Buffer.alloc(MAX_IMPORT_BYTES + 1);
    await expect(parseFile(oversized, "data.csv")).rejects.toThrow(
      /Import file too large/,
    );
  });

  it("accepts buffer at exactly MAX_IMPORT_BYTES", async () => {
    // Buffer at the limit with valid CSV content won't throw the size error
    // (it may throw a parse error since it's zeros, but NOT a size error)
    const atLimit = Buffer.alloc(MAX_IMPORT_BYTES);
    await expect(parseFile(atLimit, "data.csv")).resolves.not.toThrow(
      /Import file too large/,
    );
  });

  it("error message includes actual file size", async () => {
    const size = MAX_IMPORT_BYTES + 512 * 1024; // ~10.5 MB
    const oversized = Buffer.alloc(size);
    await expect(parseFile(oversized, "data.csv")).rejects.toThrow("10.5 MB");
  });

  it("parses a small valid CSV", async () => {
    const csv = Buffer.from("name,age\nAlice,30\nBob,25\n");
    const rows = await parseFile(csv, "patients.csv");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", age: "30" });
  });
});
