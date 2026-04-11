/**
 * Layout Configuration
 *
 * All visual/spatial constants in one place. Components import from here
 * instead of hardcoding sizes, positions, and spacing.
 *
 * Colours and fonts are in globals.css (CSS custom properties) — that's
 * the right layer for them. This file handles geometry and typography scale.
 */

export type WindowRole = "search" | "detail" | "property" | "form" | "ai" | "calendar" | "wizard";

export const layout = {
  /** Sidebar */
  sidebar: {
    /** Width in Tailwind units (w-56 = 14rem = 224px) */
    widthClass: "w-56",
    /** Width in pixels (for position calculations) */
    widthPx: 224,
  },

  /** Floating windows */
  window: {
    /** Pixel offset between cascading windows */
    cascadeOffset: 30,
    /** Minimum window size */
    minSize: { width: 360, height: 300 },
    /** Screen edge padding (prevent windows going off-screen) */
    edgePadding: 40,
    /** Title bar height in pixels */
    titleBarHeight: 40,

    /** Default sizes per window role */
    sizes: {
      search:   { width: 400, height: 520 },
      detail:   { width: 380, height: 540 },
      property: { width: 440, height: 500 },
      form:     { width: 520, height: 640 },
      ai:       { width: 420, height: 520 },
    },

    /** Base positions per window role (before cascade offset) */
    positions: {
      search:   { x: 260, y: 50 },
      detail:   { x: 340, y: 50 },
      property: { x: 420, y: 60 },
      form:     { x: 300, y: 40 },
      ai:       { x: 280, y: 60 },
    },
  },

  /** Typography scale (Tailwind classes) */
  text: {
    /** Entity name in sidebar */
    sidebarItem: "text-sm",
    /** Window title */
    windowTitle: "text-sm font-medium",
    /** Field labels in detail/form views */
    fieldLabel: "text-[10px] font-medium text-muted-foreground uppercase tracking-wider",
    /** Field values */
    fieldValue: "text-sm",
    /** List item title */
    listTitle: "text-sm font-medium",
    /** List item subtitle */
    listSubtitle: "text-xs text-muted-foreground",
    /** Badge (enum values, status) */
    badge: "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
    /** Count indicators */
    count: "text-xs text-muted-foreground",
    /** Empty state message */
    empty: "text-sm text-muted-foreground",
  },

  /** Spacing (Tailwind classes) */
  spacing: {
    /** Padding inside panels */
    panelPadding: "p-3",
    /** Gap between list items */
    listItemPadding: "px-3 py-2.5",
    /** Section border */
    sectionBorder: "border-b border-floating-border",
  },
} as const;

/** Calculate cascaded position for the i-th window of a given role */
export function windowPosition(
  role: keyof typeof layout.window.positions,
  index: number
): { x: number; y: number } {
  const base = layout.window.positions[role];
  const offset = layout.window.cascadeOffset;
  return {
    x: base.x + index * offset,
    y: base.y + index * offset,
  };
}
