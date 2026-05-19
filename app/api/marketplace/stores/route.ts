
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

// Brandon 2026-05-18 perf P1 #8: server-side cache para el listado público
// de tiendas. Antes solo había `Cache-Control` (cliente/CDN); ahora la query
// + el enriquecimiento (manualStoreZones, $queryRawUnsafe de cover/hoursJson,
// settings, promo groupby, store-extras, construction map) se cachea 60s en
// memoria con `getOrSet`. Patrón canónico del repo (lib/cache.ts) — invalida
// vía `invalidateByPrefix("marketplace:stores")` ya presente en POST/PUT.
const PUBLIC_STORES_TTL_SEC = 60;

const QuerySchema = z.object({
  zone:     z.string().optional(),
  category: z.string().optional(),
  search:   z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  my:       z.string().optional(),
});

type TrustLevel = "alta" | "media" | "nueva";

/**
/**
 * Resolve tenantId → ensure the Tenant record exists and return
 * both the canonical CUID id and the slug. Queries on other tables
 * may use either value (legacy data used the slug "main").
 */
async function ensureTenant(tenantId: string): Promise<{ id: string; slug: string; possibleIds: string[] }> {
  // 1+2. Try by id OR slug en 1 sola query (perf DB-H5 audit 2026-05-19).
  // tenantId puede ser CUID (id) o el slug legacy "main".
  const existing = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: { id: true, slug: true },
  });
  if (existing) return { id: existing.id, slug: existing.slug, possibleIds: [existing.id, existing.slug] };

  // 3. Tenant doesn't exist — auto-create from Settings if available
  const settings = await prisma.settings.findUnique({ where: { tenantId } }).catch((err) => { logger.error("[marketplace/stores] DB query failed", { error: String(err), tenantId }); return null; });
  const tenant = await prisma.tenant.create({
    data: {
      slug:   tenantId,
      name:   settings?.businessName || tenantId,
      plan:   "free",
      active: true,
    },
  });
  logger.info("[ensureTenant] Auto-created tenant", { tenantId: tenant.id, slug: tenant.slug });
  return { id: tenant.id, slug: tenant.slug, possibleIds: [tenant.id, tenant.slug] };
}

