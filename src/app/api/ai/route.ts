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

Database schema:
${SCHEMA_DESCRIPTION}

IMPORTANT RULES:
- Only generate SELECT statements. Never generate any data-modifying SQL.
- Always quote table and column names with double quotes when they contain uppercase letters (e.g. "Patient", "createdAt", "patientId", "ClinicalNote", "ClaimItem", "HearingAid")
- Use double quotes for identifiers, not single quotes
- Today's date is ${new Date().toISOString().split("T")[0]}
- For patient summaries, use LEFT JOINs to include patients even if they have no referrals/notes/etc.
- When asked about "last week" or "this week", calculate the date range relative to today
- Return valid JSON only, no markdown code fences

Respond with JSON in this exact format:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of what the query does"
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

export async function POST(request: NextRequest) {
  try {
    const { question, model: modelName } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: modelName || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    });

    // Step 1: Generate SQL
    const sqlResponse = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `User question: ${question}` },
    ]);

    const sqlText = sqlResponse.response.text().trim();
    let sqlResult;
    try {
      // Strip markdown code fences if present
      const cleaned = sqlText.replace(/^```(?:json)?\n?/g, "").replace(/\n?```$/g, "");
      sqlResult = JSON.parse(cleaned);
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
