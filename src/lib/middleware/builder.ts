/**
 * Route Builder — Kleisli Composition via Fluent API
 *
 * Composes middleware layers into a single route handler.
 * Each .use() call adds a Kleisli arrow to the chain.
 * The .handle() call terminates the chain with a handler
 * and wraps everything in error handling + AsyncLocalStorage.
 *
 * Usage:
 *   export const GET = route()
 *     .use(withTrace)
 *     .use(withSession)
 *     .use(withRole("admin"))
 *     .handle(async (ctx) => {
 *       // ctx is fully typed with all enrichments
 *       return NextResponse.json({ ok: true });
 *     });
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requestStore } from "./async-context";
import type {
  Middleware,
  Handler,
  RouteHandler,
  RouteParams,
  TraceContext,
  SessionContext,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMiddleware = Middleware<any, any>;

/**
 * Fluent builder for composing middleware into a route handler.
 *
 * Type parameter Ctx tracks the accumulated context type as
 * layers are added via .use().
 */
export class RouteBuilder<Ctx> {
  private middlewares: AnyMiddleware[] = [];
  private label = "route";

  /**
   * Add a middleware layer to the chain.
   *
   * The middleware receives the current context and either
   * short-circuits (returns NextResponse) or returns an
   * enriched context that extends Ctx with Added.
   */
  use<Added>(
    mw: Middleware<Ctx, Ctx & Added>,
  ): RouteBuilder<Ctx & Added> {
    this.middlewares.push(mw as AnyMiddleware);
    return this as unknown as RouteBuilder<Ctx & Added>;
  }

  /** Set a label for error logging (used in withErrorHandler). */
  named(name: string): this {
    this.label = name;
    return this;
  }

  /**
   * Terminate the chain with a handler.
   *
   * Returns a function matching Next.js App Router's route handler
   * signature: (request, context?) => Promise<NextResponse>.
   *
   * The entire chain runs inside:
   * 1. AsyncLocalStorage via enterWith() — propagates correlationId.
   *    enterWith is used instead of run() because the middleware chain
   *    is not a single callback but a sequential loop. Each request
   *    arrives in its own async context in Node.js, so enterWith is safe.
   * 2. try/catch — maps errors to 500 responses (withErrorHandler)
   */
  handle(handler: Handler<Ctx>): RouteHandler {
    const mws = [...this.middlewares];
    const routeLabel = this.label;

    return async (
      request: NextRequest,
      routeContext?: RouteParams,
    ): Promise<NextResponse> => {
      // The outermost layer: error boundary
      try {
        // Start with the raw request + route params
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let ctx: any = { request, _routeParams: routeContext };

        // Run through each middleware (Kleisli composition)
        for (const mw of mws) {
          const result = await mw(ctx);
          if (result instanceof NextResponse) return result;
          ctx = result;
        }

        // If withTrace has set up the store, update userId from session
        const store = requestStore.getStore();
        if (store && "userId" in ctx) {
          store.userId = (ctx as { userId: number }).userId;
        }

        // Terminal handler
        return await handler(ctx);
      } catch (error) {
        // Replicate withErrorHandler's error mapping
        const message = (error as Error).message ?? "";
        if (
          message.startsWith("Unknown entity:") ||
          message.startsWith("No Prisma model found for entity")
        ) {
          return NextResponse.json({ error: message }, { status: 404 });
        }
        if (message.startsWith("Invalid sort field:")) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        if (message === "CONFLICT") {
          return NextResponse.json(
            { error: "Record was modified by another request. Please reload and try again." },
            { status: 409 },
          );
        }
        logger.error(
          { err: error, label: routeLabel },
          "Request handler error",
        );
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      }
    };
  }
}

/** Create a new route builder. */
export function route(): RouteBuilder<{ request: NextRequest; _routeParams?: RouteParams }> {
  return new RouteBuilder();
}
