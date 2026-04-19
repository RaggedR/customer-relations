"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Appointment {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  specialty: string;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  requested: "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-sky-100 text-sky-800 border-sky-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
  no_show: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function PortalAppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <Link href="/portal/book" className="text-sm text-primary font-medium hover:underline mt-2 inline-block">
              Book an appointment
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} />
            ))}
          </div>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-muted-foreground mb-4">Past Appointments</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} muted />
            ))}
          </div>
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
    <div className={`rounded-lg border border-border bg-card p-4 shadow-sm ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{dateStr}</p>
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
    </div>
  );
}
