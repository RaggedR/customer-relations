"use client";

import { useState, useEffect, useCallback } from "react";

interface Slot {
  id: number;
  date: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  recurring: boolean;
}

interface BookedSlot {
  date: string;
  start_time: string;
  end_time: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_MINUTES = 45;
const START_HOUR = 7;
const END_HOUR = 19;

// Generate time slots from 07:00 to 19:00 in 45-min intervals
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  let minutes = START_HOUR * 60;
  while (minutes + SLOT_MINUTES <= END_HOUR * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += SLOT_MINUTES;
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function NurseAvailabilityPage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [booked, setBooked] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [busy, setBusy] = useState(false); // prevents double-clicks

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nurse/availability?week=${localDate(weekStart)}`);
      if (!res.ok) throw new Error("Failed to load availability");
      const data = await res.json();
      setSlots(data.slots);
      setBooked(data.booked);
    } catch {
      // silently fail — grid shows empty
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  function getDayDate(dayIndex: number): Date {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  function findSlot(dayIndex: number, time: string): Slot | undefined {
    const dayDate = localDate(getDayDate(dayIndex));
    return slots.find((s) => {
      const slotDate = s.date.split("T")[0];
      return slotDate === dayDate && s.start_time === time;
    });
  }

  function isBooked(dayIndex: number, time: string): boolean {
    const dayDate = localDate(getDayDate(dayIndex));
    return booked.some((b) => {
      const bDate = b.date.split("T")[0];
      return bDate === dayDate && b.start_time === time;
    });
  }

  async function toggleSlot(dayIndex: number, time: string) {
    if (isBooked(dayIndex, time) || busy) return;
    setBusy(true);

    try {
      const existing = findSlot(dayIndex, time);
      if (existing) {
        // Optimistic: remove from UI immediately
        setSlots((prev) => prev.filter((s) => s.id !== existing.id));
        const res = await fetch(`/api/nurse/availability/${existing.id}`, { method: "DELETE" });
        if (!res.ok) {
          // Revert on failure
          await fetchAvailability();
          return;
        }
      } else {
        // Optimistic: add to UI immediately
        const date = localDate(getDayDate(dayIndex));
        const [h, m] = time.split(":").map(Number);
        const endMin = h * 60 + m + SLOT_MINUTES;
        const endTime = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        const tempSlot: Slot = {
          id: -Date.now(), // temporary ID
          date,
          day_of_week: null,
          start_time: time,
          end_time: endTime,
          recurring: false,
        };
        setSlots((prev) => [...prev, tempSlot]);

        const res = await fetch("/api/nurse/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, start_time: time, recurring }),
        });
        if (!res.ok) {
          // Revert on failure (e.g. 409 duplicate)
          setSlots((prev) => prev.filter((s) => s.id !== tempSlot.id));
          return;
        }
        // Replace temp slot with real one from server
        const created = await res.json();
        setSlots((prev) =>
          prev.map((s) => s.id === tempSlot.id ? { ...created } : s)
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function getCellStyle(dayIndex: number, time: string): string {
    if (isBooked(dayIndex, time)) {
      return "bg-blue-500/30 border-blue-500/50 cursor-not-allowed";
    }
    const slot = findSlot(dayIndex, time);
    if (slot) {
      return slot.recurring
        ? "bg-green-500/30 border-green-500/50 cursor-pointer bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]"
        : "bg-green-500/30 border-green-500/50 cursor-pointer";
    }
    return "bg-muted/30 border-border hover:bg-muted/60 cursor-pointer";
  }

  function getCellLabel(dayIndex: number, time: string): string {
    if (isBooked(dayIndex, time)) return "Booked";
    const slot = findSlot(dayIndex, time);
    if (slot) return slot.recurring ? "Recurring" : "Available";
    return "";
  }

  const weekLabel = `${formatDate(weekStart)} – ${formatDate(getDayDate(6))}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Availability</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="rounded"
            />
            Recurring (every week)
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="text-sm text-muted-foreground hover:text-foreground px-2 py-1">
          &larr; Prev week
        </button>
        <span className="text-sm font-medium">{weekLabel}</span>
        <button onClick={nextWeek} className="text-sm text-muted-foreground hover:text-foreground px-2 py-1">
          Next week &rarr;
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-500/30 border border-green-500/50 inline-block" /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500/50 inline-block" /> Booked
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-muted/30 border border-border inline-block" /> Unavailable
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Header row */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px mb-px">
            <div /> {/* time column header */}
            {DAYS.map((day, i) => (
              <div key={day} className="text-center text-xs font-medium py-2 text-muted-foreground">
                <div>{day}</div>
                <div className="text-[10px]">{formatDate(getDayDate(i))}</div>
              </div>
            ))}
          </div>

          {/* Time rows */}
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : (
            <div className="space-y-px">
              {TIME_SLOTS.map((time) => (
                <div key={time} className="grid grid-cols-[60px_repeat(7,1fr)] gap-px">
                  <div className="text-[10px] text-muted-foreground flex items-center justify-end pr-2 h-10">
                    {time}
                  </div>
                  {DAYS.map((_, dayIndex) => (
                    <button
                      key={dayIndex}
                      onClick={() => toggleSlot(dayIndex, time)}
                      disabled={isBooked(dayIndex, time) || busy}
                      className={`h-10 rounded border text-[9px] transition-colors ${getCellStyle(dayIndex, time)}`}
                      title={`${DAYS[dayIndex]} ${time} — ${getCellLabel(dayIndex, time) || "Click to set available"}`}
                    >
                      {getCellLabel(dayIndex, time)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
