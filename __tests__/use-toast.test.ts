import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToast, useToastStore, toast } from "@/hooks/use-toast";

// Mock timers
beforeEach(() => {
  vi.useFakeTimers();
  // Clear singleton toast store between tests
  toast.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useToast", () => {
  it("creates a success toast", () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.success("Success message");
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts).toHaveLength(1);
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "success",
      message: "Success message",
    });
  });

  it("creates an error toast with longer duration", () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error("Error message");
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts).toHaveLength(1);
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "error",
      message: "Error message",
      duration: 7000,
    });
  });

  it("creates a warning toast", () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.warning("Warning message");
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "warning",
      message: "Warning message",
    });
  });

  it("creates an info toast", () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.info("Info message");
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "info",
      message: "Info message",
    });
  });

  it("adds toast with custom options", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.success("Message", {
        title: "Custom Title",
        duration: 3000,
        dismissible: false,
        onDismiss,
      });
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "success",
      message: "Message",
      title: "Custom Title",
      duration: 3000,
      dismissible: false,
    });
  });

  it("adds toast with action button", () => {
    const action = vi.fn();
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error("Error", {
        action: {
          label: "Retry",
          onClick: action,
        },
      });
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts[0].action).toEqual({
      label: "Retry",
      onClick: action,
    });
  });

  it("auto-dismisses toast after duration", async () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.success("Auto dismiss", { duration: 2000 });
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts).toHaveLength(1);
    
    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    
    expect(storeResult.current.toasts).toHaveLength(0);
  });

  it("does not auto-dismiss when duration is 0", async () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.info("Persistent", { duration: 0 });
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts).toHaveLength(1);
    
    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    
    // Should still be there
    expect(storeResult.current.toasts).toHaveLength(1);
  });

  it("removes a specific toast", () => {
    const { result } = renderHook(() => useToast());
    
    let id: string;
    act(() => {
      id = result.current.success("Toast 1");
      result.current.success("Toast 2");
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts).toHaveLength(2);
    
    act(() => {
      result.current.remove(id);
    });
    
    expect(storeResult.current.toasts).toHaveLength(1);
    expect(storeResult.current.toasts[0].message).toBe("Toast 2");
  });

  it("clears all toasts", () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.success("Toast 1");
      result.current.error("Toast 2");
      result.current.warning("Toast 3");
    });
    
    const { result: storeResult } = renderHook(() => useToastStore());
    
    expect(storeResult.current.toasts).toHaveLength(3);
    
    act(() => {
      result.current.clear();
    });
    
    expect(storeResult.current.toasts).toHaveLength(0);
  });

  it("calls onDismiss when toast is auto-dismissed", async () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.success("Message", {
        duration: 1000,
        onDismiss,
      });
    });
    
    expect(onDismiss).not.toHaveBeenCalled();
    
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when toast is manually removed", () => {
    const onDismiss = vi.fn();
    const { result } = renderHook(() => useToast());
    
    let id: string;
    act(() => {
      id = result.current.success("Message", { onDismiss, duration: 0 });
    });
    
    expect(onDismiss).not.toHaveBeenCalled();
    
    act(() => {
      result.current.remove(id);
    });
    
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("useToast.promise", () => {
  it("shows loading, then success on promise resolve", async () => {
    const { result } = renderHook(() => useToast());
    const { result: storeResult } = renderHook(() => useToastStore());

    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("Success!"), 100);
    });

    let promiseResult: Promise<string>;
    act(() => {
      promiseResult = result.current.promise(promise, {
        loading: "Loading...",
        success: "Done!",
        error: "Failed!",
      });
    });

    // Should show loading toast
    expect(storeResult.current.toasts).toHaveLength(1);
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "info",
      message: "Loading...",
      duration: 0,
      dismissible: false,
    });

    // Advance timers to resolve the promise
    await act(async () => {
      vi.advanceTimersByTime(100);
      await promiseResult;
    });

    // Should show success toast
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "success",
      message: "Done!",
    });
  });

  it("shows loading, then error on promise reject", async () => {
    const { result } = renderHook(() => useToast());
    const { result: storeResult } = renderHook(() => useToastStore());

    const promise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Failed")), 100);
    });

    let promiseResult: Promise<unknown>;
    act(() => {
      promiseResult = result.current.promise(promise, {
        loading: "Loading...",
        success: "Done!",
        error: "Failed!",
      });
    });

    // Should show loading toast
    expect(storeResult.current.toasts[0].type).toBe("info");

    // Advance timers to reject the promise
    await act(async () => {
      vi.advanceTimersByTime(100);
      try {
        await promiseResult;
      } catch {
        // Expected
      }
    });

    // Should show error toast
    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "error",
      message: "Failed!",
    });
  });

  it("supports function messages", async () => {
    const { result } = renderHook(() => useToast());
    const { result: storeResult } = renderHook(() => useToastStore());

    const promise = Promise.resolve({ name: "John" });

    await act(async () => {
      await result.current.promise(promise, {
        loading: "Loading...",
        success: (data) => `Welcome, ${data.name}!`,
        error: "Failed!",
      });
    });

    expect(storeResult.current.toasts[0]).toMatchObject({
      type: "success",
      message: "Welcome, John!",
    });
  });
});

describe("standalone toast functions", () => {
  it("toast.success() works without hook", () => {
    toast.clear();
    toast.success("Standalone success");

    const { result } = renderHook(() => useToastStore());

    const match = result.current.toasts.find(t => t.message === "Standalone success");
    expect(match).toBeDefined();
    expect(match?.type).toBe("success");
  });

  it("toast.error() works without hook", () => {
    toast.clear();
    toast.error("Standalone error");

    const { result } = renderHook(() => useToastStore());

    const match = result.current.toasts.find(t => t.message === "Standalone error");
    expect(match).toBeDefined();
    expect(match?.type).toBe("error");
  });

  it("toast.promise() works without hook", async () => {
    toast.clear();
    const { result } = renderHook(() => useToastStore());

    const promise = Promise.resolve("done");

    await act(async () => {
      await toast.promise(promise, {
        loading: "Loading...",
        success: "Success!",
        error: "Error!",
      });
    });

    const match = result.current.toasts.find(t => t.message === "Success!");
    expect(match).toBeDefined();
    expect(match?.type).toBe("success");
  });
});
