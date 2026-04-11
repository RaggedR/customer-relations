/**
 * AI Query API
 *
 * POST /api/ai
 * Body: { question: string, model?: string }
 *
 * Sends the question + database schema to Gemini,
 * gets back SQL, executes it, and returns the results
 * along with a natural language summary and optional chart config.
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

const SCHEMA_DESCRIPTION = `
PostgreSQL database with these tables:

"Patient" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  name TEXT NOT NULL,
  date_of_birth TIMESTAMP,
  medicare_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  status TEXT, -- values: 'active', 'inactive', 'discharged'
  maintenance_plan_expiry TIMESTAMP, -- GPMP/TCA plan expiry date
  notes TEXT
)

"Referral" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  referring_gp TEXT NOT NULL,
  gp_practice TEXT,
  referral_date TIMESTAMP NOT NULL,
  reason TEXT,
  expiry_date TIMESTAMP,
  notes TEXT,
  "patientId" INT REFERENCES "Patient"(id)
)

"ClinicalNote" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  date TIMESTAMP NOT NULL,
  note_type TEXT, -- values: 'initial_assessment', 'progress_note', 'discharge_summary', 'treatment_plan'
  content TEXT NOT NULL,
  clinician TEXT,
  "patientId" INT REFERENCES "Patient"(id)
)

"PersonalNote" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  date TIMESTAMP NOT NULL,
  content TEXT NOT NULL,
  "patientId" INT REFERENCES "Patient"(id)
)

"HearingAid" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  ear TEXT, -- values: 'left', 'right'
  make TEXT,
  model TEXT,
  serial_number TEXT,
  battery_type TEXT,
  wax_filter TEXT,
  dome TEXT,
  programming_cable TEXT,
  programming_software TEXT,
  hsp_code TEXT,
  warranty_end_date TIMESTAMP,
  last_repair_details TEXT,
  repair_address TEXT,
  "patientId" INT REFERENCES "Patient"(id)
)

"ClaimItem" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  item_number TEXT NOT NULL, -- MBS item number e.g. '10960'
  description TEXT,
  date_of_service TIMESTAMP NOT NULL,
  amount FLOAT,
  status TEXT, -- values: 'pending', 'claimed', 'paid', 'rejected'
  notes TEXT,
  "patientId" INT REFERENCES "Patient"(id)
)

"Appointment" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  date TIMESTAMP NOT NULL,
  start_time TEXT NOT NULL,  -- "HH:MM" wall-clock time
  end_time TEXT NOT NULL,    -- "HH:MM" wall-clock time
  location TEXT NOT NULL,
  specialty TEXT NOT NULL,
  status TEXT,  -- values: 'requested', 'confirmed', 'completed', 'cancelled', 'no_show'
  notes TEXT,
  "patientId" INT REFERENCES "Patient"(id),
  "nurseId" INT REFERENCES "Nurse"(id)
)

"Nurse" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  registration_number TEXT, -- AHPRA registration
  caldav_url TEXT,
  google_calendar_id TEXT,
  notes TEXT
)

"NurseSpecialty" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  specialty TEXT NOT NULL,
  notes TEXT,
  "nurseId" INT REFERENCES "Nurse"(id)
)

"Attachment" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes FLOAT,
  category TEXT, -- values: 'referral_letter', 'test_result', 'clinical_document', 'other'
  description TEXT,
  "patientId" INT REFERENCES "Patient"(id),
  "clinicalNoteId" INT REFERENCES "ClinicalNote"(id)
)
`;

const SYSTEM_PROMPT = `You are a healthcare practice assistant. You help clinicians query their patient management database.

This system manages an allied health practice (audiology/hearing services) in Australia. Key concepts:
- Patients have Medicare numbers and may be under a GP Management Plan (GPMP) or Team Care Arrangement (TCA)
- maintenance_plan_expiry tracks when these plans need GP review/renewal
- Referrals come from GPs, are valid for 12 months (expiry_date), and patients may be re-referred
- Clinical notes are timestamped treatment records (initial assessments, progress notes, discharge summaries, treatment plans)
- Personal notes capture non-clinical context (family, preferences, scheduling)
- Hearing aids track device details, consumables, warranty, repair history, and HSP (Hearing Services Program) codes
- Claim items are MBS (Medicare Benefits Schedule) item numbers billed per service
- Attachments (test results, referral letters, clinical documents) can be linked to patients or specific clinical notes

Given a natural language question, you must:
1. Write a PostgreSQL SELECT query to answer it (READ-ONLY, no INSERT/UPDATE/DELETE/DROP/ALTER)
2. After seeing the results, provide a short natural language answer
3. If the data suits a chart, suggest a chart configuration

Common query patterns:
- "Summarise patient X" → JOIN across Patient, Referral, ClinicalNote, HearingAid, ClaimItem
- "What did we discuss last week" → query ClinicalNote and PersonalNote by date range
- "Are any plans expiring" → check maintenance_plan_expiry relative to today
- "Are any referrals expiring" → check Referral.expiry_date relative to today
- "Main issues this week" → recent ClinicalNote entries, summarise content
- "Claim summary for patient X" → aggregate ClaimItem by status
- "Appointments this week" → query Appointment by date range, JOIN Nurse and Patient
- "Who is nurse X seeing tomorrow" → query Appointment WHERE nurseId AND date
- "Which nurse has the least appointments this week" → COUNT appointments per nurse
- "Find free slots for next Tuesday" → query Appointment for that date, invert to find gaps

Database schema:
${SCHEMA_DESCRIPTION}

IMPORTANT RULES:
- If the question is not related to the practice data (patients, nurses, referrals, clinical notes, hearing aids, claims, attachments), respond with: {"refused": true, "message": "Sorry, I can't help you with that. I can only answer questions about your patient and practice data."}
- Only generate SELECT statements. Never generate any data-modifying SQL.
- Always quote table and column names with double quotes when they contain uppercase letters (e.g. "Patient", "createdAt", "patientId", "ClinicalNote", "ClaimItem", "HearingAid", "Nurse", "NurseSpecialty")
- Use double quotes for identifiers, not single quotes
- Today's date is ${new Date().toISOString().split("T")[0]}
- For patient summaries, use LEFT JOINs to include patients even if they have no referrals/notes/etc.
- ALWAYS use fuzzy name matching, never exact equality. The pg_trgm extension is enabled.
  Use this pattern to handle typos, partial names, and apostrophes:
  WHERE REPLACE(LOWER(name), '''', '') ILIKE '%searchterm%'
     OR similarity(LOWER(name), 'searchterm') > 0.15
  Examples:
  - "Susan O'Brien" → WHERE REPLACE(LOWER(name), '''', '') ILIKE '%susan%obrien%' OR similarity(LOWER(name), 'susan obrien') > 0.15
  - "Susan" → WHERE REPLACE(LOWER(name), '''', '') ILIKE '%susan%' OR similarity(LOWER(name), 'susan') > 0.15
  - "obrien" → WHERE REPLACE(LOWER(name), '''', '') ILIKE '%obrien%' OR similarity(LOWER(name), 'obrien') > 0.15
  - "Suzan" (typo) → the similarity() function will still match "Susan" because trigrams overlap
  - Always lowercase the search term and strip apostrophes from both sides
- When asked about "last week" or "this week", calculate the date range relative to today
- Return valid JSON only, no markdown code fences

Respond with JSON in ONE of these formats:

If the question is relevant:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of what the query does"
}

If the question is irrelevant or malformed:
{
  "refused": true,
  "message": "Sorry, I can't help you with that."
}`;

const RESULTS_PROMPT = `Given the query results below, provide:
1. A natural language answer to the user's question
2. If appropriate, a chart configuration

Respond with JSON in this exact format:
{
  "answer": "Natural language answer to the question",
  "chart": null or {
    "type": "bar" | "pie",
    "title": "Chart title",
    "data": [{"label": "...", "value": number}, ...]
  }
}

Return valid JSON only, no markdown code fences.`;

function getGenAI() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set in environment variables");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Levenshtein distance — number of single-character edits
 * (insertions, deletions, substitutions) to transform a into b.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Distance 0–1: confident match, auto-resolve */
