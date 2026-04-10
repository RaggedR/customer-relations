"use client";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const ENTITY_ICONS: Record<string, string> = {
  company: "M3 21V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M13 21V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v18",
  contact: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  interaction: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  deal: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
};

function EntityIcon({ entity }: { entity: string }) {
  const d = ENTITY_ICONS[entity];
  if (!d) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

interface SidebarProps {
  entities: string[];
  activeEntity: string | null;
  onEntitySelect: (entity: string) => void;
  actions?: React.ReactNode;
}

export function Sidebar({ entities, activeEntity, onEntitySelect, actions }: SidebarProps) {
  return (
    <aside className="flex flex-col w-56 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 h-12 font-semibold text-sm tracking-tight">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        CRM
      </div>
      <Separator />
      <nav className="flex-1 px-2 py-3 space-y-1">
        <p className="px-2 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Entities
        </p>
        {entities.map((entity) => (
          <button
            key={entity}
            onClick={() => onEntitySelect(entity)}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors capitalize",
              activeEntity === entity
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <EntityIcon entity={entity} />
            {entity === "company" ? "Companies" : `${entity}s`}
          </button>
        ))}
      </nav>
      {actions && (
        <>
          <Separator />
          <div className="px-2 py-3">
            {actions}
          </div>
        </>
      )}
    </aside>
  );
}
