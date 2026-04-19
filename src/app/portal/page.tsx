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

const STATUS_COLOURS: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-400",
  requested: "bg-amber-500/20 text-amber-400",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-red-500/20 text-red-400",
  no_show: "bg-gray-500/20 text-gray-400",
};

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
  if (error) return <p className="text-sm text-red-400 py-8">{error}</p>;

  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.date) >= now && a.status !== "cancelled");
  const past = appointments.filter((a) => new Date(a.date) < now || a.status === "cancelled");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">Upcoming Appointments</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} />
            ))}
          </div>
        )}
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
          <div className="mt-4 space-y-2">
            {past.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past appointments.</p>
            ) : (
              past.map((appt) => (
                <AppointmentCard key={appt.id} appointment={appt} />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function AppointmentCard({ appointment: appt }: { appointment: Appointment }) {
  const dateStr = new Date(appt.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Link href={`/portal/appointments/${appt.id}`} className="block rounded-lg border border-border p-3 hover:border-foreground/30 transition-colors cursor-pointer">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{dateStr}</p>
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
