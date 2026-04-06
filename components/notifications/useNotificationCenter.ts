"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type NotificationItem = {
  id: string;
  tenantId: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  body: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationFilter = "all" | "unread" | "high";

const API_BASE = "/api/notification-center";
const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter === "unread") params.set("unread", "true");
      if (filter === "high") params.set("severity", "HIGH");

      const res = await fetch(`${API_BASE}?${params.toString()}`);
      if (!res.ok) return;

      const data: NotificationItem[] = await res.json();
      const headerCount = res.headers.get("X-Unread-Count");

      setNotifications(data);
      setUnreadCount(headerCount ? parseInt(headerCount, 10) : data.filter((n) => !n.readAt).length);
    } catch {
      // silently fail — will retry on next poll
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();

    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await fetch(`${API_BASE}/${id}/read`, { method: "PATCH" });
      } catch {
        // Revert on failure
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await fetch(`${API_BASE}/read-all`, { method: "PATCH" });
    } catch {
      // Revert on failure
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    refetch,
  };
}
