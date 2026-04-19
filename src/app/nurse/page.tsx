"use client";

import { useState, useEffect } from "react";
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

const STATUS_COLOURS: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-400",
  requested: "bg-amber-500/20 text-amber-400",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-red-500/20 text-red-400",
  no_show: "bg-gray-500/20 text-gray-400",
  scheduled: "bg-purple-500/20 text-purple-400",
};

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
    // Fetch past 30 days + next 90 days
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
  if (error) return <p className="text-sm text-red-400 py-8">{error}</p>;

  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.date) >= now && a.status !== "cancelled");
  const past = appointments.filter((a) => new Date(a.date) < now || a.status === "cancelled");

  const upcomingGrouped = groupByDate(upcoming);
  const pastGrouped = groupByDate(past);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">Upcoming Appointments</h2>

        {Object.keys(upcomingGrouped).length === 0 && (
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
        )}

        <div className="space-y-6">
          {Object.entries(upcomingGrouped).map(([date, appts]) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{date}</h3>
              <div className="space-y-2">
                {appts.map((appt) => (
                  <AppointmentCard key={appt.id} appointment={appt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <button
          onClick={() => setPastExpanded(!pastExpanded)}
          className="flex items-center gap-2 text-lg font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className={`text-xs transition-transform ${pastExpanded ? "rotate-90" : ""}`}>&#9654;</span>
          Past Appointments
          {past.length > 0 && (
            <span className="text-xs font-normal">({past.length})</span>
          )}
        </button>

        {pastExpanded && (
          <div className="mt-4 space-y-6">
            {Object.keys(pastGrouped).length === 0 && (
              <p className="text-sm text-muted-foreground">No past appointments.</p>
            )}

            {Object.entries(pastGrouped).map(([date, appts]) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{date}</h3>
                <div className="space-y-2">
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
      className="block rounded-lg border border-border p-3 hover:border-ring transition-colors"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{appt.patientName}</p>
          <p className="text-xs text-muted-foreground">
            {appt.startTime}–{appt.endTime} &middot; {appt.location} &middot; {appt.specialty}
          </p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOURS[appt.status] ?? "bg-gray-500/20 text-gray-400"}`}>
          {appt.status?.replace("_", " ")}
        </span>
      </div>
    </Link>
  );
}
