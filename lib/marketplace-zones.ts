/**
 * Catálogo canónico de zonas del marketplace (single source of truth).
 *
 * Antes había 5+ listas inline dispersas (admin, /tiendas, registro,
 * MarketplaceGrid, [zona]). Cada cambio de barrio había que hacerlo
 * en cinco lugares y se desincronizaban. Ahora todas leen de aquí.
 *
 * El filtro de /tiendas además se DERIVA de los stores publicados:
 * sólo aparecen las zonas que tienen ≥1 tienda asignada (sin inventar).
 */

export type MarketplaceZone = {
  /** id url-safe usado como filtro (?zone=...) y clave de comparación. */
  id: string;
  /** Label legible para UI. */
  label: string;
  /** Ciudad madre — agrupa zonas en el dropdown de admin. */
  city: string;
};

/** Catálogo base. Editar acá agrega/quita opciones del dropdown. */
export const MARKETPLACE_ZONES: readonly MarketplaceZone[] = [
  // ── Pucallpa (Ucayali) ──
  { id: "centro",        label: "Centro",        city: "Pucallpa" },
  { id: "manantay",      label: "Manantay",      city: "Pucallpa" },
  { id: "calleria",      label: "Callería",      city: "Pucallpa" },
  { id: "yarinacocha",   label: "Yarinacocha",   city: "Pucallpa" },
  { id: "campo_verde",   label: "Campo Verde",   city: "Pucallpa" },
  { id: "san_fernando",  label: "San Fernando",  city: "Pucallpa" },
  { id: "pueblo_libre",  label: "Pueblo Libre",  city: "Pucallpa" },
  // ── Ciudad Constitución (Pasco) ──
  { id: "constitucion_centro",  label: "Centro",       city: "Ciudad Constitución" },
  { id: "constitucion_norte",   label: "Sector Norte", city: "Ciudad Constitución" },
  { id: "constitucion_sur",     label: "Sector Sur",   city: "Ciudad Constitución" },
];

export const MARKETPLACE_CITIES = ["Pucallpa", "Ciudad Constitución"] as const;
export type MarketplaceCity = (typeof MARKETPLACE_CITIES)[number];

/** Normaliza string libre a un id del catálogo si coincide. */
export function normalizeZoneId(input: string | null | undefined): string | null {
  if (!input) return null;
  const k = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!k) return null;
  // Match por id exacto o por label normalizado.
  const byId = MARKETPLACE_ZONES.find((z) => z.id === k);
  if (byId) return byId.id;
  const byLabel = MARKETPLACE_ZONES.find(
    (z) =>
      z.label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_") === k,
  );
  return byLabel?.id ?? null;
}

/** Devuelve el label legible. Si no está en catálogo, devuelve el input tal cual. */
export function getZoneLabel(idOrLabel: string | null | undefined): string {
  if (!idOrLabel) return "";
  const id = normalizeZoneId(idOrLabel);
  if (id) {
    const z = MARKETPLACE_ZONES.find((x) => x.id === id);
    if (z) return z.label;
  }
  return idOrLabel;
}

/**
 * Construye el listado de zonas para el filtro de /tiendas usando SÓLO
 * los stores con zona poblada. Si una zona del catálogo no está en uso,
 * NO aparece en el filtro. Si una tienda escribió una zona manual fuera
 * del catálogo, también aparece (custom passthrough).
 *
 * Siempre prepende un item "Todas las zonas" con id vacío.
 */
export function deriveActiveZones(
  stores: ReadonlyArray<{ zone?: string | null }>,
): MarketplaceZone[] {
  const seen = new Set<string>();
  const result: MarketplaceZone[] = [];
  for (const s of stores) {
    const raw = (s.zone ?? "").trim();
    if (!raw) continue;
    const id = normalizeZoneId(raw);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
      const z = MARKETPLACE_ZONES.find((x) => x.id === id);
      if (z) result.push(z);
    } else {
      // Zona manual fuera del catálogo — se respeta tal como la escribió el admin.
      const customId = raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (!customId || seen.has(customId)) continue;
      seen.add(customId);
      result.push({ id: customId, label: raw, city: "Otro" });
    }
  }
  result.sort((a, b) => a.label.localeCompare(b.label, "es"));
  return [{ id: "", label: "Todas las zonas", city: "" }, ...result];
}

/** Opciones para `<select>` agrupadas por ciudad. */
export function getZoneOptionsByCity(): Record<string, MarketplaceZone[]> {
  const grouped: Record<string, MarketplaceZone[]> = {};
  for (const z of MARKETPLACE_ZONES) {
    if (!grouped[z.city]) grouped[z.city] = [];
    grouped[z.city].push(z);
  }
  return grouped;
}
