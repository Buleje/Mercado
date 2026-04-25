"use client";

/**
 * useFollowedStores — TS-15 follow store hook.
 *
 * Persiste en localStorage (`followed-stores:v1`) los slugs de tiendas que el
 * cliente sigue. Multi-tab safe via `storage` event. Cuando exista push,
 * sincronizar contra `/api/marketplace/follow/[slug]`.
 *
 * Sprint 5 marketplace blueprint.
 */

import { useCallback, useEffect, useState } from "react";

const LS_KEY = "followed-stores:v1";

function readFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((s): s is string => typeof s === "string"));
    }
  } catch {
    // ignorar — quota / parse fail
  }
  return new Set();
}

function writeToStorage(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify([...set]));
  } catch {
    // ignorar
  }
}

export function useFollowedStores() {
  const [followed, setFollowed] = useState<Set<string>>(() => readFromStorage());

  // Cross-tab sync via storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY) return;
      setFollowed(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((slug: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      writeToStorage(next);
      return next;
    });
  }, []);

  const isFollowing = useCallback((slug: string) => followed.has(slug), [followed]);

  return { followed, toggle, isFollowing, count: followed.size };
}
