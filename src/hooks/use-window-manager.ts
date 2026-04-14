/**
 * Window Manager Hook
 *
 * Manages the floating window state machine: open, close, focus, z-index.
 * Extracted from dashboard-shell.tsx to isolate window lifecycle from rendering.
 */

import { useState, useCallback } from "react";
import type { WindowState } from "@/lib/navigation";

export interface WindowManager {
  openWindows: WindowState[];
  addWindow: (win: Omit<WindowState, "zIndex">) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  /** Alias for addWindow — semantic name for navigation call sites */
  navigate: (win: Omit<WindowState, "zIndex">) => void;
}

export function useWindowManager(): WindowManager {
  const [openWindows, setOpenWindows] = useState<WindowState[]>([]);
  // Start above typical z-index values
  const [nextZ, setNextZ] = useState(9000);

  const addWindow = useCallback(
    (win: Omit<WindowState, "zIndex">) => {
      setOpenWindows((prev) => {
        const existing = prev.find((w) => w.id === win.id);
        if (existing) {
          return prev.map((w) =>
            w.id === win.id ? { ...w, zIndex: nextZ } : w
          );
        }
        return [...prev, { ...win, zIndex: nextZ }];
      });
      setNextZ((z) => z + 1);
    },
    [nextZ]
  );

  const closeWindow = useCallback((id: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const focusWindow = useCallback(
    (id: string) => {
      setOpenWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, zIndex: nextZ } : w))
      );
      setNextZ((z) => z + 1);
    },
    [nextZ]
  );

  const navigate = useCallback(
    (win: Omit<WindowState, "zIndex">) => addWindow(win),
    [addWindow]
  );

  return { openWindows, addWindow, closeWindow, focusWindow, navigate };
}
