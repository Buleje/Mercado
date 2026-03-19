"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { dispatchAppEvent } from "@/lib/events";

/**
 * Reads `?q=` from URL and dispatches it as searchProduct event
 * so ProductCatalog auto-fills the search field on mount.
 */
export function SearchTrigger() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  useEffect(() => {
    if (q.trim()) {
      // Small delay to ensure ProductCatalog is mounted and listening
      const timer = setTimeout(() => {
        dispatchAppEvent("searchProduct", { query: q.trim() });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [q]);

  return null;
}
