/**
 * E2E test fixture helpers.
 *
 * All test data is prefixed with E2E_PREFIX for isolation and cleanup.
 * Uses Playwright's APIRequestContext to create/delete records via the API.
 */

import type { APIRequestContext } from "playwright/test";

export const E2E_PREFIX = "[E2E]";

// --- Default fixture data ---

function defaultPatient(overrides?: Record<string, unknown>) {
  return {
    name: `${E2E_PREFIX} Ada Lovelace`,
    date_of_birth: "1990-01-15",
    medicare_number: "1234567890",
    phone: "0412345678",
    email: "ada@test.local",
    address: "42 Test Street, Melbourne VIC 3000",
    status: "active",
    notes: "E2E test patient",
    ...overrides,
  };
}

function defaultNurse(overrides?: Record<string, unknown>) {
  return {
    name: `${E2E_PREFIX} Florence Nightingale`,
    phone: "0498765432",
    email: "florence@test.local",
    registration_number: "NR-E2E-001",
    notes: "E2E test nurse",
    ...overrides,
  };
}

function defaultAppointment(
  patientId: number,
  nurseId: number,
  overrides?: Record<string, unknown>,
) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];

  return {
    date: dateStr,
    start_time: "10:00",
    end_time: "10:30",
    location: "E2E Clinic",
    specialty: "Audiology",
    status: "confirmed",
    notes: `${E2E_PREFIX} test appointment`,
    patient: patientId,
    nurse: nurseId,
    ...overrides,
  };
}

// --- API helpers ---

export async function createPatient(
  request: APIRequestContext,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/patient", {
    data: defaultPatient(overrides),
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createPatient failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createNurse(
  request: APIRequestContext,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/nurse", {
    data: defaultNurse(overrides),
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createNurse failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createAppointment(
  request: APIRequestContext,
  patientId: number,
  nurseId: number,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/appointment", {
    data: defaultAppointment(patientId, nurseId, overrides),
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createAppointment failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createClinicalNote(
  request: APIRequestContext,
  patientId: number,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/clinical_note", {
    data: {
      date: new Date().toISOString(),
      note_type: "initial_assessment",
      content: `${E2E_PREFIX} Initial assessment findings`,
      clinician: "Dr. E2E Test",
      patient: patientId,
      ...overrides,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createClinicalNote failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createPersonalNote(
  request: APIRequestContext,
  patientId: number,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/personal_note", {
    data: {
      date: new Date().toISOString(),
      content: `${E2E_PREFIX} Personal observation note`,
      patient: patientId,
      ...overrides,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createPersonalNote failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createHearingAid(
  request: APIRequestContext,
  patientId: number,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/hearing_aid", {
    data: {
      ear: "left",
      make: "Phonak",
      model: "E2E-Paradise",
      serial_number: `E2E-SN-${Date.now()}`,
      battery_type: "312",
      patient: patientId,
      ...overrides,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createHearingAid failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createReferral(
  request: APIRequestContext,
  patientId: number,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/referral", {
    data: {
      referring_gp: `${E2E_PREFIX} Dr. Referrer`,
      gp_practice: "E2E Medical Centre",
      referral_date: new Date().toISOString().split("T")[0],
      reason: "Hearing assessment",
      patient: patientId,
      ...overrides,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createReferral failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function createClaimItem(
  request: APIRequestContext,
  patientId: number,
  overrides?: Record<string, unknown>,
) {
  const res = await request.post("/api/claim_item", {
    data: {
      item_number: `E2E-${Date.now()}`,
      description: "E2E test claim",
      date_of_service: new Date().toISOString().split("T")[0],
      amount: 150.0,
      status: "pending",
      patient: patientId,
      ...overrides,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`createClaimItem failed (${res.status()}): ${body}`);
  }
  return res.json();
}

export async function deleteEntity(
  request: APIRequestContext,
  entity: string,
  id: number,
) {
  const res = await request.delete(`/api/${entity}/${id}`);
  return res;
}

/**
 * Cleanup all E2E test data by deleting [E2E]-prefixed patients and nurses.
 * Cascade deletes handle child records (notes, hearing aids, referrals, etc.).
 */
export async function cleanup(request: APIRequestContext) {
  // Delete patients (cascades to notes, hearing aids, referrals, claims, appointments)
  const patients = await request.get(`/api/patient?search=${encodeURIComponent(E2E_PREFIX)}`);
  if (patients.ok()) {
    const list = await patients.json();
    for (const p of list) {
      await request.delete(`/api/patient/${p.id}`);
    }
  }

  // Delete nurses
  const nurses = await request.get(`/api/nurse?search=${encodeURIComponent(E2E_PREFIX)}`);
  if (nurses.ok()) {
    const list = await nurses.json();
    for (const n of list) {
      await request.delete(`/api/nurse/${n.id}`);
    }
  }
}
