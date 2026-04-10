/**
 * Clinical Note Templates API
 *
 * GET /api/clinical-note-templates
 *
 * Returns template content (section headers) for each clinical note type.
 * The frontend pre-fills the content field when a note_type is selected.
 */

import { NextResponse } from "next/server";

const templates: Record<string, { label: string; sections: string[] }> = {
  initial_assessment: {
    label: "Initial Assessment",
    sections: [
      "PRESENTING COMPLAINT:",
      "",
      "HISTORY:",
      "",
      "CURRENT MEDICATIONS:",
      "",
      "EXAMINATION:",
      "",
      "ASSESSMENT:",
      "",
      "GOALS:",
      "",
      "PLAN:",
      "",
    ],
  },
  progress_note: {
    label: "Progress Note",
    sections: [
      "SUBJECTIVE:",
      "(Patient-reported symptoms, concerns, progress since last visit)",
      "",
      "OBJECTIVE:",
      "(Clinical observations, measurements, test results)",
      "",
      "ASSESSMENT:",
      "(Clinical reasoning, progress toward goals)",
      "",
      "PLAN:",
      "(Next steps, exercises, referrals, follow-up)",
      "",
    ],
  },
  discharge_summary: {
    label: "Discharge Summary",
    sections: [
      "REASON FOR REFERRAL:",
      "",
      "TREATMENT SUMMARY:",
      "(Number of sessions, duration, interventions used)",
      "",
      "OUTCOMES:",
      "(Goals achieved, functional improvements, measurements)",
      "",
      "CURRENT STATUS:",
      "",
      "RECOMMENDATIONS:",
      "(Home program, follow-up, re-referral criteria)",
      "",
      "GP CORRESPONDENCE:",
      "(Summary sent to referring GP: Yes/No, Date)",
      "",
    ],
  },
  treatment_plan: {
    label: "Treatment Plan",
    sections: [
      "DIAGNOSIS / CLINICAL PRESENTATION:",
      "",
      "GOALS:",
      "Short-term (4 weeks):",
      "Long-term (12 weeks):",
      "",
      "INTERVENTIONS:",
      "",
      "FREQUENCY:",
      "",
      "EXPECTED DURATION:",
      "",
      "OUTCOME MEASURES:",
      "",
      "REVIEW DATE:",
      "",
    ],
  },
};

export async function GET() {
  return NextResponse.json(templates);
}
