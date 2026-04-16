/**
 * Vitest Global Setup
 *
 * Loads schema.yaml before any test runs, populating the schema cache.
 * This mirrors server startup (src/engine/startup.ts) which calls
 * loadSchema() before handling requests.
 *
 * Without this, tests that call getSchema() (via @/lib/schema) would
 * throw "Schema not loaded" because the cache-only version in
 * schema-types.ts doesn't fall through to fs.readFileSync.
 */

import { loadSchema } from "@/engine/schema-loader";

loadSchema();
