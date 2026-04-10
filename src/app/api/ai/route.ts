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

"Company" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT
)

"Contact" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  notes TEXT,
  "companyId" INT REFERENCES "Company"(id)
)

"Interaction" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  summary TEXT NOT NULL,
  date TIMESTAMP NOT NULL,
  type TEXT, -- values: 'call', 'email', 'meeting', 'note'
  "contactId" INT REFERENCES "Contact"(id)
)

"Deal" (
  id SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT now(),
  "updatedAt" TIMESTAMP,
  title TEXT NOT NULL,
  value FLOAT,
  stage TEXT, -- values: 'lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
  expected_close TIMESTAMP,
  notes TEXT,
  "contactId" INT REFERENCES "Contact"(id),
  "companyId" INT REFERENCES "Company"(id)
)
`;

const SYSTEM_PROMPT = `You are a CRM data analyst. You help users query their customer relations database.

Given a natural language question, you must:
1. Write a PostgreSQL SELECT query to answer it (READ-ONLY, no INSERT/UPDATE/DELETE/DROP/ALTER)
2. After seeing the results, provide a short natural language answer
3. If the data suits a chart, suggest a chart configuration

Database schema:
${SCHEMA_DESCRIPTION}

IMPORTANT RULES:
- Only generate SELECT statements. Never generate any data-modifying SQL.
- Always quote table and column names with double quotes when they contain uppercase letters (e.g. "Company", "createdAt", "companyId")
- Use double quotes for identifiers, not single quotes
- Today's date is ${new Date().toISOString().split("T")[0]}
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
