/**
 * Watermarked Image Renderer Tests
 *
 * Verifies that renderWatermarkedImage() produces valid PNG buffers
 * with the watermark baked into the pixel data.
 */

import { describe, it, expect } from "vitest";
import { renderWatermarkedImage } from "@/lib/image-renderer";

// PNG magic bytes: 0x89 P N G
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("renderWatermarkedImage", () => {
  const sampleContent = "Initial assessment completed. Patient reports difficulty hearing in noisy environments. Recommended bilateral hearing aids.";
  const nurseName = "Jane Smith";
  const timestamp = new Date("2026-04-14T10:30:00");

  it("returns a valid PNG buffer", () => {
    const buf = renderWatermarkedImage(sampleContent, nurseName, timestamp);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });

  it("different watermark text produces different buffer", () => {
    const buf1 = renderWatermarkedImage(sampleContent, "Jane Smith", timestamp);
    const buf2 = renderWatermarkedImage(sampleContent, "Bob Jones", timestamp);
    expect(buf1.equals(buf2)).toBe(false);
  });

  it("different timestamps produce different buffer", () => {
    const buf1 = renderWatermarkedImage(sampleContent, nurseName, new Date("2026-04-14T10:30:00"));
    const buf2 = renderWatermarkedImage(sampleContent, nurseName, new Date("2026-04-14T11:00:00"));
    expect(buf1.equals(buf2)).toBe(false);
  });

  it("handles long content without error", () => {
    const longContent = "This is a long clinical note. ".repeat(50);
    const buf = renderWatermarkedImage(longContent, nurseName, timestamp);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });

  it("handles empty content gracefully", () => {
    const buf = renderWatermarkedImage("", nurseName, timestamp);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });

  it("handles content with newlines (multiple paragraphs)", () => {
    const content = "First paragraph.\n\nSecond paragraph.\nThird line.";
    const buf = renderWatermarkedImage(content, nurseName, timestamp);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });
});
