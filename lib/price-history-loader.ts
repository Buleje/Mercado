"use client";

/**
 * price-history-loader.ts — patrón DataLoader para el sparkline de precios.
 *
 * Problema: PriceSparkline se renderiza por fila de producto y cada uno hacía
 * su propio `fetch(/api/price-history?productId=X)` → 84 productos = 84 requests
 * (N+1 en el cliente, ~72s acumulados). Perf 2026-05-29.
 *
 * Solución: `loadPriceHistory(id)` encola el id; en el próximo tick TODOS los ids
 * pedidos se baten en 1 sola request `?productIds=a,b,c` (el server resuelve con
 * UNA query `IN (...)`). Cache TTL 60s en memoria. 84 requests → 1.
 */

export type PricePoint = { date?: string; createdAt?: string; price: number };

const cache = new Map<number, { at: number; data: PricePoint[] }>();
const TTL = 60_000;

let queue = new Set<number>();
let waiters = new Map<number, Array<(v: PricePoint[]) => void>>();
let scheduled = false;

export function loadPriceHistory(productId: number): Promise<PricePoint[]> {
  const hit = cache.get(productId);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);

  return new Promise((resolve) => {
    queue.add(productId);
    let arr = waiters.get(productId);
    if (!arr) {
      arr = [];
      waiters.set(productId, arr);
    }
    arr.push(resolve);
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 0); // batea todo lo encolado en el mismo tick
    }
  });
}

async function flush() {
  scheduled = false;
  const ids = [...queue];
  queue = new Set();
  const w = waiters;
  waiters = new Map();
  if (ids.length === 0) return;

  // chunk de 150 para no exceder el largo de la URL
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));

  await Promise.all(
    chunks.map(async (chunk) => {
      const map = await fetchChunk(chunk);
      for (const id of chunk) {
        if (map) {
          const data = Array.isArray(map[id])
            ? map[id]
            : Array.isArray(map[String(id)])
              ? map[String(id)]
              : [];
          cache.set(id, { at: Date.now(), data });
          w.get(id)?.forEach((r) => r(data));
        } else {
          // Brandon 2026-06-01: el chunk falló incluso tras el retry (ej. 503
          // transitorio por saturación de pool/pgBouncer). Resolvemos vacío para
          // no colgar el render, pero NO cacheamos → el próximo render reintenta
          // en vez de quedar 60s pegado con un sparkline vacío.
          w.get(id)?.forEach((r) => r([]));
        }
      }
    }),
  );
}

/**
 * Pide un chunk con 1 reintento ante fallo transitorio (5xx o red caída).
 * El endpoint /api/price-history pega a Prisma; bajo ráfagas concurrentes el
 * pool puede devolver 503 momentáneo → un solo retry con back-off corto lo
 * resuelve sin propagar el error a la UI. Devuelve null si falla definitivamente.
 */
async function fetchChunk(
  chunk: number[],
): Promise<Record<string, PricePoint[]> | null> {
  const url = `/api/price-history?productIds=${chunk.join(",")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) return (await res.json()) as Record<string, PricePoint[]>;
      // 5xx transitorio → reintentar una vez; 4xx → no insistir.
      if (res.status >= 500 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      return null;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      return null;
    }
  }
  return null;
}
