"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationCenter } from "./useNotificationCenter";
import NotificationPanel from "./NotificationPanel";

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    isLoading,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    refetch,
  } = useNotificationCenter();

  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(unreadCount);

  // Pulse animation when unreadCount changes (increases)
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setPulse(true);
      const timeout = setTimeout(() => setPulse(false), 2000);
      return () => clearTimeout(timeout);
    }
    prevCount.current = unreadCount;
  }, [unreadCount]);

  // Keyboard shortcut: "N" opens panel (when no input is focused)
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (e.key === "n" || e.key === "N") {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  const toggle = () => setOpen((prev) => !prev);

  return (
    <>
      <button
        onClick={toggle}
        title={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""} — tecla N`}
        className={cn(
          "relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
          open
            ? "bg-primary/10 text-primary"
            : "text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent hover:text-primary"
        )}
      >
        <Bell className={cn("h-4 w-4", pulse && "animate-bounce")} />
        {/* Badge */}
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1 shadow-sm",
              pulse && "animate-pulse"
            )}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        isLoading={isLoading}
        filter={filter}
        setFilter={setFilter}
        markAsRead={markAsRead}
        markAllRead={markAllRead}
        refetch={refetch}
      />
    </>
  );
}
