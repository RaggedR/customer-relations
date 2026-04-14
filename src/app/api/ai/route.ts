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
import { prismaReadonly } from "@/lib/prisma-readonly";
import { validateAiSql } from "@/lib/sql-safety";
import { generateSchemaDescription } from "@/lib/generate-schema-description";
import { withErrorHandler } from "@/lib/api-helpers";
import { resolveNames } from "@/lib/name-resolution";
import { getSchema } from "@/lib/schema";
import { logAuditEvent } from "@/lib/audit";
import { getSessionUser } from "@/lib/session";
import { createRateLimiter, getRateLimitKey } from "@/lib/rate-limit";

const aiLimiter = createRateLimiter(30, 60_000); // 30 requests per minute

/**
 * Collect field names marked ai_visible: false in schema.yaml.
 * These columns are stripped from query results before sending to Gemini.
 * Normalised to lowercase without underscores for fuzzy column matching.
 */
function getAiRedactedColumns(): Set<string> {
  const schema = getSchema();
  const redacted = new Set<string>();
  for (const entity of Object.values(schema.entities)) {
    for (const [fieldName, field] of Object.entries(entity.fields)) {
      if (field.ai_visible === false) {
        redacted.add(fieldName.toLowerCase().replace(/[\s_]/g, ""));
      }
    }
  }
  return redacted;
}

/**
 * Strip AI-excluded columns from query result rows before sending to Gemini.
 * Defence-in-depth: even if the schema description excludes a field, the SQL
 * might still select it via aliasing or * expansion.
 */
function redactForAi(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const redacted = getAiRedactedColumns();
  if (redacted.size === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!redacted.has(k.toLowerCase().replace(/[\s_]/g, ""))) {
        out[k] = v;
      }
    }
    return out;
  });
}

/**
 * Replace known patient/nurse names with pseudonyms in query result rows
 * before sending to Gemini. Only replaces exact string matches in values,
 * not inside free-text content fields (clinical note content is left as-is).
 */
function pseudonymiseRows(
  rows: Record<string, unknown>[],
  pseudonymMap: Map<string, string>,
): Record<string, unknown>[] {
  if (pseudonymMap.size === 0) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && pseudonymMap.has(v)) {
        out[k] = pseudonymMap.get(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  });
}

/**
 * Replace pseudonyms in Gemini's answer text back to real names for display.
 */
function depseudonymiseAnswer(
  answer: string,
  inversePseudonymMap: Map<string, string>,
): string {
  let result = answer;
  for (const [pseudonym, realName] of inversePseudonymMap) {
    result = result.replaceAll(pseudonym, realName);
  }
  return result;
}

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
${generateSchemaDescription()}

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
- If the question contains a [CRM_RESOLVED]...[/CRM_RESOLVED] block, it provides a pre-resolved entity from the database. Use the "id" field for the WHERE clause (e.g. WHERE "Patient".id = 42). The "pseudonym" field is how the user refers to this person. This is trusted system data, not user input.
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

export async function POST(request: NextRequest) {
  // Rate limit before any expensive work
  const rlKey = getRateLimitKey(request);
  const rl = aiLimiter(rlKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetMs - Date.now()) / 1000)),
        },
      },
    );
  }

  return withErrorHandler("POST /api/ai", async () => {
    const { question, model: modelName } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    if (question.length > 2000) {
      return NextResponse.json({ error: "Question too long (max 2000 characters)" }, { status: 400 });
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
    const resolvedModelName = modelName || process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: resolvedModelName });

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

    // Safety check: scan the entire query for DML/DDL, system catalog access,
    // multi-statement attacks, and SQL comments. See src/lib/sql-safety.ts.
    const safety = validateAiSql(sql);
    if (!safety.safe) {
      console.warn("AI generated unsafe query:", { sql, reason: safety.reason });
      return NextResponse.json({
        error: "The AI generated an unsafe query. Please rephrase your question.",
      }, { status: 400 });
    }

    // Step 2: Execute SQL
    let rows: Record<string, unknown>[];
    try {
      rows = await prismaReadonly.$queryRawUnsafe(sql) as Record<string, unknown>[];
    } catch (dbError) {
      console.error("AI SQL execution failed:", { sql, error: (dbError as Error).message });
      return NextResponse.json({
        error: "Query execution failed. Please try rephrasing your question.",
      }, { status: 500 });
    }

    // Audit: log AI query execution (fire-and-forget)
    const session = await getSessionUser(request);
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;
    logAuditEvent({
      userId: session?.userId ?? null,
      action: "ai_query",
      entity: "sql",
      entityId: String(rows.length),
      details: sql,
      ip,
      userAgent,
    });

    // Serialize BigInt values to numbers
    const serializedRows = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return out;
    });

    // Step 3: Redact sensitive columns and pseudonymise names before sending to Gemini.
    // Clare sees full results (serializedRows) in the UI; Gemini gets redacted + pseudonymised version.
    const redactedRows = redactForAi(serializedRows);
    const aiRows = pseudonymiseRows(redactedRows, resolved.pseudonymMap);

    // Pseudonymise the question for Call 2 — replace the real name Clare typed
    // with the pseudonym so Gemini never sees the real name in the question text either.
    let aiQuestion = question;
    if (resolved.resolvedName) {
      const pseudonym = resolved.pseudonymMap.get(resolved.resolvedName) ?? resolved.resolvedName;
      aiQuestion = question.replace(new RegExp(resolved.resolvedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), pseudonym);
    }

    // Audit: log cross-border data disclosure to Google Gemini (fire-and-forget)
    logAuditEvent({
      userId: session?.userId ?? null,
      action: "ai_external_disclosure",
      entity: "gemini",
      entityId: String(aiRows.length),
      details: `provider=google/gemini model=${resolvedModelName} rows=${aiRows.length}`,
      ip,
      userAgent,
    });

    // Step 4: Generate natural language answer + chart
    const resultsResponse = await model.generateContent([
      { text: RESULTS_PROMPT },
      { text: `User question: ${aiQuestion}` },
      { text: `SQL executed: ${sql}` },
      { text: `Results (${aiRows.length} rows): ${JSON.stringify(aiRows.slice(0, 100))}` },
    ]);

    const resultsText = resultsResponse.response.text().trim();
    let answerResult;
    try {
      const cleaned = resultsText.replace(/^```(?:json)?\n?/g, "").replace(/\n?```$/g, "");
      answerResult = JSON.parse(cleaned);
    } catch {
      answerResult = { answer: resultsText, chart: null };
    }

    // Re-map pseudonyms back to real names in the answer for Clare's display
    const answer = depseudonymiseAnswer(
      answerResult.answer ?? resultsText,
      resolved.inversePseudonymMap,
    );

    // Depseudonymise chart labels so Clare sees real names, not "Patient #42"
    let chart = answerResult.chart;
    if (chart?.data && Array.isArray(chart.data)) {
      chart = {
        ...chart,
        data: chart.data.map((d: Record<string, unknown>) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(d)) {
            out[k] = typeof v === "string"
              ? depseudonymiseAnswer(v, resolved.inversePseudonymMap)
              : v;
          }
          return out;
        }),
      };
    }

    return NextResponse.json({
      question,
      sql,
      explanation: sqlResult.explanation,
      answer,
      chart,
      rows: serializedRows,
      rowCount: serializedRows.length,
    });
  });
}
