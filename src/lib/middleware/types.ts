/**
 * Middleware Types — Kleisli Arrow Signatures
 *
 * Each middleware is a Kleisli arrow: (ctx: A) → Promise<NextResponse | B>
 * where B ⊇ A. Composition chains these arrows, short-circuiting on
 * NextResponse (the "Left" branch of the Either monad).
 *
 * TypeScript intersection types express the context enrichment:
 * each layer declares what it adds, and the composed type is the
 * intersection of all additions.
 */

import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/auth";
import type { AuditEvent } from "@/lib/audit";

// ── Context layers ──────────────────────────────────────

/** Base context — created by withTrace. Always present. */
export interface TraceContext {
  request: NextRequest;
  correlationId: string;
  ip: string | undefined;
  userAgent: string | undefined;
}

/** Added by withSession — verified JWT identity. */
export interface SessionContext {
  userId: number;
  role: Role;
}

/** Added by withNurseContext — resolved nurse record + AUP verified. */
export interface NurseContext {
  nurse: {
    id: number;
    name: string | null;
    email: string | null;
    userId: number | null;
    aup_acknowledged_at: Date | null;
  };
}

/** Added by withPatientContext — resolved patient record (full Prisma row). */
export interface PatientContext {
  patient: Record<string, unknown> & {
    id: number;
    name: string | null;
    email: string | null;
  };
}

/** Added by withParsedId — parsed numeric ID from route params. */
export interface IdContext {
  entityId: number;
}

/** Added once session is available — convenience audit method. */
export interface AuditContext {
  audit: (event: Omit<AuditEvent, "context">) => void;
}

// ── Arrow types ─────────────────────────────────────────

/**
 * A Kleisli arrow (middleware layer).
 *
 * Takes context In, returns either:
 * - NextResponse (short-circuit: 401, 403, 429, etc.)
 * - Enriched context Out (passes to the next layer)
 */
export type Middleware<In, Out> = (ctx: In) => Promise<NextResponse | Out>;

/**
 * Terminal handler — receives the fully-built context and returns a response.
 */
export type Handler<Ctx> = (ctx: Ctx) => Promise<NextResponse>;

// ── Route handler signature (Next.js App Router) ────────

export type RouteParams = { params: Promise<Record<string, string>> };
export type RouteHandler = (
  request: NextRequest,
  context?: RouteParams,
) => Promise<NextResponse>;
