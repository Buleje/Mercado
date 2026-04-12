"use client";

import { useState, useCallback, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShoppingListItem {
  productId: number;
  name: string;
  qty: number;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingListItem[];
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "buleje_shopping_lists_v2";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadFromStorage(): ShoppingList[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShoppingList[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(lists: ShoppingList[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // silently fail if storage is full
  }
}

/**
 * Encode a shopping list into a shareable URL query string.
 * Format: ?list=base64(JSON({name, items}))
 */
export function encodeListForShare(list: ShoppingList): string {
  const payload = { name: list.name, items: list.items };
  const base64 = btoa(encodeURIComponent(JSON.stringify(payload)));
  return `?list=${base64}`;
}

/**
 * Decode a shared list from URL query params.
 */
export function decodeListFromUrl(searchParams: string): { name: string; items: ShoppingListItem[] } | null {
  try {
    const params = new URLSearchParams(searchParams);
    const encoded = params.get("list");
    if (!encoded) return null;
    const json = decodeURIComponent(atob(encoded));
    const parsed = JSON.parse(json) as { name: string; items: ShoppingListItem[] };
    if (!parsed.name || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useShoppingList() {
  const [lists, setLists] = useState<ShoppingList[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setLists(loadFromStorage());
  }, []);

  // Persist whenever lists change (skip initial empty)
  const persist = useCallback((updated: ShoppingList[]) => {
    setLists(updated);
    saveToStorage(updated);
  }, []);

  const createList = useCallback((name: string, items: ShoppingListItem[]): ShoppingList => {
    const newList: ShoppingList = {
      id: makeId(),
      name: name.trim() || "Mi lista",
      items,
      createdAt: new Date().toISOString(),
    };
    const updated = [newList, ...loadFromStorage()];
    persist(updated);
    return newList;
  }, [persist]);

  const deleteList = useCallback((id: string) => {
    const updated = loadFromStorage().filter((l) => l.id !== id);
    persist(updated);
  }, [persist]);

  const renameList = useCallback((id: string, name: string) => {
    const updated = loadFromStorage().map((l) =>
      l.id === id ? { ...l, name: name.trim() || l.name } : l,
    );
    persist(updated);
  }, [persist]);

  const updateItems = useCallback((id: string, items: ShoppingListItem[]) => {
    const updated = loadFromStorage().map((l) =>
      l.id === id ? { ...l, items } : l,
    );
    persist(updated);
  }, [persist]);

  const addItemToList = useCallback((listId: string, item: ShoppingListItem) => {
    const current = loadFromStorage();
    const updated = current.map((l) => {
      if (l.id !== listId) return l;
      const existing = l.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          ...l,
          items: l.items.map((i) =>
            i.productId === item.productId ? { ...i, qty: i.qty + item.qty } : i,
          ),
        };
      }
      return { ...l, items: [...l.items, item] };
    });
    persist(updated);
  }, [persist]);

  const removeItemFromList = useCallback((listId: string, productId: number) => {
    const current = loadFromStorage();
    const updated = current.map((l) =>
      l.id === listId ? { ...l, items: l.items.filter((i) => i.productId !== productId) } : l,
    );
    persist(updated);
  }, [persist]);

  const getShareUrl = useCallback((listId: string): string => {
    const list = loadFromStorage().find((l) => l.id === listId);
    if (!list) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/tienda${encodeListForShare(list)}`;
  }, []);

  return {
    lists,
    createList,
    deleteList,
    renameList,
    updateItems,
    addItemToList,
    removeItemFromList,
    getShareUrl,
  };
}
