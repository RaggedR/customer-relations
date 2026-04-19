"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface PatientRecord {
  patientRef: string;
  patientId: number;
  noteCount: number;
}

interface Note {
  id: number;
  date: string;
  noteType: string;
  clinician: string | null;
  imageDataUri: string;
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  initial_assessment: "Initial Assessment",
  progress_note: "Progress Note",
  discharge_summary: "Discharge Summary",
  treatment_plan: "Treatment Plan",
  personal_note: "Personal Note",
};

const AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutes

export default function NurseRecordsPage() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which patient's notes are currently visible (null = none)
  const [visiblePatientId, setVisiblePatientId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/nurse/records")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load patient records");
        return res.json();
      })
      .then((data) => setPatients(data.patients))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const closeNotes = useCallback(() => {
    setVisiblePatientId(null);
    setNotes([]);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    closeTimerRef.current = null;
    countdownRef.current = null;
    setRemainingSeconds(0);
  }, []);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  async function handleShowNotes(patientId: number) {
    // If already showing this patient, close
    if (visiblePatientId === patientId) {
      closeNotes();
      return;
    }

    // Close any existing notes first
    closeNotes();

    setNotesLoading(true);
    try {
      const res = await fetch(`/api/nurse/records/${patientId}/notes`);
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setNotes(data.notes);
      setVisiblePatientId(patientId);

      // Start 5-minute auto-close timer
      setRemainingSeconds(AUTO_CLOSE_MS / 1000);
      closeTimerRef.current = setTimeout(closeNotes, AUTO_CLOSE_MS);
      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNotesLoading(false);
    }
  }

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading patient records...</p>;
  if (error) return <p className="text-sm text-red-600 py-8">{error}</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Patient Records</h2>
      <p className="text-sm text-muted-foreground">
        Select a patient to view their clinical notes. Notes are displayed as watermarked images
        and will automatically close after 5 minutes.
      </p>

      {patients.length === 0 && (
        <p className="text-sm text-muted-foreground">No assigned patients.</p>
      )}

      <div className="space-y-3">
        {patients.map((patient) => {
          const isVisible = visiblePatientId === patient.patientId;

          return (
            <div key={patient.patientId} className="rounded-lg border border-border">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{patient.patientRef}</p>
                  <p className="text-xs text-muted-foreground">
                    {patient.noteCount} {patient.noteCount === 1 ? "note" : "notes"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {isVisible && remainingSeconds > 0 && (
                    <span className="text-xs text-amber-600 font-mono">
                      {formatCountdown(remainingSeconds)}
                    </span>
                  )}
                  <button
                    onClick={() => handleShowNotes(patient.patientId)}
                    disabled={notesLoading}
                    className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                      isVisible
                        ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    } disabled:opacity-50`}
                  >
                    {notesLoading && visiblePatientId !== patient.patientId
                      ? "Loading..."
                      : isVisible
                        ? "Hide Notes"
                        : "Show Notes"}
                  </button>
                </div>
              </div>

              {/* Notes panel — only visible when active */}
              {isVisible && notes.length > 0 && (
                <div
                  className="border-t border-border p-4 space-y-4"
                  style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {notes.map((note) => (
                    <div key={`${note.noteType}-${note.id}`} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          {NOTE_TYPE_LABELS[note.noteType] ?? note.noteType}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(note.date).toLocaleDateString("en-AU")}
                          {note.clinician && ` — ${note.clinician}`}
                        </span>
                      </div>
                      <img
                        src={note.imageDataUri}
                        alt="Clinical note (watermarked)"
                        className="w-full rounded border border-border"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              )}

              {isVisible && notes.length === 0 && !notesLoading && (
                <div className="border-t border-border p-4">
                  <p className="text-xs text-muted-foreground">No notes recorded for this patient.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
