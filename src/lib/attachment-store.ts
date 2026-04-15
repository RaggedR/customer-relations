/**
 * Attachment Store — deep module for file storage concerns.
 *
 * Centralises:
 *  - UPLOADS_DIR constant
 *  - ALLOWED_MIME_TYPES allowlist
 *  - Path-traversal containment checks
 *  - Magic-byte MIME validation (file-type, ESM, loaded via dynamic import)
 *  - Atomic write (temp → rename) with UUID-prefixed filenames
 *
 * file-type v19+ is ESM-only. We use a top-level dynamic import so it
 * can be loaded inside a CJS/bundler context (Next.js with no "type":"module").
 */

import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "text/vcard",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// How many bytes to read for magic-byte detection (file-type recommends ~4 KiB)
const MAGIC_BYTE_SAMPLE = 4096;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface StoredFile {
  /** Full absolute path on disk */
  filePath: string;
  /** Path relative to UPLOADS_DIR — this is what gets stored in the DB */
  storagePath: string;
  /** MIME type detected from magic bytes */
  detectedMimeType: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface FileResult {
  /** Full absolute path on disk */
  fullPath: string;
  /**
   * MIME type from the allowlist, or "application/octet-stream" for unknown
   * types. Never trusts the value stored in the DB directly — re-validates
   * against the allowlist before serving.
   */
  safeMimeType: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Asserts that `fullPath` is contained within `UPLOADS_DIR`.
 * Throws a RangeError if the path escapes the uploads directory.
 */
function assertContained(fullPath: string): void {
  // path.resolve already normalises ".." sequences, so startsWith is safe.
  if (!fullPath.startsWith(UPLOADS_DIR + path.sep)) {
    throw new RangeError(`Path traversal detected: ${fullPath}`);
  }
}

/**
 * Detects the MIME type of `buffer` using magic bytes (file-type).
 * Falls back to "application/octet-stream" when the type cannot be determined.
 *
 * file-type is ESM-only, so we use a dynamic import.
 */
async function detectMimeType(buffer: Buffer): Promise<string> {
  const sample = buffer.subarray(0, MAGIC_BYTE_SAMPLE);
  try {
    const { fileTypeFromBuffer } = await import("file-type");
    const result = await fileTypeFromBuffer(sample);
    return result?.mime ?? "application/octet-stream";
  } catch {
    // If file-type fails for any reason, degrade gracefully.
    return "application/octet-stream";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stores a file for a patient.
 *
 * Validates:
 *  - patientId is a positive integer
 *  - detected MIME type (from magic bytes) is in the allowlist
 *  - the resulting path is contained within UPLOADS_DIR
 *
 * Writes to a `.tmp` file first; the caller is responsible for either
 * renaming it to the final path (on DB success) or deleting it (on DB
 * failure). The `filePath` in the returned `StoredFile` is the FINAL path
 * (without the `.tmp` suffix) — the file is written atomically by this
 * function using an intermediate temp path that is renamed before returning.
 *
 * @throws {RangeError}  if patientId is not a positive integer
 * @throws {TypeError}   if the detected MIME type is not in the allowlist
 * @throws {RangeError}  if path traversal is detected
 */
export async function storeFile(
  patientId: number,
  file: File,
  originalFilename: string
): Promise<StoredFile> {
  // Validate patientId
  if (!Number.isInteger(patientId) || patientId <= 0) {
    throw new RangeError(`patientId must be a positive integer, got: ${patientId}`);
  }

  // Read the file buffer once — used for both magic-byte detection and writing
  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate MIME type via magic bytes (not the browser-supplied Content-Type)
  const detectedMimeType = await detectMimeType(buffer);
  if (!ALLOWED_MIME_TYPES.has(detectedMimeType)) {
    throw new TypeError(`File type not allowed (detected): ${detectedMimeType}`);
  }

  // Sanitise filename — strip path separators, quotes, and control characters
  const safeName = originalFilename.replace(/[/\\"\r\n]/g, "_");
  const uniqueName = `${randomUUID()}-${safeName}`;

  const patientDir = path.join(UPLOADS_DIR, String(patientId));
  const filePath = path.join(patientDir, uniqueName);

  // Containment check before touching the filesystem
  assertContained(filePath);

  await fs.mkdir(patientDir, { recursive: true });

  // Write to temp file, then rename atomically
  const tempPath = filePath + ".tmp";
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, filePath);

  // Relative path for DB storage
  const storagePath = path.relative(UPLOADS_DIR, filePath);

  return {
    filePath,
    storagePath,
    detectedMimeType,
    sizeBytes: buffer.length,
  };
}

/**
 * Resolves a `storagePath` (relative to UPLOADS_DIR, as stored in the DB)
 * to a full absolute path and a safe MIME type.
 *
 * - Re-validates the path against UPLOADS_DIR (path-traversal containment).
 * - Re-validates the MIME type against the allowlist; falls back to
 *   "application/octet-stream" for any type that is no longer on the list.
 *
 * @throws {RangeError} if the resolved path escapes UPLOADS_DIR
 */
export function getFilePath(storagePath: string, storedMimeType?: string): FileResult {
  const fullPath = path.resolve(UPLOADS_DIR, storagePath);

  // Containment check
  assertContained(fullPath);

  // Re-validate MIME against the allowlist — never blindly serve what's in the DB
  const safeMimeType =
    storedMimeType && ALLOWED_MIME_TYPES.has(storedMimeType)
      ? storedMimeType
      : "application/octet-stream";

  return { fullPath, safeMimeType };
}
