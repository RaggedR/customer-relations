/**
 * Watermarked Image Renderer
 *
 * Renders clinical content as a server-generated PNG with an embedded
 * watermark (nurse name + timestamp). The watermark is baked into the
 * pixel data — it cannot be removed via browser dev tools.
 *
 * This is a security control for the nurse portal: clinical notes are
 * served as flat raster images, never as selectable HTML text.
 */

import { createCanvas, type CanvasRenderingContext2D } from "canvas";

// ── Constants ────────────────────────────────────────────

const CANVAS_WIDTH = 800;
const MIN_CANVAS_HEIGHT = 120;
const MARGIN = 40;
const CONTENT_WIDTH = CANVAS_WIDTH - MARGIN * 2;
const CONTENT_FONT = "14px sans-serif";
const LINE_HEIGHT = 20;
const WATERMARK_FONT = "bold 18px sans-serif";
const WATERMARK_ANGLE = -0.52; // ~30° counter-clockwise
const WATERMARK_OPACITY = 0.15;
const WATERMARK_COLOUR = "#888888";
const WATERMARK_SPACING_X = 300;
const WATERMARK_SPACING_Y = 150;

// ── Word wrapping ────────────────────────────────────────

/**
 * Wrap text to fit within maxWidth pixels using the given canvas context.
 * Returns an array of lines.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ── Timestamp formatting ─────────────────────────────────

function formatTimestamp(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${d}/${m}/${y} ${h}:${min}`;
}

// ── Renderer ─────────────────────────────────────────────

/**
 * Render clinical content as a watermarked PNG image.
 *
 * @param content   The clinical note text to render
 * @param nurseName The viewing nurse's full name (baked into watermark)
 * @param timestamp When the image was generated (baked into watermark)
 * @returns         PNG image as a Buffer
 */
export function renderWatermarkedImage(
  content: string,
  nurseName: string,
  timestamp: Date,
): Buffer {
  // First pass: measure content to determine canvas height
  const measureCanvas = createCanvas(CANVAS_WIDTH, MIN_CANVAS_HEIGHT);
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = CONTENT_FONT;
  const lines = wrapText(measureCtx, content || "(No content)", CONTENT_WIDTH);
  const contentHeight = lines.length * LINE_HEIGHT + MARGIN * 2;
  const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, contentHeight);

  // Create the real canvas
  const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

  // Render content text
  ctx.fillStyle = "#000000";
  ctx.font = CONTENT_FONT;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], MARGIN, MARGIN + i * LINE_HEIGHT + 14); // +14 for baseline
  }

  // Render watermark overlay
  const watermarkText = `${nurseName} \u2014 ${formatTimestamp(timestamp)}`;
  ctx.save();
  ctx.globalAlpha = WATERMARK_OPACITY;
  ctx.fillStyle = WATERMARK_COLOUR;
  ctx.font = WATERMARK_FONT;
  ctx.rotate(WATERMARK_ANGLE);

  // Tile watermark across the canvas — extend beyond bounds to cover rotated area
  const diagonal = Math.sqrt(CANVAS_WIDTH ** 2 + canvasHeight ** 2);
  for (let y = -diagonal; y < diagonal; y += WATERMARK_SPACING_Y) {
    for (let x = -diagonal; x < diagonal; x += WATERMARK_SPACING_X) {
      ctx.fillText(watermarkText, x, y);
    }
  }

  ctx.restore();

  return canvas.toBuffer("image/png");
}
