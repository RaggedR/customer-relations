"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { layout } from "@/lib/layout";

interface FloatingWindowProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  zIndex?: number;
  onFocus?: () => void;
}

export function FloatingWindow({
  title,
  children,
  onClose,
  defaultPosition = layout.window.positions.search,
  defaultSize = layout.window.sizes.search,
  minSize = layout.window.minSize,
  zIndex = 100,
  onFocus,
}: FloatingWindowProps) {
  const edge = layout.window.edgePadding;
  const [size, setSize] = useState(() => {
    if (typeof window === "undefined") return defaultSize;
    return {
      width: Math.min(defaultSize.width, window.innerWidth - edge),
      height: Math.min(defaultSize.height, window.innerHeight - edge),
    };
  });
  const [position, setPosition] = useState(() => {
    if (typeof window === "undefined") return defaultPosition;
    const w = Math.min(defaultSize.width, window.innerWidth - edge);
    const h = Math.min(defaultSize.height, window.innerHeight - edge);
    return {
      x: Math.max(0, Math.min(defaultPosition.x, window.innerWidth - w - 10)),
      y: Math.max(0, Math.min(defaultPosition.y, window.innerHeight - h - 10)),
    };
  });

  const [minimized, setMinimized] = useState(false);

  const dragging = useRef(false);
  const resizing = useRef(false);
  const resizeEdge = useRef("");
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ w: 0, h: 0 });

  function onDragStart(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    onFocus?.();
    dragging.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startPos.current = { x: position.x, y: position.y };
  }

  function onResizeStart(e: React.MouseEvent, edge: string) {
    e.preventDefault();
    e.stopPropagation();
    onFocus?.();
    resizing.current = true;
    resizeEdge.current = edge;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startSize.current = { w: size.width, h: size.height };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging.current) {
        const dx = e.clientX - startMouse.current.x;
        const dy = e.clientY - startMouse.current.y;
        setPosition((prev) => ({
          x: Math.max(0, Math.min(startPos.current.x + dx, window.innerWidth - size.width)),
          y: Math.max(0, Math.min(startPos.current.y + dy, window.innerHeight - size.height)),
        }));
      }
      if (resizing.current) {
        const dx = e.clientX - startMouse.current.x;
        const dy = e.clientY - startMouse.current.y;
        const edge = resizeEdge.current;
        setSize((prev) => ({
          width: Math.max(minSize.width, Math.min(
            edge.includes("e") ? startSize.current.w + dx : startSize.current.w,
            window.innerWidth - position.x
          )),
          height: Math.max(minSize.height, Math.min(
            edge.includes("s") ? startSize.current.h + dy : startSize.current.h,
            window.innerHeight - position.y
          )),
        }));
      }
    }

    function onMouseUp() {
      dragging.current = false;
      resizing.current = false;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [minSize]);

  return createPortal(
    <div
      className="fixed rounded-lg border border-floating-border bg-floating text-floating-foreground shadow-xl flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: minimized ? 240 : size.width,
        height: minimized ? 40 : size.height,
        zIndex,
      }}
      onMouseDown={() => onFocus?.()}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between h-10 px-3 bg-floating-muted border-b border-floating-border cursor-grab active:cursor-grabbing select-none shrink-0"
        onMouseDown={onDragStart}
      >
        <span className="text-sm font-medium capitalize truncate">{title}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setMinimized((m) => !m)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {minimized ? (
                <polyline points="15 3 21 3 21 9" />
              ) : (
                <line x1="5" y1="12" x2="19" y2="12" />
              )}
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Content */}
      {!minimized && (
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      )}

      {/* Resize handles */}
      {!minimized && (
        <>
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
            onMouseDown={(e) => onResizeStart(e, "se")}
          />
          <div
            className="absolute bottom-0 left-0 right-3 h-1 cursor-s-resize"
            onMouseDown={(e) => onResizeStart(e, "s")}
          />
          <div
            className="absolute top-10 right-0 bottom-3 w-1 cursor-e-resize"
            onMouseDown={(e) => onResizeStart(e, "e")}
          />
        </>
      )}
    </div>,
    document.body
  );
}
