"use client";

import { Separator } from "@/components/ui/separator";

interface SidebarProps {
  onOpenPatients: () => void;
  onAddPatient: () => void;
  onOpenAiChat: () => void;
}

export function Sidebar({ onOpenPatients, onAddPatient, onOpenAiChat }: SidebarProps) {
  return (
    <aside className="flex flex-col w-56 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 h-12 font-semibold text-sm tracking-tight">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Patient Manager
      </div>
      <Separator />
      <nav className="flex-1 px-2 py-3 space-y-1">
        <button
          onClick={onOpenPatients}
          className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded-md transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 12h-6" />
          </svg>
          Patients
        </button>
      </nav>
      <Separator />
      <div className="px-2 py-3 space-y-1.5">
        <button
          onClick={onAddPatient}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md border border-floating-border bg-floating text-floating-foreground hover:bg-floating-muted transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="16" y1="11" x2="22" y2="11" />
          </svg>
          Add Patient
        </button>
        <button
          onClick={onOpenAiChat}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md border border-floating-border bg-floating text-floating-foreground hover:bg-floating-muted transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.2-5 7.5V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.5C6 16.2 4 13.3 4 10a8 8 0 0 1 8-8z" />
            <line x1="10" y1="22" x2="14" y2="22" />
          </svg>
          Ask AI
        </button>
      </div>
    </aside>
  );
}