/**
 * GET /api/marketplace/stores
 * Sin ?my=true → listado público de tiendas publicadas
 * Con ?my=true → retorna la tienda del admin autenticado (para el panel admin)
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { zone, category, search, limit, my } = parsed.data;

    // ── Admin mode: retornar "mi tienda" ──
    if (my === "true") {
      const auth = await requireAdmin(req, ["admin", "manager"]);
      if (auth instanceof NextResponse) return auth;

      const tenant = await ensureTenant(auth.tenantId);

      let store = null;
      try {
        store = await prisma.store.findFirst({
          where: { tenantId: { in: tenant.possibleIds } },
        });
      } catch {
        // Store table may not exist yet — return empty
        return NextResponse.json({});
      }

      if (!store) {
        return NextResponse.json({});
      }

      // Read hoursJson via raw query — column added 2026-05 (expand fase) y
      // todavia no esta declarada en schema.prisma. Usar el id resuelto arriba.
      let hoursJson: unknown = null;
      try {
        const rows = await prisma.$queryRaw<Array<{ hoursJson: unknown }>>`
          SELECT "hoursJson" FROM "Store" WHERE id = ${store.id} LIMIT 1
        `;
        hoursJson = rows[0]?.hoursJson ?? null;
      } catch {
        hoursJson = null;
      }

      // Cargar extras (subcategory, coverageZones, customCategories) — JSON
      // storage paralelo a Store. Forma parte del payload "mi tienda" para
      // que el admin pueda editar todo en un solo viaje.
      let extras = { subcategory: null as string | null, coverageZones: [] as string[], customCategories: [] as unknown[] };
      try {
        const { getStoreExtras } = await import("@/lib/store-extras");
        const e = await getStoreExtras(store.slug);
        extras = {
          subcategory: e.subcategory,
          coverageZones: e.coverageZones,
          customCategories: e.customCategories,
        };
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        id:              store.id,
        slug:            store.slug,
        name:            store.name,
        description:     store.description ?? "",
        logoUrl:         store.logo ?? "",
        category:        store.category,
        zone:            store.zone ?? "",
        commissionRate:  store.commission,
        isActive:        store.isPublished,
        vacationMode:    store.vacationMode,
        vacationMessage: store.vacationMessage ?? "",
        hours:           hoursJson,
        subcategory:     extras.subcategory,
        coverageZones:   extras.coverageZones,
        customCategories: extras.customCategories,
      });
    }

    // ── Public mode: listado de tiendas ──
    // Brandon 2026-05-18 perf P1 #8: TODO el listado público se cachea en
    // memoria con key derivado de los params. Hits subsecuentes a la misma
    // URL no tocan ni Prisma ni FS. Invalida con `invalidateByPrefix
    // ("marketplace:stores")` desde POST/PUT.
    const cacheKey = `marketplace:stores:public:${zone ?? ""}:${category ?? ""}:${search ?? ""}:${limit}`;
    const cached = await getOrSet<{ data: unknown[]; total: number }>(
      cacheKey,
      PUBLIC_STORES_TTL_SEC,
      async () => {
    // Cargar el archivo de categorías del marketplace para:
    //   1. Sumar tiendas vinculadas manualmente desde superadmin (linkedStoreSlugs).
    //   2. Aplicar override de zona manual si la tienda no la fija.
    let manualCategoryStoreSlugs: string[] = [];
    let manualStoreZones: Record<string, string> = {};
    // Slugs cuya `coverageZones` (multi-zona en store-extras.json) incluye
    // el filtro pedido — los unimos al OR del where para que /tiendas pueda
    // filtrar por cualquier zona declarada como cobertura, no solo `Store.zone`.
    let coverageZoneSlugs: string[] = [];
    if (zone) {
      try {
        const { readFile: rf } = await import("node:fs/promises");
        const { join: jn } = await import("node:path");
        const rawExtras = await rf(
          jn(process.cwd(), "lib", "data", "store-extras.json"),
          "utf8",
        ).catch(() => "{}");
        const all = JSON.parse(rawExtras) as Record<string, { coverageZones?: string[] }>;
        coverageZoneSlugs = Object.entries(all)
          .filter(([, v]) => Array.isArray(v.coverageZones) && v.coverageZones.includes(zone))
          .map(([s]) => s);
      } catch {
        coverageZoneSlugs = [];
      }
    }
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const raw = await readFile(
        join(process.cwd(), "lib", "data", "marketplace-categories.json"),
        "utf8",
      );
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const meta = (parsed["_meta"] ?? {}) as { storeZones?: Record<string, string> };
      manualStoreZones = meta.storeZones ?? {};
      if (category) {
        const cat = parsed[category] as { linkedStoreSlugs?: string[] } | undefined;
        if (cat?.linkedStoreSlugs) manualCategoryStoreSlugs = cat.linkedStoreSlugs;
      }
    } catch {
      // sin archivo → ignorar (modo legacy, sólo store.category aplica)
    }

    let stores: Record<string, unknown>[] = [];
    try {
      // Si hay categoría con vínculos manuales: OR(category match, slug ∈ linked)
      const categoryClause = category
        ? manualCategoryStoreSlugs.length > 0
          ? { OR: [{ category }, { slug: { in: manualCategoryStoreSlugs } }] }
          : { category }
        : {};
      // Brandon mayo 2026: el filtro por zona antes solo matcheaba la columna
      // DB store.zone, pero el response usa finalZone que tambien acepta el
      // override del superadmin (manualStoreZones). Resultado: en /tiendas
      // se mostraba "Calleria" pero al filtrar → 0 stores porque ninguna
      // tienda lo tenia escrito en DB. Ahora el filtro hace OR(DB, override).
      //
      // Brandon mayo 14 2026: el id que envia el cliente viene normalizado
      // (lowercase, sin acentos) — ej. "centro", "calleria" — pero en DB la
      // columna `zone` guarda el label original ("Centro", "Calleria"). El
      // match exacto no encontraba ninguna tienda y aparecian zonas "huerfanas"
      // en el filtro. Ahora usamos `equals + mode insensitive` para empatar.
      const zoneOverrideSlugs = zone
        ? Object.entries(manualStoreZones)
            .filter(([, z]) => z.toLowerCase() === zone.toLowerCase())
            .map(([slug]) => slug)
        : [];
      // Combina: override del superadmin + coverageZones[] del propio tenant.
      const extraZoneSlugs = Array.from(new Set([...zoneOverrideSlugs, ...coverageZoneSlugs]));
      const zoneFilter = zone
        ? { zone: { equals: zone, mode: "insensitive" as const } }
        : null;
      const zoneClause = zoneFilter
        ? extraZoneSlugs.length > 0
          ? { OR: [zoneFilter, { slug: { in: extraZoneSlugs } }] }
          : zoneFilter
        : {};
      stores = await prisma.store.findMany({
        where: {
          isPublished: true,
          ...zoneClause,
          ...categoryClause,
          ...(search && { name: { contains: search, mode: "insensitive" as const } }),
        },
        select: {
          id:              true,
          slug:            true,
          name:            true,
          logo:            true,
          banner:          true, // hero al entrar al storefront
          category:        true,
          zone:            true,
          rating:          true,
          reviewCount:     true,
          description:     true,
          vacationMode:    true,
          vacationMessage: true,
          createdAt:       true,
          tenantId:        true, // necesario para batched lookup (Settings/Promotion)
          lat:             true, // TS-04 mapa
          lng:             true,
          _count:          { select: { products: true } },
        },
        take: limit * 2,
      });

      // Patch in `cover` y `hoursJson` por raw query — columnas existen en DB
      // pero el schema.prisma no se regenera (zona peligrosa). Patrón expand
      // seguro. Loop simple porque normalmente son <100 tiendas.
      if (stores.length > 0) {
        try {
          const rows = await prisma.$queryRawUnsafe<
            Array<{ id: string; cover: string | null; hoursJson: unknown }>
          >(
            `SELECT id, cover, "hoursJson" FROM "Store" WHERE id = ANY($1::text[])`,
            stores.map((s) => s.id as string),
          ).catch(
            () => [] as Array<{ id: string; cover: string | null; hoursJson: unknown }>,
          );
          const map = new Map(rows.map((r) => [r.id, r]));
          for (const s of stores) {
            const row = map.get(s.id as string);
            (s as Record<string, unknown>).cover = row?.cover ?? null;
            (s as Record<string, unknown>).hoursJson = row?.hoursJson ?? null;
          }
        } catch {
          // sin cover/hours → marketplace sigue funcionando
        }
      }
    } catch (dbErr) {
      // If Store table doesn't exist or DB connection fails, return empty list
      logger.warn("[marketplace/stores] DB query failed, returning empty list", { error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
      stores = [];
    }

    // ── Quality score ranking ── Stores with better ratings, more products, and
    // more reviews bubble to the top. Vacation stores sink to the bottom.
    function qualityScore(s: Record<string, unknown>): number {
      const rating = Number(s.rating) || 0;
      const reviews = Number(s.reviewCount) || 0;
      const products = s._count
        ? (s._count as { products: number }).products
        : 0;
      const isVacation = Boolean(s.vacationMode);

      const reviewConfidence = Math.min(reviews / 10, 1);
      const ratingScore = (rating / 5) * reviewConfidence * 40;
      const productScore = Math.min(products / 20, 1) * 30;
      const reviewScore = Math.min(reviews / 20, 1) * 30;
      const vacationPenalty = isVacation ? -50 : 0;

      return ratingScore + productScore + reviewScore + vacationPenalty;
    }

    function buildTrustSnapshot(s: Record<string, unknown>): {
      productCount: number;
      trustScore: number;
      trustLevel: TrustLevel;
      trustLabel: string;
      trustReason: string;
    } {
      const rating = Number(s.rating) || 0;
      const reviews = Number(s.reviewCount) || 0;
      const productCount = s._count
        ? (s._count as { products: number }).products
        : 0;
      const isVacation = Boolean(s.vacationMode);
      const trustScore = Math.max(0, Math.min(100, Math.round(qualityScore(s))));

      const trustLevel: TrustLevel = trustScore >= 70
        ? "alta"
        : trustScore >= 35
          ? "media"
          : "nueva";

      const trustLabel = trustLevel === "alta"
        ? "Muy confiable"
        : trustLevel === "media"
          ? "Buena reputación"
          : "En crecimiento";

      let trustReason = "Tienda nueva en el marketplace";
      if (isVacation) {
        trustReason = "Está en pausa temporal, pero conserva su historial";
      } else if (reviews >= 20 && rating >= 4.5) {
        trustReason = `${reviews} reseñas con calificación sobresaliente`;
      } else if (productCount >= 15) {
        trustReason = `${productCount} productos activos publicados`;
      } else if (reviews > 0) {
        trustReason = `${reviews} reseñas de clientes reales`;
      } else if (productCount > 0) {
        trustReason = `${productCount} productos ya visibles en catálogo`;
      }

      return { productCount, trustScore, trustLevel, trustLabel, trustReason };
    }

    stores.sort((a, b) => qualityScore(b) - qualityScore(a));
    const rankedStores = stores.slice(0, limit);

    // ── Backfill: paymentMethods / minOrderAmount / freeDelivery / activePromos ──
    // Una sola query batched por tenantId distinto para no N+1.
    type TenantId = string;
    const tenantIds: TenantId[] = [
      ...new Set(
        rankedStores
          .map((s) => (s as { tenantId?: string }).tenantId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    interface DayHours {
      open: number;
      openMin: number;
      close: number;
      closeMin: number;
    }

    interface MarketplaceMeta {
      paymentMethods: string[];
      minOrderAmount: number;
      freeDelivery: boolean;
      deliveryMinutes: number;
      activePromos: number;
      openHours: DayHours[] | null;
      isOpenNow: boolean;
    }
    const metaByTenant = new Map<TenantId, MarketplaceMeta>();

    // ── TS-02 helpers ────────────────────────────────────────────────────────
    function parseHHMM(s: string | null | undefined): { h: number; m: number } | null {
      if (!s || typeof s !== "string") return null;
      const m = /^([0-2]?\d):([0-5]\d)$/.exec(s.trim());
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 24 || min > 59) return null;
      return { h, m: min };
    }

    function buildOpenHours(close: string | null | undefined): DayHours[] | null {
      const c = parseHHMM(close);
      if (!c) return null;
      // Bodegas Pucallpa default: abre 08:00, cierra autoCloseTime.
      // Mismo horario los 7 días — heurística realista hasta que cada Store
      // configure horarios propios.
      return Array.from({ length: 7 }, () => ({
        open: 8,
        openMin: 0,
        close: c.h,
        closeMin: c.m,
      }));
    }

    function computeIsOpenNow(hours: DayHours[] | null): boolean {
      if (!hours) return true; // sin info, no penalizar
      const now = new Date();
      const today = hours[now.getDay()];
      if (!today) return false;
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      const open = today.open * 60 + today.openMin;
      const close = today.close * 60 + today.closeMin;
      return minutesNow >= open && minutesNow < close;
    }

    if (tenantIds.length > 0) {
      const [settings, promoCounts] = await Promise.all([
        prisma.settings
          .findMany({
            where: { tenantId: { in: tenantIds } },
            select: {
              tenantId: true,
              freeDeliveryMin: true,
              deliveryZonesJson: true,
              autoCloseTime: true,
            },
          })
          .catch((e: unknown) => {
            logger.warn("[marketplace/stores] settings lookup failed", { error: String(e) });
            return [] as Array<{
              tenantId: string;
              freeDeliveryMin: unknown;
              deliveryZonesJson: string | null;
              autoCloseTime: string | null;
            }>;
          }),
        prisma.promotion
          .groupBy({
            by: ["tenantId"],
            where: {
              tenantId: { in: tenantIds },
              active: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            _count: { _all: true },
          })
          .catch((e: unknown) => {
            logger.warn("[marketplace/stores] promo groupby failed", { error: String(e) });
            return [] as Array<{ tenantId: string; _count: { _all: number } }>;
          }),
      ]);

      const settingsByTenant = new Map<string, (typeof settings)[number]>();
      for (const s of settings) settingsByTenant.set(s.tenantId, s);

      const promosByTenant = new Map<string, number>();
      for (const p of promoCounts) promosByTenant.set(p.tenantId, p._count._all);

      for (const tid of tenantIds) {
        const ts = settingsByTenant.get(tid);
        const minOrderAmount = ts?.freeDeliveryMin ? Number(ts.freeDeliveryMin) : 0;
        let deliveryMinutes = 30;
        try {
          const zones = ts?.deliveryZonesJson ? JSON.parse(ts.deliveryZonesJson) : null;
          if (Array.isArray(zones) && zones.length > 0) {
            const first = zones[0] as { estimatedMin?: number };
            if (typeof first.estimatedMin === "number" && first.estimatedMin > 0) {
              deliveryMinutes = first.estimatedMin;
            }
          }
        } catch {
          // ignorar JSON parse — usar default
        }

        const openHours = buildOpenHours(ts?.autoCloseTime ?? "22:00");
        const isOpenNow = computeIsOpenNow(openHours);

        metaByTenant.set(tid, {
          // Default Pucallpa: bodegas aceptan Yape + efectivo. Ampliable por config futura.
          paymentMethods: ["yape", "efectivo"],
          minOrderAmount,
          freeDelivery: minOrderAmount === 0,
          deliveryMinutes,
          activePromos: promosByTenant.get(tid) ?? 0,
          openHours,
          isOpenNow,
        });
      }
    }

    // Bulk lookup del flag "Tienda en construccion" por slug — stored en
    // lib/data/store-construction.json (sin migracion). Cada card lo lee
    // y muestra overlay sobre la portada en /tiendas si esta habilitado.
    const { listConstructionMode } = await import("@/lib/store-construction-mode");
    const constructionMap: Record<string, { enabled: boolean; message?: string; updatedAt: string }> =
      await listConstructionMode().catch((err) => {
        logger.warn("[marketplace/stores] construction mode lookup failed", { error: String(err) });
        return {};
      });

    // Bulk lookup de store-extras (coverageZones, subcategory, customCategories)
    // — JSON storage paralelo a Store. Solo necesitamos coverageZones aquí
    // para el filtro de /tiendas (zona multi-cobertura).
    const { getStoreExtrasMap } = await import("@/lib/store-extras");
    const extrasMap = await getStoreExtrasMap(stores.map((s) => s.slug as string)).catch(
      (err) => {
        logger.warn("[marketplace/stores] extras lookup failed", { error: String(err) });
        return new Map();
      },
    );

    // Helpers de horario — derivan isOpenNow + nextOpening desde hoursJson
    // del Store (más preciso que el autoCloseTime legacy de Settings).
    const { isOpenNow: storeIsOpenNow, nextOpening, sortStoresByStatus } =
      await import("@/lib/marketplace-store-hours");
    const NOW = new Date();

    // F4: normaliza hoursJson legacy (array de 7 objetos {open,openMin,close,closeMin})
    // al formato objeto {mon:{open:"HH:MM",close:"HH:MM"}} que espera storeIsOpenNow.
    type OpenHoursObject = Record<string, { open: string; close: string; closed?: boolean } | null>;
    function normalizeOpenHours(raw: unknown): OpenHoursObject | null {
      if (!raw) return null;
      if (Array.isArray(raw)) {
        const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
        const out: Record<string, { open: string; close: string } | null> = {};
        for (let i = 0; i < days.length && i < raw.length; i++) {
          const d = raw[i] as { open?: number; openMin?: number; close?: number; closeMin?: number; closed?: boolean };
          if (d?.closed || d?.open == null) { out[days[i]] = null; continue; }
          out[days[i]] = {
            open:  `${String(d.open).padStart(2, "0")}:${String(d.openMin ?? 0).padStart(2, "0")}`,
            close: `${String(d.close ?? 23).padStart(2, "0")}:${String(d.closeMin ?? 59).padStart(2, "0")}`,
          };
        }
        return out as OpenHoursObject;
      }
      if (typeof raw === "object") return raw as OpenHoursObject;
      return null;
    }

    // Explicitly pick only public-safe fields (defense-in-depth: Prisma select
    // already excludes tenantId, but explicit destructuring ensures it can never
    // leak even if a mock, migration, or refactor adds the field back)
    const safeStores = rankedStores.map((s) => {
      const trust = buildTrustSnapshot(s);
      const tid = (s as { tenantId?: string }).tenantId;
      const meta = (tid && metaByTenant.get(tid)) || {
        paymentMethods: ["yape", "efectivo"],
        minOrderAmount: 0,
        freeDelivery: true,
        deliveryMinutes: 30,
        activePromos: 0,
        openHours: null,
        isOpenNow: true,
      };
      // Override de zona: si store.zone está vacío y superadmin asignó una manual,
      // usar la manual. La de la tienda (cuando existe) siempre tiene prioridad.
      const slug = (s as { slug?: string }).slug ?? "";
      const ownZone = ((s.zone as string | null | undefined) ?? "").trim();
      const finalZone = ownZone !== "" ? ownZone : (manualStoreZones[slug] ?? "");
      const construction = constructionMap[slug];
      const rawHoursJson = (s as { hoursJson?: unknown }).hoursJson ?? null;
      // F4: normalizar formato legacy array → objeto antes de usar storeIsOpenNow.
      const hoursJson = normalizeOpenHours(rawHoursJson);
      // Si la tienda configuró horario propio, lo usamos como source-of-truth.
      // Si no, caemos al autoCloseTime legacy (meta.isOpenNow).
      const hasOwnHours = hoursJson && typeof hoursJson === "object";
      const ownIsOpenNow = hasOwnHours ? storeIsOpenNow(hoursJson as never, NOW) : null;
      const ownNextOpen = hasOwnHours ? nextOpening(hoursJson as never, NOW) : null;
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        cover: (s as { cover?: string | null }).cover ?? null, // Portada — patched arriba via raw query
        banner: (s as { banner?: string | null }).banner ?? null, // Hero del storefront
        category: s.category,
        zone: finalZone,
        rating: s.rating,
        reviewCount: s.reviewCount,
        description: s.description,
        vacationMode: s.vacationMode,
        vacationMessage: s.vacationMessage,
        underConstruction: Boolean(construction?.enabled),
        underConstructionMessage: construction?.message ?? null,
        coverageZones: extrasMap.get(slug)?.coverageZones ?? [],
        subcategory: extrasMap.get(slug)?.subcategory ?? null,
        lat: s.lat,
        lng: s.lng,
        productCount: trust.productCount,
        trustScore: trust.trustScore,
        trustLevel: trust.trustLevel,
        trustLabel: trust.trustLabel,
        trustReason: trust.trustReason,
        // Marketplace meta (backfill — sin nuevas columnas)
        paymentMethods:  meta.paymentMethods,
        minOrderAmount:  meta.minOrderAmount,
        freeDelivery:    meta.freeDelivery,
        deliveryMinutes: meta.deliveryMinutes,
        activePromos:    meta.activePromos,
        // openHours / isOpenNow — preferir hoursJson configurado por el dueño.
        openHours:       hasOwnHours ? hoursJson : meta.openHours,
        isOpenNow:       ownIsOpenNow ?? meta.isOpenNow,
        nextOpeningAt:   ownNextOpen ? ownNextOpen.toISOString() : null,
      };
    });

    // Sort por estado: open → vacation → closed → construction. Mantiene
    // qualityScore como tiebreak dentro de cada bucket.
    // Para tiendas sin hoursJson configurado, usamos el flag `isOpenNow` ya
    // calculado por el backend (legacy autoCloseTime) — pasamos un mock de
    // hours abierto 24/7 en el día actual, así el helper devuelve "open".
    const todayKey = (["sun","mon","tue","wed","thu","fri","sat"] as const)[NOW.getDay()];
    const ALWAYS_OPEN_TODAY = { [todayKey]: { open: "00:00", close: "23:59", closed: false } };
    const sortable = safeStores.map((s) => {
      const hasOwnHours =
        s.openHours && typeof s.openHours === "object" && !Array.isArray(s.openHours);
      const hours = hasOwnHours
        ? (s.openHours as never)
        : s.isOpenNow !== false
          ? (ALWAYS_OPEN_TODAY as never) // legacy "abierto"
          : null;                         // legacy "cerrado"
      return {
        __ref: s,
        isPublished: true,
        underConstruction: !!s.underConstruction,
        vacationMode: !!s.vacationMode,
        hours,
      };
    });
    const ordered = sortStoresByStatus(sortable, NOW).map((x) => x.__ref);

    return { data: ordered, total: ordered.length };
      },
    );

    return NextResponse.json(cached, {
      headers: {
        // Cache CDN/proxy 60s + SWR 5min: alivia carga DB para listados
        // populares. Las queries con `search` también se cachean (URL única).
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    logger.error("[marketplace/stores GET]", { error: err instanceof Error ? err.message : String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── Schemas para crear/editar ─────────────────────────────────────────────────

const HoursDaySchema = z.object({
  open:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  close:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closed: z.boolean().optional(),
});

const HoursSchema = z.object({
  mon: HoursDaySchema.optional(),
  tue: HoursDaySchema.optional(),
  wed: HoursDaySchema.optional(),
  thu: HoursDaySchema.optional(),
  fri: HoursDaySchema.optional(),
  sat: HoursDaySchema.optional(),
  sun: HoursDaySchema.optional(),
});

const StoreBodySchema = z.object({
  slug:           z.string().max(100).optional().default(""),
  name:           z.string().min(1).max(200),
  description:    z.string().max(1000).optional(),
  logoUrl:        z.string().max(500).optional(),
  category:       z.string().max(100).optional(),
  zone:           z.string().max(100).optional(),
  commissionRate:  z.number().min(0).max(30).optional(),
  isActive:        z.boolean().optional(),
  vacationMode:    z.boolean().optional(),
  vacationMessage: z.string().max(500).optional(),
  hours:           HoursSchema.optional(),
});

/**
 * POST /api/marketplace/stores — crear nueva tienda para el tenant
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = StoreBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Resolve tenant ID (handle slug vs CUID, auto-create if needed)
    const tenant = await ensureTenant(auth.tenantId);

    // Verificar que el tenant no tenga ya una tienda
    let existing = null;
    try {
      existing = await prisma.store.findFirst({
        where: { tenantId: { in: tenant.possibleIds } },
      });
    } catch {
      // Store table may not exist yet — return helpful message
      return NextResponse.json(
        { error: "La tabla Store aún no existe en la base de datos. Ejecuta la migración pendiente." },
        { status: 503 },
      );
    }
    if (existing) {
      // Instead of 409 error, return the existing store so the frontend can switch to PUT
      return NextResponse.json({
        id:              existing.id,
        slug:            existing.slug,
        name:            existing.name,
        description:     existing.description ?? "",
        logoUrl:         existing.logo ?? "",
        category:        existing.category,
        zone:            existing.zone ?? "",
        commissionRate:  existing.commission,
        isActive:        existing.isPublished,
        vacationMode:    existing.vacationMode,
        vacationMessage: existing.vacationMessage ?? "",
      });
    }

    // Auto-generate slug from name if not provided
    let slug = parsed.data.slug?.trim() || "";
    if (!slug) {
      slug = parsed.data.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        || `tienda-${Date.now().toString(36)}`;
    }
    // Ensure slug uniqueness
    const slugExists = await prisma.store.findUnique({ where: { slug } });
    if (slugExists) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // (nota: hoursJson se persiste post-create via $executeRaw porque la
    //  columna aún no está declarada en schema.prisma — fase expand.)
    const store = await prisma.store.create({
      data: {
        tenantId:    tenant.id,
        slug,
        name:        parsed.data.name,
        description: parsed.data.description ?? null,
        logo:        parsed.data.logoUrl ?? null,
        category:    parsed.data.category ?? "bodega",
        zone:        parsed.data.zone ?? null,
        commission:  parsed.data.commissionRate ?? 5.0,
        isPublished:     parsed.data.isActive ?? false,
        vacationMode:    parsed.data.vacationMode ?? false,
        vacationMessage: parsed.data.vacationMessage ?? null,
      },
    });

    // Persist hoursJson via raw query (columna fuera del schema Prisma).
    let createdHours: unknown = null;
    if (parsed.data.hours !== undefined) {
      const hoursStr = JSON.stringify(parsed.data.hours);
      await prisma.$executeRaw`
        UPDATE "Store" SET "hoursJson" = ${hoursStr}::jsonb WHERE id = ${store.id}
      `;
      createdHours = parsed.data.hours;
    }

    invalidateByPrefix("marketplace:stores");

    return NextResponse.json({
      hours:           createdHours,
      id:              store.id,
      slug:            store.slug,
      name:            store.name,
      description:     store.description ?? "",
      logoUrl:         store.logo ?? "",
      category:        store.category,
      zone:            store.zone ?? "",
      commissionRate:  store.commission,
      isActive:        store.isPublished,
      vacationMode:    store.vacationMode,
      vacationMessage: store.vacationMessage ?? "",
    }, { status: 201 });
  } catch (err) {
    logger.error("[POST /api/marketplace/stores] Error", { err: err instanceof Error ? err.message : String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * PUT /api/marketplace/stores — actualizar la tienda del tenant
 */
