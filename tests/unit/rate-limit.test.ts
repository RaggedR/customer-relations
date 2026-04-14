import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = createRateLimiter(3, 1000);
    expect(limiter("user1").allowed).toBe(true);
    expect(limiter("user1").allowed).toBe(true);
    expect(limiter("user1").allowed).toBe(true);
  });

  it("rejects requests exceeding the limit", () => {
    const limiter = createRateLimiter(3, 1000);
    limiter("user1");
    limiter("user1");
    limiter("user1");
    const result = limiter("user1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const limiter = createRateLimiter(2, 1000);
    limiter("user1");
    limiter("user1");
    expect(limiter("user1").allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1000);
    const result = limiter("user1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("tracks different keys independently", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter("user1").allowed).toBe(true);
    expect(limiter("user1").allowed).toBe(false);
    // Different key — fresh window
    expect(limiter("user2").allowed).toBe(true);
  });

  it("decrements remaining correctly", () => {
    const limiter = createRateLimiter(5, 1000);
    expect(limiter("k").remaining).toBe(4);
    expect(limiter("k").remaining).toBe(3);
    expect(limiter("k").remaining).toBe(2);
    expect(limiter("k").remaining).toBe(1);
    expect(limiter("k").remaining).toBe(0);
  });

  it("reports resetMs as windowStart + windowMs", () => {
    const limiter = createRateLimiter(10, 60_000);
    const now = Date.now();
    const result = limiter("user1");
    expect(result.resetMs).toBe(now + 60_000);
  });
});
