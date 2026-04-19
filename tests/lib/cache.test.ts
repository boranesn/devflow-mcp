import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LRUCache } from "../../src/lib/cache.js";

describe("LRUCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves a value", () => {
    const cache = new LRUCache<string>();
    cache.set("key", "value", 60_000);
    expect(cache.get("key")).toBe("value");
  });

  it("returns undefined for missing key", () => {
    const cache = new LRUCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    const cache = new LRUCache<string>();
    cache.set("key", "value", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(cache.get("key")).toBeUndefined();
  });

  it("does not expire before TTL", () => {
    const cache = new LRUCache<string>();
    cache.set("key", "value", 5_000);
    vi.advanceTimersByTime(4_999);
    expect(cache.get("key")).toBe("value");
  });

  it("evicts LRU entry when at max capacity", () => {
    const cache = new LRUCache<number>(3);
    cache.set("a", 1, 60_000);
    cache.set("b", 2, 60_000);
    cache.set("c", 3, 60_000);
    // Access "a" to make it recently used
    cache.get("a");
    // Now "b" is LRU; adding "d" should evict "b"
    cache.set("d", 4, 60_000);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("tracks size correctly", () => {
    const cache = new LRUCache<number>();
    expect(cache.size).toBe(0);
    cache.set("a", 1, 60_000);
    expect(cache.size).toBe(1);
    cache.set("b", 2, 60_000);
    expect(cache.size).toBe(2);
  });

  it("deletes a specific entry", () => {
    const cache = new LRUCache<string>();
    cache.set("key", "value", 60_000);
    cache.delete("key");
    expect(cache.get("key")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("clears all entries", () => {
    const cache = new LRUCache<number>();
    cache.set("a", 1, 60_000);
    cache.set("b", 2, 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("overwrites an existing key without growing size", () => {
    const cache = new LRUCache<string>();
    cache.set("key", "v1", 60_000);
    cache.set("key", "v2", 60_000);
    expect(cache.get("key")).toBe("v2");
    expect(cache.size).toBe(1);
  });

  it("handles different TTLs independently", () => {
    const cache = new LRUCache<string>();
    cache.set("short", "a", 1_000);
    cache.set("long", "b", 10_000);
    vi.advanceTimersByTime(2_000);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("b");
  });
});
