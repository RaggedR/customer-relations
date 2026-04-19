"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Appointment {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  specialty: string;
  status: string;
  patientName: string;
  patientId: number;
}

interface Note {
  id: number;
  date: string;
  noteType: string;
  clinician: string | null;
  imageDataUri: string;
}

interface NotesResponse {
  patientRef: string;
  notes: Note[];
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  initial_assessment: "Initial Assessment",
  progress_note: "Progress Note",
  discharge_summary: "Discharge Summary",
  treatment_plan: "Treatment Plan",
  personal_note: "Personal Note",
};

const AUTO_CLOSE_MS = 5 * 60 * 1000; // 5 minutes

export default function NurseAppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Notes — on-demand, hidden by default
  const [notesData, setNotesData] = useState<NotesResponse | null>(null);
  const [notesVisible, setNotesVisible] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // New note form state
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("progress_note");
  const [submitting, setSubmitting] = useState(false);

  // Cancel form state
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Load appointment details only (NOT notes — those are on-demand)
  useEffect(() => {
    fetch(`/api/nurse/appointments/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setAppointment)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const closeNotes = useCallback(() => {
    setNotesVisible(false);
    setNotesData(null);
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

  async function handleShowNotes() {
    if (notesVisible) {
      closeNotes();
      return;
    }

    setNotesLoading(true);
    try {
      const res = await fetch(`/api/nurse/appointments/${id}/notes`);
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setNotesData(data);
      setNotesVisible(true);

      // Start 5-minute auto-close timer
      setRemainingSeconds(AUTO_CLOSE_MS / 1000);
      closeTimerRef.current = setTimeout(closeNotes, AUTO_CLOSE_MS);
      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => prev <= 1 ? 0 : prev - 1);
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

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim() || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/nurse/appointments/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteContent, noteType }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create note");
        return;
      }

      setNoteContent("");

      // If notes are currently visible, refresh them to show the new one
      if (notesVisible) {
        const updated = await fetch(`/api/nurse/appointments/${id}/notes`).then((r) => r.json());
        setNotesData(updated);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    setCancelling(true);

    try {
      const res = await fetch(`/api/nurse/appointments/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (res.ok) {
        router.push("/nurse");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to cancel appointment");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading...</p>;
  if (error) return <p className="text-sm text-red-600 py-8">{error}</p>;

  return (
    <div className="space-y-6">
      <Link href="/nurse" className="text-xs text-muted-foreground hover:text-foreground">
        &larr; Back to appointments
      </Link>

      {/* Appointment info — shows patient name (scheduling context) */}
      {appointment && (
        <div className="rounded-lg border border-border p-4 space-y-1">
          <h2 className="text-lg font-semibold">Patient #{appointment.patientId}</h2>
          <p className="text-sm text-muted-foreground">
            {new Date(appointment.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
            {" "}&middot; {appointment.startTime}–{appointment.endTime}
          </p>
          <p className="text-sm text-muted-foreground">
            {appointment.location} &middot; {appointment.specialty}
          </p>
          {appointment.status !== "cancelled" && !showCancelForm && (
            <button
              onClick={() => setShowCancelForm(true)}
              className="text-xs text-red-600 hover:text-red-700 mt-2"
            >
              Cancel appointment
            </button>
          )}
          {showCancelForm && (
            <form onSubmit={handleCancel} className="mt-3 space-y-2">
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Cancellation reason..."
                rows={2}
                className="w-full rounded border border-input bg-transparent px-2 py-1.5 text-sm resize-y"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={cancelling}
                  className="text-xs font-medium bg-red-600 text-white px-3 py-1 rounded disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Confirm cancellation"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCancelForm(false); setCancelReason(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Keep appointment
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Clinical notes — on-demand, pseudonymised (Patient #N), watermarked images, copy-prevented.
          PRIVACY: The appointment card above shows the patient's real name (scheduling context).
          This section shows ONLY the patient number (clinical context). This separation is
          deliberate — a leaked screenshot of the notes section cannot identify the patient.
          Do NOT add patientName to this section. See HUMAN_TESTS_TODO.md compliance section.
          Notes are hidden by default — nurse must click "Show Notes" to reveal.
          Auto-closes after 5 minutes. */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Clinical Notes {notesData ? `— ${notesData.patientRef}` : ""}
          </h3>
          <div className="flex items-center gap-3">
            {notesVisible && remainingSeconds > 0 && (
              <span className="text-xs text-amber-600 font-mono">
                {formatCountdown(remainingSeconds)}
              </span>
            )}
            <button
              onClick={handleShowNotes}
              disabled={notesLoading}
              className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                notesVisible
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              } disabled:opacity-50`}
            >
              {notesLoading ? "Loading..." : notesVisible ? "Hide Notes" : "Show Notes"}
            </button>
          </div>
        </div>

        {notesVisible && notesData && (
          <div
            className="mt-4 space-y-4"
            style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {notesData.notes.length === 0 && (
              <p className="text-xs text-muted-foreground">No notes recorded for this patient.</p>
            )}

            {notesData.notes.map((note) => (
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
                {/* Watermarked PNG — no selectable text */}
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
      </div>

      {/* Add note form — always visible (nurses need to add notes regardless of viewing existing ones) */}
      <form onSubmit={handleAddNote} className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Add Note</h3>
        <select
          value={noteType}
          onChange={(e) => setNoteType(e.target.value)}
          className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm"
        >
          <option value="progress_note">Progress Note</option>
          <option value="initial_assessment">Initial Assessment</option>
          <option value="discharge_summary">Discharge Summary</option>
          <option value="treatment_plan">Treatment Plan</option>
          <option value="personal">Personal Note</option>
        </select>
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Enter note content..."
          rows={4}
          className="w-full rounded border border-input bg-transparent px-2 py-1.5 text-sm resize-y"
        />
        <button
          type="submit"
          disabled={submitting || !noteContent.trim()}
          className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save Note"}
        </button>
      </form>
    </div>
  );
}
