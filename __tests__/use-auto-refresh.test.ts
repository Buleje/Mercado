import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

describe("useAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return initial state", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useAutoRefresh({ intervalSeconds: 60, onRefresh })
    );
    expect(result.current.paused).toBe(false);
    expect(result.current.isActive).toBe(true);
    expect(result.current.secondsLeft).toBe(60);
  });

  it("should call onRefresh after interval", () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useAutoRefresh({ intervalSeconds: 10, onRefresh })
    );
    expect(onRefresh).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("should countdown every second", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useAutoRefresh({ intervalSeconds: 5, onRefresh })
    );
    expect(result.current.secondsLeft).toBe(5);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current.secondsLeft).toBe(4);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current.secondsLeft).toBe(3);
  });

  it("should not fire when disabled", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useAutoRefresh({ intervalSeconds: 5, onRefresh, enabled: false })
    );
    expect(result.current.isActive).toBe(false);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("should toggle pause", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useAutoRefresh({ intervalSeconds: 10, onRefresh })
    );
    expect(result.current.paused).toBe(false);
    act(() => { result.current.togglePause(); });
    expect(result.current.paused).toBe(true);
    expect(result.current.isActive).toBe(false);
    // Should not fire when paused
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("should refreshNow immediately and reset countdown", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useAutoRefresh({ intervalSeconds: 60, onRefresh })
    );
    act(() => { vi.advanceTimersByTime(5_000); });
    act(() => { result.current.refreshNow(); });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.secondsLeft).toBe(60);
  });

  it("should be inactive when intervalSeconds is 0", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useAutoRefresh({ intervalSeconds: 0, onRefresh })
    );
    expect(result.current.isActive).toBe(false);
  });
});
