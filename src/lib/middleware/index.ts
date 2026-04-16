/**
 * Middleware — Public API
 *
 * Re-exports the composable middleware system.
 */

// Builder
export { route, RouteBuilder } from "./builder";

// Individual layers
export { withTrace } from "./with-trace";
export { withSession } from "./with-session";
export { withRole } from "./with-role";
export { withNurseContext } from "./with-nurse-context";
export { withPatientContext } from "./with-patient-context";
export { withRateLimit } from "./with-rate-limit";
export { withParsedId } from "./with-parsed-id";

// Pre-composed stacks
export {
  adminRoute,
  adminIdRoute,
  nurseRoute,
  nurseIdRoute,
  patientRoute,
  publicRoute,
} from "./stacks";

// Async context
export { getCorrelationId, getCurrentUserId } from "./async-context";

// Types
export type {
  TraceContext,
  SessionContext,
  NurseContext,
  PatientContext,
  IdContext,
  AuditContext,
  Middleware,
  Handler,
  RouteHandler,
} from "./types";
