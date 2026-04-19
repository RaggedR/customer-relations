"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";

interface Appointment {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  specialty: string;
  status: string;
  notes?: string;
  nurse?: { id: number; name: string };
  patient?: { id: number; name: string };
}

interface Nurse {
  id: number;
  name: string;
}

interface CalendarPanelProps {
  onEventClick: (id: number, name: string) => void;
  onSlotClick: (date: string, time: string) => void;
}

/** 8 distinct colours for nurse colour-coding (light-mode optimised) */
const NURSE_COLOURS = [
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200" },
  { bg: "bg-violet-100", text: "text-violet-800", border: "border-violet-200" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-200" },
  { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
  { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-200" },
];

const HOURS_START = 7;
const HOURS_END = 19;
const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = ((HOURS_END - HOURS_START) * 60) / SLOT_MINUTES;

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDateISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDayHeader(d: Date, today: string): { label: string; isToday: boolean } {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const iso = formatDateISO(d);
  return {
    label: `${days[d.getDay()]} ${d.getDate()}`,
    isToday: iso === today,
  };
}

function timeToSlotIndex(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - HOURS_START) * 60 + m) / SLOT_MINUTES;
}

function slotIndexToTime(index: number): string {
  const totalMinutes = HOURS_START * 60 + index * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function CalendarPanel({ onEventClick, onSlotClick }: CalendarPanelProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightNurseId, setHighlightNurseId] = useState<number | null>(null);
  const [popup, setPopup] = useState<{
    x: number;
    y: number;
    dateKey: string;
    time: string;
    appointments: Appointment[];
  } | null>(null);

  // Compute the 14-day range
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      result.push(d);
    }
    return result;
  }, [weekStart]);

  const dateFrom = formatDateISO(days[0]);
  const dateTo = formatDateISO(days[13]);
  const today = formatDateISO(new Date());

  // Fetch appointments (extract nurse list from appointment data)
  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/appointment?dateFrom=${dateFrom}&dateTo=${dateTo}`)
      .then((r) => r.json())
      .then((appts) => {
        const apptList = Array.isArray(appts) ? appts : [];
        setAppointments(apptList);
        // Extract unique nurses from appointments
        const nurseMap = new Map<number, string>();
        for (const a of apptList) {
          if (a.nurse?.id && a.nurse?.name) {
            nurseMap.set(a.nurse.id, a.nurse.name);
          }
        }
        setNurses(Array.from(nurseMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((err) => console.error("Calendar fetch error:", err))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Nurse colour map
  const nurseColour = useCallback(
    (nurseId: number) => NURSE_COLOURS[nurseId % NURSE_COLOURS.length],
    []
  );

  // Group appointments by date string
  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const dateKey = a.date.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(a);
    }
    return map;
  }, [appointments]);

  // Navigation
  function prevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToday() {
    setWeekStart(startOfWeek(new Date()));
  }

  // Time labels for left gutter
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      slots.push(slotIndexToTime(i));
    }
    return slots;
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header: navigation + search */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={prevWeek}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={nextWeek}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Button>
        </div>
        <span className="text-sm font-medium">
          {days[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          {" — "}
          {days[13].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <div className="flex-1" />
        {/* Nurse highlight dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground">Highlight:</label>
          <select
            value={highlightNurseId ?? ""}
            onChange={(e) => setHighlightNurseId(e.target.value ? Number(e.target.value) : null)}
            className="h-7 rounded border border-input bg-transparent px-2 text-[11px]"
          >
            <option value="">All nurses</option>
            {nurses.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `48px repeat(14, 1fr)` }}>
            {/* Column headers */}
            <div className="sticky top-0 z-10 bg-background border-b border-border" />
            {days.map((d, i) => {
              const { label, isToday } = formatDayHeader(d, today);
              return (
                <div
                  key={i}
                  className={`sticky top-0 z-10 bg-background border-b border-border px-1 py-1.5 text-center text-[10px] font-medium ${
                    isToday ? "text-blue-700 bg-blue-50" : "text-muted-foreground"
                  } ${d.getDay() === 0 || d.getDay() === 6 ? "opacity-50" : ""}`}
                >
                  {label}
                </div>
              );
            })}

            {/* Time rows */}
            {timeSlots.map((time, slotIdx) => (
              <React.Fragment key={`row-${slotIdx}`}>
                {/* Time label */}
                <div
                  className="border-b border-border/30 px-1 text-[9px] text-muted-foreground text-right pr-2 flex items-start justify-end"
                  style={{ height: 32 }}
                >
                  {slotIdx % 2 === 0 ? time : ""}
                </div>

                {/* Day cells */}
                {days.map((d, dayIdx) => {
                  const dateKey = formatDateISO(d);
                  const dayAppts = appointmentsByDate[dateKey] ?? [];
                  const isToday = dateKey === today;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                  // Find appointments that START in this slot
                  const startingHere = dayAppts.filter(
                    (a) => a.start_time === time
                  );

                  return (
                    <div
                      key={`${slotIdx}-${dayIdx}`}
                      className={`relative border-b border-r border-border/20 cursor-pointer hover:bg-accent/30 transition-colors ${
                        isToday ? "bg-blue-50" : ""
                      } ${isWeekend ? "bg-muted/30" : ""}`}
                      style={{ height: 32 }}
                      onClick={(e) => {
                        if (startingHere.length === 0) {
                          onSlotClick(dateKey, time);
                        } else {
                          // Show popup menu for this cell
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setPopup({
                            x: rect.left,
                            y: rect.bottom,
                            dateKey,
                            time,
                            appointments: startingHere,
                          });
                        }
                      }}
                    >
                      {(() => {
                        const count = startingHere.length;
                        if (count === 0) return null;

                        const first = startingHere[0];
                        const startIdx = timeToSlotIndex(first.start_time);
                        const endIdx = timeToSlotIndex(first.end_time);
                        const spanSlots = Math.max(1, endIdx - startIdx);
                        const fullHeight = spanSlots * 32 - 2;

                        // Highlight: if a nurse is selected, check if any appointment in this slot belongs to them
                        const hasHighlightedNurse = highlightNurseId === null ||
                          startingHere.some((a) => a.nurse?.id === highlightNurseId);
                        const pillClass = hasHighlightedNurse
                          ? "bg-blue-100 border-blue-200 text-blue-800"
                          : "bg-muted/30 border-border text-muted-foreground";

                        return (
                          <div
                            className={`absolute left-0 right-0 mx-0.5 rounded-sm border ${pillClass} px-1 overflow-hidden cursor-pointer hover:brightness-125 transition-all z-[1] flex items-center justify-center`}
                            style={{ top: 0, height: fullHeight }}
                          >
                            <span className="text-[9px] font-medium">{count}</span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Popup menu for cells with appointments */}
      {popup && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setPopup(null)}
        >
          <div
            className="absolute rounded-lg border border-border bg-card shadow-lg py-1 min-w-[200px]"
            style={{
              left: Math.min(popup.x, window.innerWidth - 220),
              top: Math.min(popup.y, window.innerHeight - 200),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border">
              {popup.appointments.length} appointment{popup.appointments.length > 1 ? "s" : ""}
            </div>
            {popup.appointments.map((appt) => (
              <button
                key={appt.id}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors"
                onClick={() => {
                  const label = appt.patient?.name ?? `Appointment #${appt.id}`;
                  onEventClick(appt.id, label);
                  setPopup(null);
                }}
              >
                <span className="font-medium">{appt.nurse?.name ?? "—"}</span>
              </button>
            ))}
            <div className="border-t border-border mt-0.5">
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-primary"
                onClick={() => {
                  onSlotClick(popup.dateKey, popup.time);
                  setPopup(null);
                }}
              >
                + New appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
