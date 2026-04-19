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

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  requested: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-sky-100 text-sky-800 border-sky-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-gray-100 text-gray-700 border-gray-200",
  scheduled: "bg-violet-100 text-violet-800 border-violet-200",
};

export default function NurseAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/nurse/appointments")
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

  // Group by date
  const grouped = appointments.reduce<Record<string, Appointment[]>>((acc, appt) => {
    const dateKey = new Date(appt.date).toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    (acc[dateKey] ??= []).push(appt);
    return acc;
  }, {});

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Appointments</h2>
        <p className="text-sm text-muted-foreground mt-1">Upcoming patient appointments</p>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No appointments in the next 7 days.</p>
        </div>
      )}

      {Object.entries(grouped).map(([date, appts]) => (
        <section key={date}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{date}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {appts.map((appt) => (
              <Link
                key={appt.id}
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
                  <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[appt.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                    {appt.status?.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{appt.location}</span>
                  <span className="text-border">|</span>
                  <span>{appt.specialty}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
