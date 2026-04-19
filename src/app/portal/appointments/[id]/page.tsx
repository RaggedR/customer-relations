"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AppointmentDetail {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  specialty: string;
  status: string;
  notes: string | null;
}

const STATUS_COLOURS: Record<string, string> = {
  confirmed: "bg-green-500/20 text-green-400",
  requested: "bg-amber-500/20 text-amber-400",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-red-500/20 text-red-400",
  no_show: "bg-gray-500/20 text-gray-400",
  scheduled: "bg-purple-500/20 text-purple-400",
};

export default function PortalAppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/appointments/${id}`)
      .then((res) => {
        if (res.status === 401) { router.push("/portal/login"); return null; }
        if (res.status === 404) throw new Error("Appointment not found");
        if (!res.ok) throw new Error("Failed to load appointment");
        return res.json();
      })
      .then((data) => { if (data) setAppointment(data); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading appointment...</p>;
  if (error) return <p className="text-sm text-red-400 py-8">{error}</p>;
  if (!appointment) return null;

  const dateStr = new Date(appointment.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <Link
        href="/portal"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back to appointments
      </Link>

      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">{dateStr}</h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOURS[appointment.status] ?? "bg-gray-500/20 text-gray-400"}`}>
          {appointment.status?.replace("_", " ")}
        </span>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <Field label="Time" value={`${appointment.startTime} – ${appointment.endTime}`} />
        <Field label="Location" value={appointment.location} />
        <Field label="Specialty" value={appointment.specialty} />
        {appointment.notes && <Field label="Notes" value={appointment.notes} />}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
