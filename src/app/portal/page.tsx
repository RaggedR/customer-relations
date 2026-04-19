"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STATUS_STYLES, STATUS_FALLBACK } from "@/lib/status-styles";

interface Appointment {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  specialty: string;
  status: string;
}

export default function PortalAppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/portal/appointments")
      .then((res) => {
        if (res.status === 401) { router.push("/portal/login"); return []; }
        if (!res.ok) throw new Error("Failed to load appointments");
        return res.json();
      })
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading appointments...</p>;
  if (error) return <p className="text-sm text-red-600 py-8">{error}</p>;

  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.date) >= now && a.status !== "cancelled");
  const past = appointments.filter((a) => new Date(a.date) < now || a.status === "cancelled");

  return (
    <div className="space-y-10 max-w-5xl">
      {/* Upcoming */}
      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">Upcoming Appointments</h2>
          <p className="text-sm text-muted-foreground mt-1">Your scheduled visits</p>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} />
            ))}
          </div>
        )}
      </section>

      {/* Past — collapsible */}
      {past.length > 0 && (
        <section>
          <button
            onClick={() => setPastExpanded((v) => !v)}
            className="flex items-center gap-2 text-lg font-semibold text-muted-foreground mb-4 hover:text-foreground transition-colors"
          >
            <span className="text-sm">{pastExpanded ? "▼" : "▶"}</span>
            Past Appointments ({past.length})
          </button>
          {pastExpanded && (
            <div className="grid gap-3 sm:grid-cols-2">
              {past.map((appt) => (
                <AppointmentCard key={appt.id} appointment={appt} muted />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AppointmentCard({ appointment: appt, muted }: { appointment: Appointment; muted?: boolean }) {
  const dateStr = new Date(appt.date).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Link
      href={`/portal/appointments/${appt.id}`}
      className={`block rounded-lg border border-border bg-card p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{dateStr}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {appt.startTime} – {appt.endTime}
          </p>
        </div>
        <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[appt.status] ?? STATUS_FALLBACK}`}>
          {appt.status?.replace("_", " ")}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{appt.location}</span>
        <span className="text-border">|</span>
        <span>{appt.specialty}</span>
      </div>
    </Link>
  );
}