export async function PUT(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = StoreBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const tenant = await ensureTenant(auth.tenantId);

    let existing = null;
    try {
      existing = await prisma.store.findFirst({
        where: { tenantId: { in: tenant.possibleIds } },
      });
    } catch {
      return NextResponse.json(
        { error: "La tabla Store aún no existe en la base de datos. Ejecuta la migración pendiente." },
        { status: 503 },
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Only update slug if provided and non-empty; otherwise keep existing
    const newSlug = parsed.data.slug?.trim() || existing.slug;

    // If slug changed, ensure uniqueness
    let finalSlug = newSlug;
    if (newSlug !== existing.slug) {
      const slugTaken = await prisma.store.findUnique({ where: { slug: newSlug } });
      if (slugTaken) {
        finalSlug = `${newSlug}-${Date.now().toString(36)}`;
      }
    }

    const store = await prisma.store.update({
      where: { id: existing.id },
      data: {
        slug:            finalSlug,
        name:            parsed.data.name,
        description:     parsed.data.description ?? existing.description,
        logo:            parsed.data.logoUrl ?? existing.logo,
        category:        parsed.data.category ?? existing.category,
        zone:            parsed.data.zone ?? existing.zone,
        commission:      parsed.data.commissionRate ?? existing.commission,
        isPublished:     parsed.data.isActive ?? existing.isPublished,
        vacationMode:    parsed.data.vacationMode ?? existing.vacationMode,
        vacationMessage: parsed.data.vacationMessage ?? existing.vacationMessage,
      },
    });

    // Persist hoursJson via raw query (columna fuera del schema Prisma).
    let savedHours: unknown = null;
    if (parsed.data.hours !== undefined) {
      const hoursStr = JSON.stringify(parsed.data.hours);
      await prisma.$executeRaw`
        UPDATE "Store" SET "hoursJson" = ${hoursStr}::jsonb WHERE id = ${store.id}
      `;
      savedHours = parsed.data.hours;
    } else {
      const rows = await prisma.$queryRaw<Array<{ hoursJson: unknown }>>`
        SELECT "hoursJson" FROM "Store" WHERE id = ${store.id} LIMIT 1
      `;
      savedHours = rows[0]?.hoursJson ?? null;
    }

    invalidateByPrefix("marketplace:stores");

    return NextResponse.json({
      id:              store.id,
      slug:            store.slug,
      name:            store.name,
      description:     store.description ?? "",
      logoUrl:         store.logo ?? "",
      category:        store.category,
      zone:            store.zone ?? "",
      commissionRate:  store.commission,
      isActive:        store.isPublished,
      vacationMode:    store.vacationMode,
      vacationMessage: store.vacationMessage ?? "",
      hours:           savedHours,
    });
  } catch (err) {
    logger.error("[PUT /api/marketplace/stores] Error", { err: err instanceof Error ? err.message : String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

