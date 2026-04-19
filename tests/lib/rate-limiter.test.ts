import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../../src/lib/rate-limiter.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows immediate acquisition when tokens are available", async () => {
    const limiter = new RateLimiter(5, 1000);
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(10);
  });

  it("reports correct capacity", () => {
    const limiter = new RateLimiter(10, 1000);
    expect(limiter.capacity).toBe(10);
  });

  it("reports available tokens decreasing after acquisition", async () => {
    const limiter = new RateLimiter(5, 1000);
    expect(limiter.available).toBe(5);
    await limiter.acquire();
    expect(limiter.available).toBe(4);
    await limiter.acquire();
    expect(limiter.available).toBe(3);
  });

  it("refills tokens over time", async () => {
    const limiter = new RateLimiter(10, 1000); // 10 tokens per second

    // Drain all tokens
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }
    expect(limiter.available).toBe(0);

    // Advance time by 500ms — should refill 5 tokens
    vi.advanceTimersByTime(500);
    expect(limiter.available).toBeGreaterThanOrEqual(4);
  });

  it("does not exceed max tokens after refill", async () => {
    const limiter = new RateLimiter(5, 1000);
    await limiter.acquire(); // use 1

    vi.advanceTimersByTime(5000); // advance 5 seconds
    expect(limiter.available).toBe(5); // capped at max
  });

  it("waits when tokens are exhausted", async () => {
    const limiter = new RateLimiter(2, 1000); // 2 tokens per second
    await limiter.acquire();
    await limiter.acquire(); // exhausted

    // The next acquire should schedule a setTimeout
    const acquirePromise = limiter.acquire();

    // Advance timer to trigger the scheduled setTimeout
    vi.advanceTimersByTime(1000);

    await acquirePromise; // should resolve after time advances
  });

  it("handles multiple rapid acquisitions correctly", async () => {
    const limiter = new RateLimiter(3, 1000);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.available).toBe(0);
  });

  it("starts with full token bucket", () => {
    const limiter = new RateLimiter(20, 60000);
    expect(limiter.available).toBe(20);
  });
});
