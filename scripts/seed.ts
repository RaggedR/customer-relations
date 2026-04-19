/**
 * Seed Script
 *
 * Populates the database with healthcare test data covering every relationship:
 * - Users (admin, nurse, patient) with demo password "demo"
 * - Patients at every status (active, inactive, discharged)
 * - Referrals (multiple per patient, expired and active)
 * - Clinical notes of every type
 * - Personal notes with context
 * - Hearing aids (bilateral, single, different brands/battery types)
 * - Claim items at every status
 * - Maintenance plan expiry dates
 * - Nurses linked to user accounts
 * - Appointments (past, today, and future)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { scrypt, randomBytes } from "node:crypto";

const adapter = new PrismaPg(process.env.DATABASE_URL || "");
const prisma = new PrismaClient({ adapter });

// Match the password hashing from src/lib/password.ts
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt.toString("hex")}:${key.toString("hex")}`);
    });
  });
}

async function seed() {
  const demoHash = await hashPassword("demo");

  console.log("Clearing existing data...");
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.nurseSpecialty.deleteMany();
  await prisma.calendarConnection.deleteMany();
  await prisma.nurse.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.claimItem.deleteMany();
  await prisma.hearingAid.deleteMany();
  await prisma.personalNote.deleteMany();
  await prisma.clinicalNote.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.claimToken.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ──────────────────────────────────────────────────────────
  console.log("Creating users...");
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@callonclare.com.au",
      name: "Clare Wilson",
      password_hash: demoHash,
      role: "admin",
      active: true,
      must_change_password: false,
    },
  });

  const nurseEmmaUser = await prisma.user.create({
    data: {
      email: "emma@callonclare.com.au",
      name: "Emma Taylor",
      password_hash: demoHash,
      role: "nurse",
      active: true,
      must_change_password: false,
    },
  });

  const nurseLiamUser = await prisma.user.create({
    data: {
      email: "liam@callonclare.com.au",
      name: "Liam Patel",
      password_hash: demoHash,
      role: "nurse",
      active: true,
      must_change_password: false,
    },
  });

  const patientMargaretUser = await prisma.user.create({
    data: {
      email: "margaret.t@example.com",
      name: "Margaret Thompson",
      password_hash: demoHash,
      role: "patient",
      active: true,
      must_change_password: false,
    },
  });

  const patientJamesUser = await prisma.user.create({
    data: {
      email: "james.chen@example.com",
      name: "James Chen",
      password_hash: demoHash,
      role: "patient",
      active: true,
      must_change_password: false,
    },
  });

  // ── Patients ───────────────────────────────────────────────────────
  console.log("Creating patients...");
  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        name: "Margaret Thompson",
        date_of_birth: new Date("1958-03-14"),
        medicare_number: "2345 67890 1",
        phone: "+61-3-9876-5432",
        email: "margaret.t@example.com",
        address: "42 Collins St, Melbourne VIC 3000",
        status: "active",
        maintenance_plan_expiry: new Date("2026-09-01"),
        notes: "Prefers morning appointments. Has mobility issues — home visits preferred.",
        userId: patientMargaretUser.id,
      },
    }),
    prisma.patient.create({
      data: {
        name: "James Chen",
        date_of_birth: new Date("1985-11-22"),
        medicare_number: "3456 78901 2",
        phone: "+61-4-1234-5678",
        email: "james.chen@example.com",
        address: "15 Bourke St, Melbourne VIC 3000",
        status: "active",
        maintenance_plan_expiry: new Date("2026-07-15"),
        userId: patientJamesUser.id,
      },
    }),
    prisma.patient.create({
      data: {
        name: "Susan O'Brien",
        date_of_birth: new Date("1972-07-08"),
        medicare_number: "4567 89012 3",
        phone: "+61-4-9876-1234",
        address: "8 St Kilda Rd, St Kilda VIC 3182",
        status: "active",
        maintenance_plan_expiry: new Date("2026-05-01"),
        notes: "Requires interpreter (Vietnamese). Daughter translates when available.",
      },
    }),
    prisma.patient.create({
      data: {
        name: "Robert Williams",
        date_of_birth: new Date("1945-01-30"),
        medicare_number: "5678 90123 4",
        phone: "+61-3-5555-0199",
        address: "3/27 Beach Rd, Brighton VIC 3186",
        status: "discharged",
        notes: "Discharged 2026-02-15. Goals met. May return if condition changes.",
      },
    }),
    prisma.patient.create({
      data: {
        name: "Priya Sharma",
        date_of_birth: new Date("1990-09-12"),
        medicare_number: "6789 01234 5",
        phone: "+61-4-5555-0201",
        email: "priya.s@example.com",
        status: "inactive",
        notes: "On waitlist. GP referral received, pending initial assessment scheduling.",
      },
    }),
  ]);

  const [margaret, james, susan, robert, priya] = patients;

  // ── Referrals ──────────────────────────────────────────────────────
  console.log("Creating referrals...");
  await Promise.all([
    prisma.referral.create({
      data: {
        referring_gp: "Dr Sarah Mitchell",
        gp_practice: "Collins St Medical Centre",
        referral_date: new Date("2025-03-01"),
        reason: "Post-hip replacement rehabilitation. Requires home-based physiotherapy and occupational therapy.",
        expiry_date: new Date("2026-03-01"),
        notes: "Original referral — now expired.",
        patientId: margaret.id,
      },
    }),
    prisma.referral.create({
      data: {
        referring_gp: "Dr Sarah Mitchell",
        gp_practice: "Collins St Medical Centre",
        referral_date: new Date("2026-03-05"),
        reason: "Ongoing mobility support. Patient has made progress but still requires weekly sessions.",
        expiry_date: new Date("2027-03-05"),
        patientId: margaret.id,
      },
    }),
    prisma.referral.create({
      data: {
        referring_gp: "Dr Kevin Nguyen",
        gp_practice: "Bourke St Family Practice",
        referral_date: new Date("2026-01-15"),
        reason: "Workplace injury — lower back. Requires assessment and treatment plan.",
        expiry_date: new Date("2027-01-15"),
        patientId: james.id,
      },
    }),
    prisma.referral.create({
      data: {
        referring_gp: "Dr Amanda Li",
        gp_practice: "St Kilda Health Hub",
        referral_date: new Date("2026-02-10"),
        reason: "Chronic pain management. Referred for multidisciplinary approach.",
        expiry_date: new Date("2027-02-10"),
        patientId: susan.id,
      },
    }),
    prisma.referral.create({
      data: {
        referring_gp: "Dr Peter Grant",
        gp_practice: "Brighton Medical Group",
        referral_date: new Date("2025-08-20"),
        reason: "Post-stroke rehabilitation — speech and motor function.",
        expiry_date: new Date("2026-08-20"),
        notes: "Patient discharged 2026-02-15. Goals met.",
        patientId: robert.id,
      },
    }),
    prisma.referral.create({
      data: {
        referring_gp: "Dr Rachel Wong",
        gp_practice: "Melbourne CBD Medical",
        referral_date: new Date("2026-04-01"),
        reason: "Anxiety and stress management. Requesting psychology sessions.",
        expiry_date: new Date("2027-04-01"),
        patientId: priya.id,
      },
    }),
  ]);

  // ── Clinical Notes ─────────────────────────────────────────────────
  console.log("Creating clinical notes...");
  await Promise.all([
    prisma.clinicalNote.create({
      data: {
        date: new Date("2025-03-10T09:00:00Z"),
        note_type: "initial_assessment",
        content: "Initial home visit. Patient is 6 weeks post right total hip replacement. Mobilising with walker. ROM limited. Pain 5/10 on movement. Goals: independent mobility, return to gardening. Plan: 2x/week physio for 8 weeks, then reassess.",
        clinician: "Clare",
        patientId: margaret.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2025-05-15T09:00:00Z"),
        note_type: "progress_note",
        content: "Week 10. Progressed to single-point stick. ROM improved. Pain 2/10. Walking 200m independently. Reduced to 1x/week.",
        clinician: "Clare",
        patientId: margaret.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2026-03-10T09:00:00Z"),
        note_type: "treatment_plan",
        content: "New referral received. Reassessment: patient has maintained gains but reports occasional instability on uneven surfaces. Plan: 1x/week for 6 weeks focusing on balance and outdoor mobility. Consider falls prevention program.",
        clinician: "Clare",
        patientId: margaret.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2026-01-22T10:00:00Z"),
        note_type: "initial_assessment",
        content: "Workplace injury assessment. Lumbar strain — lifting incident at warehouse. Pain 7/10, radiating to left leg. Limited flexion. Red flags screened — nil. Plan: 2x/week manual therapy + exercise program. WorkCover claim lodged.",
        clinician: "Clare",
        patientId: james.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2026-03-20T10:00:00Z"),
        note_type: "progress_note",
        content: "Week 8. Pain reduced to 3/10. Full ROM restored. Commenced graduated return to work program. Employer liaison completed. Expect full duties by week 12.",
        clinician: "Clare",
        patientId: james.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2026-02-20T14:00:00Z"),
        note_type: "initial_assessment",
        content: "Assessment conducted with daughter interpreting. Chronic widespread pain — 3 year history. Multiple failed treatments. Pain 6/10 average, 9/10 flares. Sleep disrupted. Mood low. Plan: pain education, gentle exercise program, liaison with GP re: medication review.",
        clinician: "Clare",
        patientId: susan.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2025-09-01T11:00:00Z"),
        note_type: "initial_assessment",
        content: "Post-CVA assessment. Left-sided weakness, dysarthria. Mobilising with quad stick. ADLs partially dependent. Speech slightly slurred but intelligible. Goals: independent transfers, clear speech for phone calls.",
        clinician: "Clare",
        patientId: robert.id,
      },
    }),
    prisma.clinicalNote.create({
      data: {
        date: new Date("2026-02-15T11:00:00Z"),
        note_type: "discharge_summary",
        content: "Discharge summary. 24 sessions over 5.5 months. All goals achieved. Independent transfers, walking 500m without aid, speech intelligible on phone. Patient and wife educated on ongoing home exercises. Will re-refer if regression noted.",
        clinician: "Clare",
        patientId: robert.id,
      },
    }),
  ]);

  // ── Hearing Aids ───────────────────────────────────────────────────
  console.log("Creating hearing aids...");
  await Promise.all([
    prisma.hearingAid.create({
      data: {
        ear: "right",
        make: "Phonak",
        model: "Audéo Paradise P90-R",
        serial_number: "PHK-2024-R-78432",
        battery_type: "Rechargeable lithium-ion",
        wax_filter: "CeruShield Disk",
        dome: "Open dome 8mm",
        programming_cable: "Noahlink Wireless",
        programming_software: "Phonak Target 9.0",
        hsp_code: "HSP-VIC-2025-11234",
        warranty_end_date: new Date("2027-06-15"),
        last_repair_details: "Replaced receiver — intermittent cutout. Sent 2026-01-10, returned 2026-01-22.",
        repair_address: "Sonova Australia, 8 Nexus Ct, Mulgrave VIC 3170",
        patientId: margaret.id,
      },
    }),
    prisma.hearingAid.create({
      data: {
        ear: "left",
        make: "Phonak",
        model: "Audéo Paradise P90-R",
        serial_number: "PHK-2024-L-78433",
        battery_type: "Rechargeable lithium-ion",
        wax_filter: "CeruShield Disk",
        dome: "Open dome 8mm",
        programming_cable: "Noahlink Wireless",
        programming_software: "Phonak Target 9.0",
        hsp_code: "HSP-VIC-2025-11234",
        warranty_end_date: new Date("2027-06-15"),
        repair_address: "Sonova Australia, 8 Nexus Ct, Mulgrave VIC 3170",
        patientId: margaret.id,
      },
    }),
    prisma.hearingAid.create({
      data: {
        ear: "right",
        make: "Oticon",
        model: "Real 1 miniRITE R",
        serial_number: "OTI-2025-R-55901",
        battery_type: "Rechargeable lithium-ion",
        wax_filter: "ProWax miniFit",
        dome: "Bass dome 10mm",
        programming_cable: "Noahlink Wireless",
        programming_software: "Oticon Genie 2 2024.1",
        hsp_code: "HSP-VIC-2026-20187",
        warranty_end_date: new Date("2028-01-20"),
        repair_address: "Demant Australia, Level 2, 3 Nexus Ct, Mulgrave VIC 3170",
        patientId: james.id,
      },
    }),
    prisma.hearingAid.create({
      data: {
        ear: "left",
        make: "Widex",
        model: "Moment Sheer 440 sRIC RD",
        serial_number: "WDX-2023-L-33210",
        battery_type: "Size 312 zinc-air",
        wax_filter: "Nanocare Wax Guard",
        dome: "Tulip dome S",
        programming_cable: "Noahlink Wireless",
        programming_software: "Widex Compass GPS 4.5",
        hsp_code: "HSP-VIC-2024-08921",
        warranty_end_date: new Date("2026-08-01"),
        last_repair_details: "Volume control intermittent. Cleaned contacts, resolved. 2025-11-05.",
        repair_address: "WS Audiology ANZ, 95 Coventry St, South Melbourne VIC 3205",
        patientId: susan.id,
      },
    }),
  ]);

  // ── Personal Notes ─────────────────────────────────────────────────
  console.log("Creating personal notes...");
  await Promise.all([
    prisma.personalNote.create({
      data: {
        date: new Date("2025-03-10T09:30:00Z"),
        content: "Margaret lives alone since husband passed 2024. Daughter visits weekly. Has a cat named Biscuit. Prefers tea — no milk.",
        patientId: margaret.id,
      },
    }),
    prisma.personalNote.create({
      data: {
        date: new Date("2026-01-22T10:30:00Z"),
        content: "James works at Linfox warehouse. Shifts are 6am-2pm. Can only attend afternoon appointments. Has WorkCover case manager: Sarah (0412 555 789).",
        patientId: james.id,
      },
    }),
    prisma.personalNote.create({
      data: {
        date: new Date("2026-02-20T14:30:00Z"),
        content: "Susan's daughter Mai (0423 555 100) translates. Call Mai first to arrange appointments. Susan is Buddhist — no appointments on Vesak Day.",
        patientId: susan.id,
      },
    }),
    prisma.personalNote.create({
      data: {
        date: new Date("2025-09-01T11:30:00Z"),
        content: "Robert's wife June is very involved in his care. She takes detailed notes. Their grandson is studying medicine at Monash — Robert is very proud.",
        patientId: robert.id,
      },
    }),
  ]);

  // ── Claim Items ────────────────────────────────────────────────────
  console.log("Creating claim items...");
  await Promise.all([
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — physiotherapy (TCA)",
        date_of_service: new Date("2026-03-10"),
        amount: 56.35,
        status: "paid",
        patientId: margaret.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — physiotherapy (TCA)",
        date_of_service: new Date("2026-03-17"),
        amount: 56.35,
        status: "paid",
        patientId: margaret.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — physiotherapy (TCA)",
        date_of_service: new Date("2026-03-24"),
        amount: 56.35,
        status: "claimed",
        patientId: margaret.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — physiotherapy (TCA)",
        date_of_service: new Date("2026-04-07"),
        amount: 56.35,
        status: "pending",
        patientId: margaret.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — initial assessment",
        date_of_service: new Date("2026-01-22"),
        amount: 56.35,
        status: "paid",
        notes: "WorkCover claim — invoice sent separately",
        patientId: james.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — follow-up",
        date_of_service: new Date("2026-03-20"),
        amount: 56.35,
        status: "paid",
        patientId: james.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — pain management",
        date_of_service: new Date("2026-02-20"),
        amount: 56.35,
        status: "paid",
        patientId: susan.id,
      },
    }),
    prisma.claimItem.create({
      data: {
        item_number: "10960",
        description: "Allied health service — follow-up",
        date_of_service: new Date("2026-03-15"),
        amount: 56.35,
        status: "rejected",
        notes: "Rejected — TCA session limit reached. Need GP to renew plan.",
        patientId: susan.id,
      },
    }),
  ]);

  // ── Nurses ─────────────────────────────────────────────────────────
  console.log("Creating nurses...");
  const nurses = await Promise.all([
    prisma.nurse.create({
      data: {
        name: "Clare Wilson",
        phone: "+61-4-0000-1111",
        email: "clare@callonclare.com.au",
        registration_number: "AUD0012345",
        notes: "Practice owner. Mobile audiologist servicing Melbourne metro.",
        userId: adminUser.id,
        aup_acknowledged_at: new Date(),
      },
    }),
    prisma.nurse.create({
      data: {
        name: "Emma Taylor",
        phone: "+61-4-0000-2222",
        email: "emma@callonclare.com.au",
        registration_number: "AUD0067890",
        userId: nurseEmmaUser.id,
        aup_acknowledged_at: new Date(),
      },
    }),
    prisma.nurse.create({
      data: {
        name: "Liam Patel",
        phone: "+61-4-0000-3333",
        email: "liam@callonclare.com.au",
        registration_number: "PHY0045678",
        notes: "Part-time. Available Mon/Wed/Fri.",
        userId: nurseLiamUser.id,
        aup_acknowledged_at: new Date(),
      },
    }),
  ]);

  const [clare, emma, liam] = nurses;

  // ── Nurse Specialties ──────────────────────────────────────────────
  console.log("Creating nurse specialties...");
  await Promise.all([
    prisma.nurseSpecialty.create({
      data: { specialty: "Audiologist", notes: "Primary — hearing assessments, aid fitting, programming", nurseId: clare.id },
    }),
    prisma.nurseSpecialty.create({
      data: { specialty: "Hearing Aid Technician", notes: "Repairs, maintenance, troubleshooting", nurseId: clare.id },
    }),
    prisma.nurseSpecialty.create({
      data: { specialty: "Audiologist", notes: "Graduate audiologist — supervised by Clare", nurseId: emma.id },
    }),
    prisma.nurseSpecialty.create({
      data: { specialty: "Physiotherapist", notes: "Musculoskeletal and vestibular rehabilitation", nurseId: liam.id },
    }),
  ]);

  // ── Appointments ───────────────────────────────────────────────────
  // Spread across past, today, and future dates for a realistic calendar view.
  // Today is calculated dynamically so the seed always looks current.
  console.log("Creating appointments...");
  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d;
  };

  await Promise.all([
    // Past appointments (completed)
    prisma.appointment.create({
      data: {
        date: day(-14),
        start_time: "09:00",
        end_time: "09:45",
        location: "42 Collins St, Melbourne (home visit)",
        specialty: "Audiology",
        status: "completed",
        notes: "Hearing aid check — both aids functioning well. Wax filters replaced.",
        patientId: margaret.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(-10),
        start_time: "14:00",
        end_time: "14:45",
        location: "15 Bourke St, Melbourne",
        specialty: "Audiology",
        status: "completed",
        notes: "Follow-up fitting. Fine-tuned right aid — increased gain at 2kHz.",
        patientId: james.id,
        nurseId: emma.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(-7),
        start_time: "10:00",
        end_time: "11:00",
        location: "8 St Kilda Rd, St Kilda (home visit)",
        specialty: "Audiology",
        status: "completed",
        notes: "Initial hearing assessment. Daughter present to interpret.",
        patientId: susan.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(-5),
        start_time: "15:00",
        end_time: "15:45",
        location: "Clinic — Level 2, 100 Collins St",
        specialty: "Physiotherapy",
        status: "completed",
        patientId: james.id,
        nurseId: liam.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(-3),
        start_time: "09:30",
        end_time: "10:15",
        location: "42 Collins St, Melbourne (home visit)",
        specialty: "Audiology",
        status: "cancelled",
        notes: "Patient unwell — rescheduled to next week.",
        patientId: margaret.id,
        nurseId: clare.id,
      },
    }),

    // Today's appointments
    prisma.appointment.create({
      data: {
        date: day(0),
        start_time: "09:00",
        end_time: "09:45",
        location: "42 Collins St, Melbourne (home visit)",
        specialty: "Audiology",
        status: "scheduled",
        notes: "Rescheduled from last week. Hearing aid maintenance + balance check.",
        patientId: margaret.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(0),
        start_time: "11:00",
        end_time: "11:45",
        location: "Clinic — Level 2, 100 Collins St",
        specialty: "Audiology",
        status: "scheduled",
        patientId: james.id,
        nurseId: emma.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(0),
        start_time: "14:00",
        end_time: "14:45",
        location: "Clinic — Level 2, 100 Collins St",
        specialty: "Physiotherapy",
        status: "scheduled",
        patientId: james.id,
        nurseId: liam.id,
      },
    }),

    // Future appointments
    prisma.appointment.create({
      data: {
        date: day(2),
        start_time: "10:00",
        end_time: "10:45",
        location: "8 St Kilda Rd, St Kilda (home visit)",
        specialty: "Audiology",
        status: "scheduled",
        notes: "Hearing aid trial fitting — left ear. Daughter to be present.",
        patientId: susan.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(5),
        start_time: "09:00",
        end_time: "09:45",
        location: "42 Collins St, Melbourne (home visit)",
        specialty: "Audiology",
        status: "scheduled",
        patientId: margaret.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(5),
        start_time: "14:00",
        end_time: "14:45",
        location: "Clinic — Level 2, 100 Collins St",
        specialty: "Physiotherapy",
        status: "scheduled",
        patientId: james.id,
        nurseId: liam.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(7),
        start_time: "11:00",
        end_time: "12:00",
        location: "Clinic — Level 2, 100 Collins St",
        specialty: "Audiology",
        status: "scheduled",
        notes: "Initial assessment — referred for anxiety-related tinnitus evaluation.",
        patientId: priya.id,
        nurseId: emma.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(12),
        start_time: "09:00",
        end_time: "10:00",
        location: "42 Collins St, Melbourne (home visit)",
        specialty: "Audiology",
        status: "scheduled",
        notes: "Monthly maintenance visit — bilateral aids.",
        patientId: margaret.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(14),
        start_time: "10:00",
        end_time: "10:45",
        location: "8 St Kilda Rd, St Kilda (home visit)",
        specialty: "Audiology",
        status: "scheduled",
        patientId: susan.id,
        nurseId: clare.id,
      },
    }),
    prisma.appointment.create({
      data: {
        date: day(14),
        start_time: "15:00",
        end_time: "15:45",
        location: "Clinic — Level 2, 100 Collins St",
        specialty: "Physiotherapy",
        status: "scheduled",
        patientId: james.id,
        nurseId: liam.id,
      },
    }),
  ]);

  // ── Summary ────────────────────────────────────────────────────────
  console.log("\nSeed complete! Summary:");
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.patient.count(),
    prisma.referral.count(),
    prisma.clinicalNote.count(),
    prisma.hearingAid.count(),
    prisma.personalNote.count(),
    prisma.claimItem.count(),
    prisma.nurse.count(),
    prisma.nurseSpecialty.count(),
    prisma.appointment.count(),
  ]);
  const labels = [
    "Users", "Patients", "Referrals", "Clinical Notes",
    "Hearing Aids", "Personal Notes", "Claim Items",
    "Nurses", "Nurse Specialties", "Appointments",
  ];
  for (let i = 0; i < labels.length; i++) {
    console.log(`  ${labels[i].padEnd(20)} ${counts[i]}`);
  }

  console.log("\nDemo accounts (password: demo):");
  console.log("  Admin:    admin@callonclare.com.au");
  console.log("  Nurse:    emma@callonclare.com.au");
  console.log("  Nurse:    liam@callonclare.com.au");
  console.log("  Patient:  margaret.t@example.com");
  console.log("  Patient:  james.chen@example.com");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
