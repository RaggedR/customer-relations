"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Linkify } from "@/components/linkify";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  chart?: ChartConfig | null;
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

export interface ChartConfig {
  type: "bar" | "pie";
  title: string;
  data: { label: string; value: number }[];
}

interface AiChatPanelProps {
  onChartGenerated: (chart: ChartConfig) => void;
}

export function AiChatPanel({ onChartGenerated }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSql, setShowSql] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || "Something went wrong",
            sql: data.sql,
          },
        ]);
        return;
      }

      const msg: ChatMessage = {
        role: "assistant",
        content: data.answer,
        sql: data.sql,
        chart: data.chart,
        rows: data.rows,
        rowCount: data.rowCount,
      };

      setMessages((prev) => [...prev, msg]);

      if (data.chart) {
        onChartGenerated(data.chart);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">
            Ask anything about your patients, nurses, or clinical data.
            <br />
            <span className="text-[10px] mt-1 block opacity-70">
              e.g. &quot;Are any maintenance plans expiring soon?&quot;
            </span>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm max-w-[85%]"
                  : "text-sm space-y-1.5 max-w-[95%]"
              }
            >
              <p className="whitespace-pre-wrap"><Linkify>{msg.content}</Linkify></p>

              {msg.role === "assistant" && msg.sql && (
                <button
                  onClick={() => setShowSql(showSql === i ? null : i)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSql === i ? "Hide SQL" : "Show SQL"}
                </button>
              )}

              {showSql === i && msg.sql && (
                <pre className="text-[10px] bg-floating-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                  {msg.sql}
                </pre>
              )}

              {msg.role === "assistant" && msg.rowCount != null && (
                <span className="text-[10px] text-muted-foreground">
                  {msg.rowCount} row{msg.rowCount !== 1 ? "s" : ""} returned
                </span>
              )}

              {msg.role === "assistant" && msg.chart && (
                <button
                  onClick={() => onChartGenerated(msg.chart!)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors block"
                >
                  Show chart again
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-xs text-muted-foreground animate-pulse">
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-floating-border flex gap-1.5 shrink-0"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your data..."
          className="h-8 text-sm flex-1"
        />
        <Button type="submit" size="sm" disabled={loading || !input.trim()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </Button>
      </form>
    </div>
  );
}
