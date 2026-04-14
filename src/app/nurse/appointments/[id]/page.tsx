"use client";

import { useState, useEffect } from "react";
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

export default function NurseAppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [notesData, setNotesData] = useState<NotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New note form state
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("progress_note");
  const [submitting, setSubmitting] = useState(false);

  // Cancel form state (replaces window.prompt)
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Load appointment details and notes
  useEffect(() => {
    Promise.all([
      fetch(`/api/nurse/appointments?from=1970-01-01&to=2099-12-31`)
        .then((r) => r.json())
        .then((appointments: Appointment[]) =>
          appointments.find((a) => a.id === Number(id)) ?? null
        ),
      fetch(`/api/nurse/appointments/${id}/notes`).then((r) => r.json()),
    ])
      .then(([appt, notes]) => {
        setAppointment(appt);
        setNotesData(notes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

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
      // Reload notes to see the new one (watermarked)
      const updated = await fetch(`/api/nurse/appointments/${id}/notes`).then((r) => r.json());
      setNotesData(updated);
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
  if (error) return <p className="text-sm text-red-400 py-8">{error}</p>;

  return (
    <div className="space-y-6">
      <Link href="/nurse" className="text-xs text-muted-foreground hover:text-foreground">
        &larr; Back to appointments
      </Link>

      {/* Appointment info — shows patient name (scheduling context) */}
      {appointment && (
        <div className="rounded-lg border border-border p-4 space-y-1">
          <h2 className="text-lg font-semibold">{appointment.patientName}</h2>
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
              className="text-xs text-red-400 hover:text-red-300 mt-2"
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

      {/* Clinical notes — pseudonymised (Patient #N), watermarked images, copy-prevented */}
      {notesData && (
        <div
          style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Clinical Notes — {notesData.patientRef}
          </h3>

          {notesData.notes.length === 0 && (
            <p className="text-xs text-muted-foreground">No notes recorded for this patient.</p>
          )}

          <div className="space-y-4">
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
        </div>
      )}

      {/* Add note form */}
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
