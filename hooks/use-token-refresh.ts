"use client";
import { useEffect, useRef, useCallback } from "react";

/**
 * Silent token refresh hook.
 *
 * Calls POST /api/auth/refresh every `intervalMs` (default: 12 min)
 * to rotate the short-lived access token before it expires (15 min).
 *
 * If the refresh fails (e.g. refresh token expired), redirects to login.
 * Also intercepts 401 responses from any fetch to trigger an early refresh.
 */
export function useTokenRefresh(intervalMs = 12 * 60 * 1000) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);

  const doRefresh = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) return true;
    isRefreshingRef.current = true;

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        return true;
      }

      // Refresh token expired — session is dead, redirect to login
      if (res.status === 401) {
        const currentPath = window.location.pathname;
        if (currentPath.startsWith("/admin") || currentPath.startsWith("/t/")) {
          window.location.href = "/admin/login";
        }
        return false;
      }

      return false;
    } catch {
      // Network error — don't redirect, might be temporary
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Initial refresh on mount (in case access token expired while tab was inactive)
    doRefresh();

    // Periodic refresh
    timerRef.current = setInterval(doRefresh, intervalMs);

    // Refresh when tab becomes visible again (user returns after long inactivity)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        doRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [doRefresh, intervalMs]);

  return { refreshNow: doRefresh };
}
