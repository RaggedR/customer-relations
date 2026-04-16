/**
 * Pre-Composed Middleware Stacks
 *
 * Each function returns a RouteBuilder pre-loaded with the standard
 * middleware chain for that route category. Handlers only need to
 * call .handle() with their business logic.
 *
 * The stacks enforce structural coverage:
 * - nurseRoute() always includes AUP verification
 * - patientRoute() always resolves the patient record
 * - adminRoute() always verifies admin role
 */

import { route } from "./builder";
import { withTrace } from "./with-trace";
import { withSession } from "./with-session";
import { withRole } from "./with-role";
import { withNurseContext } from "./with-nurse-context";
import { withPatientContext } from "./with-patient-context";
import { withParsedId } from "./with-parsed-id";

/** Admin routes: trace → session → admin role */
export function adminRoute() {
  return route()
    .use(withTrace)
    .use(withSession)
    .use(withRole("admin"));
}

/** Admin route with parsed ID param: trace → session → admin → ID */
export function adminIdRoute() {
  return route()
    .use(withTrace)
    .use(withSession)
    .use(withRole("admin"))
    .use(withParsedId);
}

/** Nurse portal: trace → session → nurse role → nurse resolution + AUP */
export function nurseRoute() {
  return route()
    .use(withTrace)
    .use(withSession)
    .use(withRole("nurse"))
    .use(withNurseContext);
}

/** Nurse portal with parsed ID: trace → session → nurse → resolution → ID */
export function nurseIdRoute() {
  return route()
    .use(withTrace)
    .use(withSession)
    .use(withRole("nurse"))
    .use(withNurseContext)
    .use(withParsedId);
}

/** Patient portal: trace → session → patient role → patient resolution */
export function patientRoute() {
  return route()
    .use(withTrace)
    .use(withSession)
    .use(withRole("patient"))
    .use(withPatientContext);
}

/** Public routes: trace only (no auth) */
export function publicRoute() {
  return route()
    .use(withTrace);
}
