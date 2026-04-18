/**
 * lib/lives/client — shim de migración gradual para Live Sessions.
 *
 * Intenta fetchear desde `/api/lives/*` (DB real Prisma). Si falla
 * (migration no aplicada, network, etc.), cae a mock en `lib/mocks/lives.mock`.
 * Permite que la UI funcione antes/después de `prisma migrate deploy`.
 */

import {
  LIVES_MOCK,
  type LiveSession as MockLive,
  getLiveNow,
  getUpcomingLives,
  getLiveById as getMockLiveById,
} from "@/lib/mocks/lives.mock";

function getMockActiveLives(): MockLive[] {
  const active: MockLive[] = [];
  const now = getLiveNow();
  if (now) active.push(now);
  active.push(...getUpcomingLives());
  return active;
}

type DbLive = {
  id: string;
  slug?: string;
  tenantId?: string;
  title: string;
  description?: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled" | "upcoming" | "past";
  scheduledFor?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  thumbnail?: string;
  storeSlug?: string;
  storeName?: string;
  category?: string;
  categoryChips?: string[];
  viewersPeak?: number;
  viewersAvg?: number;
  viewers?: number;
  products?: unknown[];
  chat?: unknown[];
};

function isMockLive(src: unknown): src is MockLive {
  if (!src || typeof src !== "object") return false;
  return "startsAt" in src && "thumbnail" in src && "category" in src;
}

/** Convierte payload DB a la shape legacy UI (MockLive). */
export function toUiLive(src: DbLive | MockLive): MockLive {
  if (isMockLive(src)) return src;
  const db = src as DbLive;
  const mappedStatus: MockLive["status"] =
    db.status === "live"
      ? "live"
      : db.status === "scheduled" || db.status === "upcoming"
        ? "upcoming"
        : "past";
  return {
    id: db.id,
    slug: db.slug ?? db.id,
    title: db.title,
    description: db.description ?? "",
    status: mappedStatus,
    category: db.category ?? db.categoryChips?.[0] ?? "general",
    storeName: db.storeName ?? "Buleje",
    storeSlug: db.storeSlug ?? "buleje",
    thumbnail: db.thumbnail ?? db.thumbnailUrl ?? "",
    startsAt:
      db.startedAt ?? db.scheduledFor ?? new Date().toISOString(),
    durationMin: db.durationSeconds ? Math.round(db.durationSeconds / 60) : undefined,
    viewers: db.viewers ?? db.viewersPeak ?? db.viewersAvg ?? 0,
    products: (db.products as MockLive["products"]) ?? [],
    chat: (db.chat as MockLive["chat"]) ?? [],
  };
}

/** Fetch lives activos — intenta DB, fallback a mock. */
export async function fetchActiveLives(): Promise<MockLive[]> {
  try {
    const res = await fetch("/api/lives/active", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { lives?: DbLive[] };
    if (!Array.isArray(data?.lives) || data.lives.length === 0) {
      return getMockActiveLives();
    }
    return data.lives.map(toUiLive);
  } catch {
    return getMockActiveLives();
  }
}

/** Fetch live por id — intenta DB, fallback a mock. */
export async function fetchLiveById(id: string): Promise<MockLive | null> {
  try {
    const res = await fetch(`/api/lives/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { live?: DbLive };
    if (!data?.live) return getMockLiveById(id);
    return toUiLive(data.live);
  } catch {
    return getMockLiveById(id);
  }
}

/** Resolve server-side — solo mock por ahora, hook para DB futuro. */
export async function resolveLive(id: string): Promise<MockLive | null> {
  return getMockLiveById(id) ?? LIVES_MOCK.find((l) => l.id === id || l.slug === id) ?? null;
}
