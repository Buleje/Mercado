"use client";

/* ── POS Offline Sale Queue ─────────────────────────────────────────
 * Stores pending sales in IndexedDB when offline.
 * Syncs automatically when connection is restored.
 * ──────────────────────────────────────────────────────────────────── */

const DB_NAME = "buleje-pos-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-sales";

interface PendingSale {
  id: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(payload: Record<string, unknown>): Promise<string> {
  const db = await openDB();
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: PendingSale = { id, payload, createdAt: new Date().toISOString(), retries: 0 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll(): Promise<PendingSale[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function incrementRetry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as PendingSale | undefined;
      if (entry) {
        entry.retries += 1;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const MAX_RETRIES = 5;

/** Sync all pending sales. Returns count of successfully synced sales. */
export async function syncPendingSales(): Promise<number> {
  const pending = await getAll();
  let synced = 0;

  // Audit 2026-05-17 07-P1-1: agregar CSRF headers al sync offline.
  // Antes, syncPendingSales hacía POST /api/sales SIN x-csrf-token,
  // mientras que useCSRF + usePOSOffline SÍ lo enviaban — endpoint
  // rechazaba el resync con 403 por inconsistencia. Ahora delegamos
  // al helper csrfHeaders del cliente (lib/csrf-client.ts) que lee la
  // cookie csrf-token y la replica como header (double-submit).
  // Import dinámico porque el module se carga también en SW context.
  let csrfHeadersFn: ((extra?: HeadersInit) => HeadersInit) | null = null;
  try {
    const mod = await import("@/lib/csrf-client");
    csrfHeadersFn = mod.csrfHeaders;
  } catch {
    // SW context o csrf-client no disponible — degrade gracefully
  }

  for (const sale of pending) {
    if (sale.retries >= MAX_RETRIES) continue; // skip dead-letter entries
    try {
      const headers: HeadersInit = csrfHeadersFn
        ? csrfHeadersFn({ "Content-Type": "application/json" })
        : { "Content-Type": "application/json" };
      const res = await fetch("/api/sales", {
        method: "POST",
        headers,
        body: JSON.stringify(sale.payload),
      });
      if (res.ok) {
        await remove(sale.id);
        synced++;
      } else {
        await incrementRetry(sale.id);
      }
    } catch {
      await incrementRetry(sale.id);
    }
  }
  return synced;
}

export async function pendingCount(): Promise<number> {
  const all = await getAll();
  return all.length;
}
