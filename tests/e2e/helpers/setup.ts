/**
 * Playwright Global Setup
 *
 * Runs once before all tests:
 * 1. Seeds admin and nurse users (via Prisma — no user creation API exists)
 * 2. Creates a nurse entity for the nurse user (needed for appointment tests)
 * 3. Logs in via the API and builds storageState files with session cookies
 */

import "dotenv/config";
import { type FullConfig } from "playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../../src/lib/password";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  NURSE_EMAIL,
  NURSE_PASSWORD,
  ADMIN_STORAGE,
  NURSE_STORAGE,
  BASE_URL,
} from "./auth";
import { E2E_PREFIX } from "./fixtures";

import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";

/**
 * Login via API and return a storageState object with the session cookie.
 */
async function loginAndGetStorageState(
  baseURL: string,
  email: string,
  password: string,
) {
  const res = await fetch(`${baseURL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed for ${email} (${res.status}): ${body}`);
  }

  // Extract session cookie from Set-Cookie header
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const sessionCookie = setCookie.find((c) => c.startsWith("session="));
  if (!sessionCookie) {
    throw new Error(`No session cookie returned for ${email}`);
  }

  // Parse cookie value
  const tokenMatch = sessionCookie.match(/^session=([^;]+)/);
  const token = tokenMatch?.[1] ?? "";

  // Build Playwright storageState format
  return {
    cookies: [
      {
        name: "session",
        value: token,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Strict" as const,
      },
    ],
    origins: [],
  };
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? BASE_URL;

  // Ensure auth directory exists
  mkdirSync(dirname(ADMIN_STORAGE), { recursive: true });

  // --- Seed users via Prisma (v7 requires driver adapter) ---
  const adapter = new PrismaPg(process.env.DATABASE_URL || "");
  const prisma = new PrismaClient({ adapter });
  try {
    // Admin user
    const existingAdmin = await prisma.user.findFirst({
      where: { email: ADMIN_EMAIL },
    });
    if (!existingAdmin) {
      const adminHash = await hashPassword(ADMIN_PASSWORD);
      await prisma.user.create({
        data: {
          name: `${E2E_PREFIX} Admin`,
          email: ADMIN_EMAIL,
          password_hash: adminHash,
          role: "admin",
          active: true,
        },
      });
    }

    // Nurse user
    const existingNurse = await prisma.user.findFirst({
      where: { email: NURSE_EMAIL },
    });
    if (!existingNurse) {
      const nurseHash = await hashPassword(NURSE_PASSWORD);
      await prisma.user.create({
        data: {
          name: `${E2E_PREFIX} Test Nurse`,
          email: NURSE_EMAIL,
          password_hash: nurseHash,
          role: "nurse",
          active: true,
        },
      });
    }

    // Nurse entity (for appointment relation dropdowns)
    const existingNurseEntity = await prisma.nurse.findFirst({
      where: { name: `${E2E_PREFIX} Test Nurse` },
    });
    if (!existingNurseEntity) {
      await prisma.nurse.create({
        data: {
          name: `${E2E_PREFIX} Test Nurse`,
          email: NURSE_EMAIL,
          phone: "0400000000",
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  // --- Login via API and save storageState ---
  const adminState = await loginAndGetStorageState(
    baseURL,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  );
  writeFileSync(ADMIN_STORAGE, JSON.stringify(adminState, null, 2));

  const nurseState = await loginAndGetStorageState(
    baseURL,
    NURSE_EMAIL,
    NURSE_PASSWORD,
  );
  writeFileSync(NURSE_STORAGE, JSON.stringify(nurseState, null, 2));
}
