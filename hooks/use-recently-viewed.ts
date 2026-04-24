"use client";

/**
 * useRecentlyViewed — Tracker de productos vistos recientemente.
 *
 * Persiste en localStorage. Lista max 20 items, FIFO, con TTL 7 días.
 * Deduplica por id: ver el mismo producto lo mueve al top.
 *
 * API:
 *   const { items, track, clear, remove } = useRecentlyViewed();
 *   track({ id, storeProductId, name, price, image, url, unit });
 *
 * Cross-tab sync: escucha storage event para actualizar en todas las tabs.
 */

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "buleje-recently-viewed-v1";
const MAX_ITEMS = 20;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export interface RecentlyViewedItem {
  id: number | string;
  storeProductId?: string;
  name: string;
  price: number;
  image?: string | null;
  url: string;
  unit?: string | null;
  viewedAt: number;
}

function readStorage(): RecentlyViewedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentlyViewedItem[];
    const now = Date.now();
    return parsed.filter((i) => now - i.viewedAt < TTL_MS).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeStorage(items: RecentlyViewedItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* silent — quota full */
  }
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  // Cargar al mount
  useEffect(() => {
    setItems(readStorage());
  }, []);

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const track = useCallback((item: Omit<RecentlyViewedItem, "viewedAt">) => {
    setItems((prev) => {
      const without = prev.filter((i) => String(i.id) !== String(item.id));
      const next = [{ ...item, viewedAt: Date.now() }, ...without].slice(0, MAX_ITEMS);
      writeStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string | number) => {
    setItems((prev) => {
      const next = prev.filter((i) => String(i.id) !== String(id));
      writeStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    writeStorage([]);
    setItems([]);
  }, []);

  return { items, track, remove, clear };
}
