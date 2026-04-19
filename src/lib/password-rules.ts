/**
 * Password Strength Rules — shared between server validation and client UI.
 *
 * This module has NO server-side dependencies (no node:crypto) so it can
 * be imported in both API routes and "use client" components.
 */

export const PASSWORD_STRENGTH_RULES: {
  test: (p: string) => boolean;
  message: string;
}[] = [
  { test: (p) => p.length >= 8, message: "At least 8 characters" },
  { test: (p) => /[A-Z]/.test(p), message: "At least one uppercase letter" },
  { test: (p) => /[a-z]/.test(p), message: "At least one lowercase letter" },
  { test: (p) => /[0-9]/.test(p), message: "At least one digit" },
  { test: (p) => /[^A-Za-z0-9]/.test(p), message: "At least one special character" },
];

/**
 * Validate password strength. Returns an array of unmet rule messages.
 * Empty array = password is strong enough.
 */
export function validatePasswordStrength(password: string): string[] {
  return PASSWORD_STRENGTH_RULES.filter((r) => !r.test(password)).map((r) => r.message);
}
