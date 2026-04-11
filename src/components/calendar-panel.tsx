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

/** 8 distinct colours for nurse colour-coding */
const NURSE_COLOURS = [
  { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/40" },
  { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/40" },
  { bg: "bg-violet-500/20", text: "text-violet-300", border: "border-violet-500/40" },
  { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/40" },
  { bg: "bg-rose-500/20", text: "text-rose-300", border: "border-rose-500/40" },
  { bg: "bg-cyan-500/20", text: "text-cyan-300", border: "border-cyan-500/40" },
  { bg: "bg-orange-500/20", text: "text-orange-300", border: "border-orange-500/40" },
  { bg: "bg-pink-500/20", text: "text-pink-300", border: "border-pink-500/40" },
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

  // Fetch appointments and nurses
  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/appointment?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.json()),
      fetch("/api/nurse").then((r) => r.json()),
    ])
      .then(([appts, nurseList]) => {
        setAppointments(Array.isArray(appts) ? appts : []);
        setNurses(Array.isArray(nurseList) ? nurseList : []);
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
        {/* Nurse legend */}
        <div className="flex items-center gap-2">
          {nurses.slice(0, 6).map((n) => {
            const c = nurseColour(n.id);
            return (
              <span
                key={n.id}
                className={`text-[10px] px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}
              >
                {n.name.split(" ")[0]}
              </span>
            );
          })}
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
                    isToday ? "text-blue-400 bg-blue-500/5" : "text-muted-foreground"
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
                        isToday ? "bg-blue-500/5" : ""
                      } ${isWeekend ? "bg-muted/30" : ""}`}
                      style={{ height: 32 }}
                      onClick={() => {
                        if (startingHere.length === 0) {
                          onSlotClick(dateKey, time);
                        }
                      }}
                    >
                      {startingHere.map((appt) => {
                        const startIdx = timeToSlotIndex(appt.start_time);
                        const endIdx = timeToSlotIndex(appt.end_time);
                        const spanSlots = Math.max(1, endIdx - startIdx);
                        const c = appt.nurse
                          ? nurseColour(appt.nurse.id)
                          : NURSE_COLOURS[0];

                        return (
                          <div
                            key={appt.id}
                            className={`absolute left-0 right-0 mx-0.5 rounded-sm border ${c.bg} ${c.border} ${c.text} px-1 overflow-hidden cursor-pointer hover:brightness-125 transition-all z-[1]`}
                            style={{
                              top: 0,
                              height: spanSlots * 32 - 2,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const label = appt.patient?.name ?? `Appointment #${appt.id}`;
                              onEventClick(appt.id, label);
                            }}
                          >
                            <div className="text-[9px] font-medium truncate leading-tight pt-0.5">
                              {appt.patient?.name ?? "—"}
                            </div>
                            {spanSlots > 1 && (
                              <div className="text-[8px] opacity-70 truncate">
                                {appt.start_time}–{appt.end_time} · {appt.location}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
