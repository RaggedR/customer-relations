"use client";

import { useState, useEffect } from "react";
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
  patientName: string;
  patientId: number;
}

function groupByDate(appointments: Appointment[]): Record<string, Appointment[]> {
  return appointments.reduce<Record<string, Appointment[]>>((acc, appt) => {
    const dateKey = new Date(appt.date).toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    (acc[dateKey] ??= []).push(appt);
    return acc;
  }, {});
}

export default function NurseAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pastExpanded, setPastExpanded] = useState(false);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    const to = new Date(now);
    to.setDate(to.getDate() + 90);
    const fromStr = from.toISOString().split("T")[0];
    const toStr = to.toISOString().split("T")[0];

    fetch(`/api/nurse/appointments?from=${fromStr}&to=${toStr}`)
      .then((res) => {
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

  const upcomingGrouped = groupByDate(upcoming);
  const pastGrouped = groupByDate(past);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Appointments</h2>
        <p className="text-sm text-muted-foreground mt-1">Upcoming and past patient appointments</p>
      </div>

      {/* Upcoming */}
      {Object.keys(upcomingGrouped).length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
        </div>
      )}

      {Object.entries(upcomingGrouped).map(([date, appts]) => (
        <section key={date}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{date}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {appts.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} />
            ))}
          </div>
        </section>
      ))}

      {/* Past — collapsible */}
      <section>
        <button
          onClick={() => setPastExpanded(!pastExpanded)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className={`text-xs transition-transform ${pastExpanded ? "rotate-90" : ""}`}>&#9654;</span>
          Past Appointments
          {past.length > 0 && (
            <span className="font-normal">({past.length})</span>
          )}
        </button>

        {pastExpanded && (
          <div className="mt-4 space-y-6">
            {Object.keys(pastGrouped).length === 0 && (
              <p className="text-sm text-muted-foreground">No past appointments.</p>
            )}

            {Object.entries(pastGrouped).map(([date, appts]) => (
              <div key={date}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{date}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {appts.map((appt) => (
                    <AppointmentCard key={appt.id} appointment={appt} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AppointmentCard({ appointment: appt }: { appointment: Appointment }) {
  return (
    <Link
      href={`/nurse/appointments/${appt.id}`}
      className="group rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground truncate">{appt.patientName}</p>
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
