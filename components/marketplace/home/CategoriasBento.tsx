import Link from "next/link";
import { Reveal } from "@/components/landing/Reveal";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { BRAND_GEO } from "@/lib/geo";
import {
  UtensilsCrossed,
  ShoppingCart,
  Leaf,
  GlassWater,
  Sparkles,
  Package,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";

// ── 2. Categorías del superadmin — Brandon mayo 14 v3 ───────────────────────
// Antes eran emojis hardcoded. Ahora vienen del JSON que administra el
// superadmin (mismo storage que /api/marketplace/categories), con imageUrl
// real. Mantenemos el layout Rappi: 2 cards XL destacados arriba +
// resto en grid chico. Restaurantes y Bodegas (supermercado) son siempre
// los destacados (los primeros en orden), el resto va al grid chico.
// Emojis de fallback por slug si la imagen no está subida aún.

// Brandon 2026-07-05 (audit #2): "pollo-brasa" → "Pollo brasa".
function prettyCatLabel(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function hrefForCategory(id: string): string {
  // Audit #2 (eje "por producto"): filtra el CATÁLOGO por categoría de producto
  // (mismo destino que "Ver más" de los carruseles), en vez de /tiendas por rubro.
  return `/?cat=${encodeURIComponent(id)}#catalogo`;
}

// ── Bloques temáticos (Brandon 2026-07-06) ──────────────────────────────────
// Reemplaza el bento teal (neon, cada tile se inundaba de --accent en hover)
// por un ÍNDICE EDITORIAL agrupado en bloques: cada categoría de producto cae
// en el 1er bloque cuyo patrón matchea; lo no reconocido va a "Más". El color
// se retira a mínimos del DS (superficies + hairlines + acento SOLO en el
// cuadro del ícono y el hover de la fila). Minimalista pero estructurado.
interface CategoryBlockDef {
  id: string;
  label: string;
  icon: LucideIcon;
  /** 1er match gana; el bloque sin `match` (último) es el catch-all "Más". */
  match?: RegExp;
}
const CATEGORY_BLOCKS: CategoryBlockDef[] = [
  {
    id: "preparada",
    label: "Comida preparada",
    icon: UtensilsCrossed,
    match: /pizza|calzon|brasa|broaster|alita|hamburgues|sandwich|salchipapa|shawarma|\bmenu|menú|combo|almuerzo|parrilla|guiso|caldo|sopa|crema|cebiche|ceviche|postre|helado|torta|keke|ensalada|guarnicion|acompan|desayuno|anticucho/i,
  },
  {
    id: "frescos",
    label: "Frescos",
    icon: Leaf,
    match: /fruta|verdura|carne|pollo|res|cerdo|chancho|pescado|marisco|paiche|fresco|huevo|lacteo|lácteo|queso|leche|yogur|embutido/i,
  },
  {
    id: "bebidas",
    label: "Bebidas",
    icon: GlassWater,
    match: /bebida|gaseosa|agua|jugo|refresco|cerveza|pilsen|licor|vino|pisco|ron|whisky|trago|energizante|café|cafe/i,
  },
  {
    id: "despensa",
    label: "Despensa",
    icon: ShoppingCart,
    match: /abarrote|snack|golosina|galleta|fideo|pasta|arroz|azucar|azúcar|aceite|conserva|enlatado|panaderia|panadería|\bpan\b|dulce|cereal|harina|menestra|grano|salsa|condimento/i,
  },
  {
    id: "hogar",
    label: "Hogar y cuidado",
    icon: Sparkles,
    match: /limpieza|hogar|aseo|ferreteria|ferretería|herramienta|construccion|construcción|madera|electro|tecnologia|tecnología|celular|farmacia|botica|salud|mascota|bebe|bebé|cuidado|regalo|papeleria|papelería/i,
  },
  { id: "mas", label: "Más categorías", icon: Package },
];

async function CategoriesGrid() {
  // Audit #2 (eje "por producto"): categorías de PRODUCTO desde MarketplacePublicDB
  // (misma fuente que header + mega-menú + carruseles). getProductCategories ya
  // devuelve solo categorías con ≥1 producto real (cero muertas), ordenadas por
  // cantidad. Los rubros de tienda siguen navegables desde /tiendas.
  const flat = (await MarketplacePublicDB.getProductCategories().catch(() => []))
    .filter((c) => c.id && c.count > 0);
  if (flat.length === 0) return null;

  // Clasificar cada categoría en su bloque (1er patrón que matchea; resto → "Más").
  // Normaliza acentos/ñ antes del test → "Acompañamientos"/"Lácteos" matchean sus
  // patrones sin duplicar cada forma acentuada en el regex.
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const blocks = CATEGORY_BLOCKS.map((b) => ({
    ...b,
    cats: [] as Array<{ id: string; label: string }>,
  }));
  const fallback = blocks[blocks.length - 1];
  for (const c of flat) {
    const key = norm(c.id);
    const target = blocks.find((b) => b.match?.test(key)) ?? fallback;
    target.cats.push({ id: c.id, label: prettyCatLabel(c.id) });
  }
  const visible = blocks.filter((b) => b.cats.length > 0);

  return (
    <section
      aria-label="Categorías"
      className="bg-[var(--surface-canvas)] py-5 sm:py-7"
    >
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Categorías"
          title="Explora por categoría"
          subtitle={`Todo lo que tu barrio vende, ordenado por bloques — con delivery rápido en ${BRAND_GEO.city}.`}
          actionLabel="Ver todas"
          actionHref="/tiendas"
        />

        {/* ── Índice editorial por bloques (Brandon 2026-07-06): paneles calmos
             sobre superficie, hairlines del DS, acento SOLO en el cuadro del
             ícono. Cero relleno teal (adiós neon). Cada bloque = título serif +
             GRILLA DE CUADRITOS (sin conteos) — cada categoría es un tile
             cuadrado navegable. ── */}
        {/* Masonry (Brandon 2026-07-06): `columns` empaqueta los bloques sin
             huecos — los bloques cortos (Bebidas, Frescos) suben a rellenar el
             espacio de los altos → todo uniforme, sin gaps grandes. */}
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 sm:gap-4">
          {visible.map((b) => {
            const BlockIcon = b.icon;
            return (
              <div
                key={b.id}
                className="mb-3 sm:mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-[border-color,box-shadow] duration-[var(--dur-base)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--shadow-md)]"
              >
                {/* Encabezado del bloque — sans bold (sin serif alargada), sin conteo */}
                <div className="flex items-center gap-2.5 border-b border-[var(--rule-soft)] px-4 py-3.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-[var(--accent-dark)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_20%,transparent)] dark:text-[var(--accent)]">
                    <BlockIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                    {b.label}
                  </span>
                </div>

                {/* Cuadritos de categorías (grilla, sin números). Bloque de una
                    sola categoría → tile a todo el ancho (sin celda vacía). */}
                <ul
                  className={`grid gap-2.5 p-3 ${
                    b.cats.length === 1 ? "grid-cols-1" : "grid-cols-2"
                  }`}
                >
                  {b.cats.map((c) => {
                    const CatIcon = getProductCategoryIcon(c.id);
                    return (
                      <li key={c.id}>
                        <Link
                          href={hrefForCategory(c.id)}
                          className="group/tile flex h-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-4 text-center transition-[border-color,background-color,transform] duration-[var(--dur-fast)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-[var(--surface-sunken)]"
                        >
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-[var(--accent-dark)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_16%,transparent)] transition-transform duration-[var(--dur-fast)] group-hover/tile:scale-105 dark:text-[var(--accent)]">
                            <CatIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                          </span>
                          <span className="text-sm font-semibold leading-tight text-[var(--text-primary)] line-clamp-2">
                            {c.label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function CategoriasBento() {
  return (
    <Reveal>
      <CategoriesGrid />
    </Reveal>
  );
}
