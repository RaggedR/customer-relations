"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Slot {
  date: string;
  start_time: string;
  end_time: string;
  nurse_name: string;
  nurse_id: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PortalBookPage() {
  const router = useRouter();
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load available specialties
  useEffect(() => {
    fetch("/api/slots?specialty=_list")
      .then(() => {
        // Use a dedicated endpoint or parse from schema
        // For now, fetch specialties from the nurse_specialty table via a simple approach
        return fetch("/api/schema?entity=nurse_specialty");
      })
      .catch(() => {});

    // Simpler approach: fetch all specialties from a lightweight API
    fetch("/api/nurse-specialties")
      .then((r) => r.ok ? r.json() : { specialties: [] })
      .then((data) => setSpecialties(data.specialties ?? []))
      .catch(() => {
        // Fallback: hardcoded from seed data
        setSpecialties(["Audiologist", "Physiotherapist", "Hearing Aid Technician"]);
      });
  }, []);

  async function loadSlots(specialty: string) {
    setSelectedSpecialty(specialty);
    setSelectedSlot(null);
    if (!specialty) { setSlots([]); return; }

    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const to = new Date(now);
      to.setDate(to.getDate() + 30);
      const fromStr = now.toISOString().split("T")[0];
      const toStr = to.toISOString().split("T")[0];

      const res = await fetch(`/api/slots?specialty=${encodeURIComponent(specialty)}&from=${fromStr}&to=${toStr}`);
      if (!res.ok) throw new Error("Failed to load available slots");
      const data = await res.json();
      setSlots(data.slots);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleBook() {
    if (!selectedSlot) return;
    setBooking(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          nurse_id: selectedSlot.nurse_id,
          specialty: selectedSpecialty,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Booking failed");
      }

      setSuccess(true);
      setTimeout(() => router.push("/portal"), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBooking(false);
    }
  }

  // Group slots by date
  const groupedByDate = slots.reduce<Record<string, Slot[]>>((acc, slot) => {
    (acc[slot.date] ??= []).push(slot);
    return acc;
  }, {});

  if (success) {
    return (
      <div className="space-y-4 py-8 text-center">
        <h2 className="text-xl font-semibold text-green-400">Appointment Requested</h2>
        <p className="text-sm text-muted-foreground">
          Your appointment has been submitted. You&apos;ll be redirected to your appointments shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Book an Appointment</h2>

      {/* Step 1: Specialty */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Select a specialty</label>
        <select
          value={selectedSpecialty}
          onChange={(e) => loadSlots(e.target.value)}
          className="w-full h-10 rounded border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Choose...</option>
          {specialties.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Step 2: Available slots */}
      {loading && <p className="text-sm text-muted-foreground">Loading available slots...</p>}

      {!loading && selectedSpecialty && slots.length === 0 && (
        <p className="text-sm text-muted-foreground">No available slots in the next 30 days for {selectedSpecialty}.</p>
      )}

      {!loading && Object.keys(groupedByDate).length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Select an available time slot:</p>

          {Object.entries(groupedByDate).map(([dateStr, daySlots]) => {
            const d = new Date(dateStr);
            const dayLabel = d.toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            });

            return (
              <div key={dateStr}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{dayLabel}</h3>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const isSelected = selectedSlot === slot;
                    return (
                      <button
                        key={`${slot.nurse_id}-${slot.start_time}`}
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded border px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "border-green-500 bg-green-500/20 text-green-400"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        <div className="font-medium">{slot.start_time}–{slot.end_time}</div>
                        <div className="text-xs text-muted-foreground">{slot.nurse_name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Step 3: Confirm modal */}
      {selectedSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setSelectedSlot(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Confirm Appointment</h3>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Specialty</span>
                <span>{selectedSpecialty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{new Date(selectedSlot.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span>{selectedSlot.start_time}–{selectedSlot.end_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Practitioner</span>
                <span>{selectedSlot.nurse_name}</span>
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleBook}
                disabled={booking}
                className="flex-1 text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-50"
              >
                {booking ? "Booking..." : "Confirm Booking"}
              </button>
              <button
                onClick={() => setSelectedSlot(null)}
                className="text-sm text-muted-foreground hover:text-foreground px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
