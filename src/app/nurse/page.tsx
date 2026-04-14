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
  if (error) return <p className="text-sm text-red-400 py-8">{error}</p>;

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
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Upcoming Appointments</h2>

      {Object.keys(grouped).length === 0 && (
        <p className="text-sm text-muted-foreground">No appointments in the next 7 days.</p>
      )}

      {Object.entries(grouped).map(([date, appts]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">{date}</h3>
          <div className="space-y-2">
            {appts.map((appt) => (
              <Link
                key={appt.id}
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
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
