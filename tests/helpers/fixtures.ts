/**
 * Canonical Test Fixtures
 *
 * These objects represent the data we create for roundtrip tests.
 * They use the field names from schema.yaml (snake_case).
 *
 * Convention: all names start with "[ROUNDTRIP]" to isolate test data
 * from real data in the shared dev database.
 */

/** Input data for creating a test patient via repository.create() */
export const PATIENT_FIXTURE = {
  name: "[ROUNDTRIP] Ada Lovelace",
  date_of_birth: "1815-12-10",
  medicare_number: "RT-MEDICARE-001",
  phone: "0400000001",
  email: "ada@roundtrip-test.example",
  address: "42 Test Street, Melbourne VIC 3000",
  status: "active",
  notes: "Roundtrip test patient — safe to delete",
} as const;

/** A second patient for multi-record tests */
export const PATIENT_FIXTURE_2 = {
  name: "[ROUNDTRIP] Grace Hopper",
  date_of_birth: "1906-12-09",
  medicare_number: "RT-MEDICARE-002",
  phone: "0400000002",
  email: "grace@roundtrip-test.example",
  address: "99 Debug Avenue, Sydney NSW 2000",
  status: "active",
  notes: "Second roundtrip test patient",
} as const;

/**
 * Input data for creating test hearing aids.
 * The `patient` field is set at test time to the created patient's ID.
 */
export function hearingAidFixtures(patientId: number) {
  return [
    {
      patient: patientId,
      ear: "left",
      make: "Phonak",
      model: "Audéo P90",
      serial_number: "RT-TEST-001",
      battery_type: "312",
      wax_filter: "CeruShield",
      dome: "Open",
      programming_cable: "iCube II",
      programming_software: "Target 9.0",
      hsp_code: "HSP-001",
      warranty_end_date: "2027-06-30",
      last_repair_details: "Replaced receiver, cost $200",
      repair_address: "123 Repair Lane, Melbourne VIC 3000",
    },
    {
      patient: patientId,
      ear: "right",
      make: "Oticon",
      model: "Real 1",
      serial_number: "RT-TEST-002",
      battery_type: "Rechargeable",
      wax_filter: "ProWax miniFit",
      dome: "Bass double",
      programming_cable: "NOAHlink Wireless",
      programming_software: "Genie 2",
      hsp_code: "HSP-002",
      warranty_end_date: "2028-01-15",
      last_repair_details: null,
      repair_address: null,
    },
  ] as const;
}

/**
 * Edge-case hearing aid fixtures that stress CSV/xlsx serialization.
 */
export function hearingAidEdgeCaseFixtures(patientId: number) {
  return {
    /** Commas and quotes in text fields */
    commasAndQuotes: {
      patient: patientId,
      ear: "left",
      make: "Starkey",
      model: 'Genesis AI "Evolv"',
      serial_number: "RT-EDGE-001",
      battery_type: "13",
      wax_filter: null,
      dome: null,
      programming_cable: null,
      programming_software: null,
      hsp_code: null,
      warranty_end_date: null,
      last_repair_details: "Replaced receiver, microphone, and dome — total cost $350",
      repair_address: 'Suite 5, Level 2, "The Health Hub", 100 Collins St',
    },
    /** Unicode characters */
    unicode: {
      patient: patientId,
      ear: "right",
      make: "Signia",
      model: "Styletto AX — für Müller",
      serial_number: "RT-EDGE-002",
      battery_type: "Lithium-Ion™",
      wax_filter: "Cerustop®",
      dome: "Tulip — größe M",
      programming_cable: null,
      programming_software: null,
      hsp_code: null,
      warranty_end_date: "2026-12-31",
      last_repair_details: null,
      repair_address: "42 Müller Straße, München",
    },
    /** Newlines in text fields */
    newlines: {
      patient: patientId,
      ear: "left",
      make: "Widex",
      model: "Moment Sheer",
      serial_number: "RT-EDGE-003",
      battery_type: "312",
      wax_filter: null,
      dome: null,
      programming_cable: null,
      programming_software: null,
      hsp_code: null,
      warranty_end_date: null,
      last_repair_details: "Line one of repair notes\nLine two with details\nLine three: final check",
      repair_address: "Floor 3\n200 Queen St\nMelbourne VIC 3000",
    },
    /** All nullable fields empty — tests null preservation */
    allNulls: {
      patient: patientId,
      ear: "right",
      make: "ReSound",
      model: "OMNIA 9",
      serial_number: "RT-EDGE-004",
      battery_type: null,
      wax_filter: null,
      dome: null,
      programming_cable: null,
      programming_software: null,
      hsp_code: null,
      warranty_end_date: null,
      last_repair_details: null,
      repair_address: null,
    },
    /** Large text blob */
    largeText: {
      patient: patientId,
      ear: "left",
      make: "Bernafon",
      model: "Alpha XT",
      serial_number: "RT-EDGE-005",
      battery_type: "13",
      wax_filter: null,
      dome: null,
      programming_cable: null,
      programming_software: null,
      hsp_code: null,
      warranty_end_date: null,
      last_repair_details: "A".repeat(2000),
      repair_address: null,
    },
  } as const;
}

/**
 * Patient fixture with edge-case name for CSV testing.
 */
export const PATIENT_EDGE_CASE = {
  name: "[ROUNDTRIP] O'Brien, James (Jr.)",
  date_of_birth: "1950-03-25",
  medicare_number: null,
  phone: null,
  email: null,
  address: "42 Müller Straße, München",
  status: "active",
  notes: "Line one\nLine two\nLine three",
} as const;

/** Prefix used to identify and clean up roundtrip test data */
export const ROUNDTRIP_PREFIX = "[ROUNDTRIP]";
