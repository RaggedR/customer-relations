"use client";

import { ThemeToggle } from "@/components/theme-toggle";

interface TopBarProps {
  title?: string;
}

export function TopBar({ title = "Customer Relations" }: TopBarProps) {
  return (
    <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-background">
      <h1 className="text-sm font-semibold">{title}</h1>
      <ThemeToggle />
    </header>
  );
}
