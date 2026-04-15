/**
 * E2E test auth constants.
 *
 * These credentials are seeded by the global setup (setup.ts)
 * and used by storageState files for authenticated test contexts.
 */

export const ADMIN_EMAIL = "e2e-admin@test.local";
export const ADMIN_PASSWORD = "e2e-admin-pass";
export const NURSE_EMAIL = "e2e-nurse@test.local";
export const NURSE_PASSWORD = "e2e-nurse-pass";

export const ADMIN_STORAGE = "tests/e2e/.auth/admin.json";
export const NURSE_STORAGE = "tests/e2e/.auth/nurse.json";

export const BASE_URL = "http://localhost:3000";
