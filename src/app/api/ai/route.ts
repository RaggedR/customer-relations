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

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prismaReadonly } from "@/lib/prisma-readonly";
import { validateAiSql } from "@/lib/sql-safety";
import { generateSchemaDescription } from "@/lib/generate-schema-description";
import { resolveNames } from "@/lib/name-resolution";
import { logger } from "@/lib/logger";
import { createRateLimiter } from "@/lib/rate-limit";
import { withRetry } from "@/lib/retry";
import { adminRoute, withRateLimit } from "@/lib/middleware";
import {
  redactForAi,
  pseudonymiseRows,
  depseudonymiseAnswer,
} from "@/lib/ai-privacy";

const aiLimiter = createRateLimiter(30, 60_000); // 30 requests per minute

/** Strip markdown code fences that LLMs sometimes wrap around JSON responses. */
function stripCodeFences(text: string): string {
  return text.replace(/^```(?:\w+)?\n?/g, "").replace(/\n?```$/g, "");
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

const ALLOWED_MODELS = new Set(["gemini-2.5-flash", "gemini-2.0-flash"]);

function getGenAI() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set in environment variables");
  }
  return new GoogleGenerativeAI(apiKey);
}

async function generateSql(
  model: ReturnType<ReturnType<typeof getGenAI>["getGenerativeModel"]>,
  question: string,
): Promise<{ sql: string; explanation: string } | { refused: true; message: string }> {
  const sqlResponse = await withRetry(
    () => model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `User question: ${question}` },
    ]),
    { label: "Gemini SQL generation" },
  );

  const sqlText = sqlResponse.response.text().trim();
  const cleaned = stripCodeFences(sqlText);
  const parsed = JSON.parse(cleaned);

  if (parsed.refused) {
    return { refused: true, message: parsed.message || "Sorry, I can't help you with that." };
  }

  const sql: string = parsed.sql;

  const safety = validateAiSql(sql);
  if (!safety.safe) {
    logger.warn({ sql, reason: safety.reason }, "AI generated unsafe query");
    throw Object.assign(new Error("unsafe_sql"), { safetyReason: safety.reason });
  }

  return { sql, explanation: parsed.explanation };
}

async function executeQuery(sql: string): Promise<Record<string, unknown>[]> {
  const rows = await prismaReadonly.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
    return await tx.$queryRawUnsafe(sql) as Record<string, unknown>[];
  });

  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out;
  });
}

async function generateAnswer(
  model: ReturnType<ReturnType<typeof getGenAI>["getGenerativeModel"]>,
  question: string,
  sql: string,
  rows: Record<string, unknown>[],
  pseudonymMap: Map<string, string>,
  inversePseudonymMap: Map<string, string>,
  resolvedName?: string,
): Promise<{ answer: string; chart: unknown }> {
  const redactedRows = redactForAi(rows);
  const aiRows = pseudonymiseRows(redactedRows, pseudonymMap);

  let aiQuestion = question;
  if (resolvedName) {
    const pseudonym = pseudonymMap.get(resolvedName) ?? resolvedName;
    aiQuestion = question.replace(
      new RegExp(resolvedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      pseudonym,
    );
  }

  const resultsResponse = await withRetry(
    () => model.generateContent([
      { text: RESULTS_PROMPT },
      { text: `User question: ${aiQuestion}` },
      { text: `SQL executed: ${sql}` },
      { text: `Results (${aiRows.length} rows): ${JSON.stringify(aiRows.slice(0, 100))}` },
    ]),
    { label: "Gemini answer generation" },
  );

  const resultsText = resultsResponse.response.text().trim();
  let answerResult;
  try {
    const cleaned = stripCodeFences(resultsText);
    answerResult = JSON.parse(cleaned);
  } catch {
    answerResult = { answer: resultsText, chart: null };
  }

  const answer = depseudonymiseAnswer(
    answerResult.answer ?? resultsText,
    inversePseudonymMap,
  );

  let chart = answerResult.chart;
  if (chart?.data && Array.isArray(chart.data)) {
    chart = {
      ...chart,
      data: chart.data.map((d: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(d)) {
          out[k] = typeof v === "string"
            ? depseudonymiseAnswer(v, inversePseudonymMap)
            : v;
        }
        return out;
      }),
    };
  }

  return { answer, chart };
}

export const POST = adminRoute()
  .use(withRateLimit(aiLimiter))
  .named("POST /api/ai")
  .handle(async (ctx) => {
    const { question, model: modelName } = await ctx.request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    if (question.length > 2000) {
      return NextResponse.json({ error: "Question too long (max 2000 characters)" }, { status: 400 });
    }

    if (modelName && !ALLOWED_MODELS.has(modelName)) {
      return NextResponse.json({ error: "Model not allowed" }, { status: 400 });
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
    const model = genAI.getGenerativeModel(
      { model: resolvedModelName },
      { timeout: 15_000 },
    );

    // Step 1: Generate SQL
    let sqlResult;
    try {
      sqlResult = await generateSql(model, resolved.question);
    } catch (err) {
      if (err instanceof Error && err.message === "unsafe_sql") {
        return NextResponse.json({
          error: "The AI generated an unsafe query. Please rephrase your question.",
        }, { status: 400 });
      }
      return NextResponse.json({
        error: "Failed to parse AI response",
      }, { status: 500 });
    }

    if ("refused" in sqlResult) {
      return NextResponse.json({
        question,
        answer: sqlResult.message,
        sql: null,
        rows: [],
        rowCount: 0,
        chart: null,
      });
    }

    const { sql, explanation } = sqlResult;

    // Step 2: Execute SQL
    let serializedRows: Record<string, unknown>[];
    try {
      serializedRows = await executeQuery(sql);
    } catch (dbError) {
      logger.error({ err: dbError, sql }, "AI SQL execution failed");
      return NextResponse.json({
        error: "Query execution failed. Please try rephrasing your question.",
      }, { status: 500 });
    }

    // Audit: log AI query execution
    ctx.audit({
      action: "ai_query",
      entity: "sql",
      entityId: String(serializedRows.length),
      details: sql,
    });

    // Audit: log cross-border data disclosure to Google Gemini
    ctx.audit({
      action: "ai_external_disclosure",
      entity: "gemini",
      entityId: String(serializedRows.length),
      details: `provider=google/gemini model=${resolvedModelName} rows=${serializedRows.length}`,
    });

    // Step 3: Generate natural language answer + chart
    const { answer, chart } = await generateAnswer(
      model,
      question,
      sql,
      serializedRows,
      resolved.pseudonymMap,
      resolved.inversePseudonymMap,
      resolved.resolvedName,
    );

    const cappedRows = serializedRows.slice(0, 100);
    return NextResponse.json({
      question,
      sql,
      explanation,
      answer,
      chart,
      rows: cappedRows,
      rowCount: serializedRows.length,
      truncated: serializedRows.length > 100,
    });
  });