const CONFIDENT_DISTANCE = 1;
/** Distance 2–3: uncertain, ask the user to confirm */
const MAX_DISTANCE = 3;

/**
 * Resolve fuzzy names before sending to Gemini.
 *
 * Loads all patient and nurse names, splits them into parts,
 * and compares each word in the question using Levenshtein distance.
 * If the closest match is within MAX_DISTANCE edits, appends the
 * exact name to the question so Gemini generates clean SQL.
 */
interface NameResolution {
  question: string;
  clarify?: string; // if set, ask the user this instead of querying
}

async function resolveNames(question: string): Promise<NameResolution> {
  try {
    // Load all names (tiny tables — fast)
    const [patients, nurses] = await Promise.all([
      prisma.patient.findMany({ select: { name: true } }),
      prisma.nurse.findMany({ select: { name: true } }),
    ]);

    const allNames: { name: string; type: string; parts: string[] }[] = [];
    for (const p of patients) {
      allNames.push({
        name: p.name,
        type: "patient",
        parts: p.name.toLowerCase().replace(/'/g, "").split(/\s+/),
      });
    }
    for (const n of nurses) {
      allNames.push({
        name: n.name,
        type: "nurse",
        parts: n.name.toLowerCase().replace(/'/g, "").split(/\s+/),
      });
    }

    // Extract words from question (3+ chars, skip common words)
    const skipWords = new Set([
      "the", "about", "tell", "what", "when", "does", "has", "have",
      "are", "for", "from", "with", "how", "many", "show", "get",
      "all", "list", "plan", "date", "last", "next", "hearing",
      "aids", "aid", "notes", "note", "claim", "items", "referral",
      // Calendar-related words
      "free", "busy", "available", "times", "slots", "appointments",
      "appointment", "schedule", "calendar", "week", "today", "tomorrow",
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
      "morning", "afternoon", "evening", "which", "nurse", "most", "least",
    ]);
    const words = question
      .toLowerCase()
      .replace(/['']/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !skipWords.has(w));

    let bestMatch: { name: string; type: string; distance: number } | null = null;

    for (const word of words) {
      for (const entry of allNames) {
        // Check against each part of the name (first name, last name)
        for (const part of entry.parts) {
          const dist = levenshtein(word, part);
          if (dist <= MAX_DISTANCE && (!bestMatch || dist < bestMatch.distance)) {
            bestMatch = { name: entry.name, type: entry.type, distance: dist };
          }
        }
        // Also check against the full name (stripped of apostrophes)
        const fullName = entry.parts.join("");
        const distFull = levenshtein(word, fullName);
        if (distFull <= MAX_DISTANCE && (!bestMatch || distFull < bestMatch.distance)) {
          bestMatch = { name: entry.name, type: entry.type, distance: distFull };
        }
      }
    }

    if (bestMatch) {
      if (bestMatch.distance <= CONFIDENT_DISTANCE) {
        // Confident — auto-resolve
        return {
          question: question + `\n\n[Name resolved: the ${bestMatch.type} is "${bestMatch.name}"]`,
        };
      } else {
        // Uncertain — ask the user to confirm
        return {
          question,
          clarify: `Did you mean ${bestMatch.name}?`,
        };
      }
    }
  } catch {
    // If name resolution fails, continue with the original question
  }
  return { question };
}

export async function POST(request: NextRequest) {
  try {
    const { question, model: modelName } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // Resolve fuzzy names before sending to the LLM
    const resolved = await resolveNames(question);

    // If uncertain about a name, ask the user to confirm
    if (resolved.clarify) {
      return NextResponse.json({
        question,
        answer: resolved.clarify,
        sql: null,
        rows: [],
        rowCount: 0,
        chart: null,
      });
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: modelName || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    // Step 1: Generate SQL
    const sqlResponse = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `User question: ${resolved.question}` },
    ]);

    const sqlText = sqlResponse.response.text().trim();
    let sqlResult;
    try {
      // Strip markdown code fences if present
      const cleaned = sqlText.replace(/^```(?:json)?\n?/g, "").replace(/\n?```$/g, "");
      const parsed = JSON.parse(cleaned);

      // Handle refused questions
      if (parsed.refused) {
        return NextResponse.json({
          question,
          answer: parsed.message || "Sorry, I can't help you with that.",
          sql: null,
          rows: [],
          rowCount: 0,
          chart: null,
        });
      }
      sqlResult = parsed;
    } catch {
      return NextResponse.json({
        error: "Failed to parse AI response",
        raw: sqlText,
      }, { status: 500 });
    }

    const sql = sqlResult.sql;

    // Safety check: only allow SELECT
    const normalised = sql.trim().toUpperCase();
    if (!normalised.startsWith("SELECT") && !normalised.startsWith("WITH")) {
      return NextResponse.json({
        error: "AI generated a non-SELECT query. Only read operations are allowed.",
        sql,
      }, { status: 400 });
    }

    // Step 2: Execute SQL
    let rows: Record<string, unknown>[];
    try {
      rows = await prisma.$queryRawUnsafe(sql) as Record<string, unknown>[];
    } catch (dbError) {
      return NextResponse.json({
        error: "SQL execution failed",
        sql,
        detail: (dbError as Error).message,
      }, { status: 500 });
    }

    // Serialize BigInt values to numbers
    const serializedRows = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return out;
    });

    // Step 3: Generate natural language answer + chart
    const resultsResponse = await model.generateContent([
      { text: RESULTS_PROMPT },
      { text: `User question: ${question}` },
      { text: `SQL executed: ${sql}` },
      { text: `Results (${serializedRows.length} rows): ${JSON.stringify(serializedRows.slice(0, 100))}` },
    ]);

    const resultsText = resultsResponse.response.text().trim();
    let answerResult;
    try {
      const cleaned = resultsText.replace(/^```(?:json)?\n?/g, "").replace(/\n?```$/g, "");
      answerResult = JSON.parse(cleaned);
    } catch {
      answerResult = { answer: resultsText, chart: null };
    }

    return NextResponse.json({
      question,
      sql,
      explanation: sqlResult.explanation,
      answer: answerResult.answer,
      chart: answerResult.chart,
      rows: serializedRows,
      rowCount: serializedRows.length,
    });
  } catch (error) {
    console.error("AI query error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
