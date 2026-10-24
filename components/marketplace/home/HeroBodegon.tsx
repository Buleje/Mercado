/**
 * HeroBodegon — los 3 «platos» con fotos REALES del catálogo en el hero
 * «Dosel» (2026-10-10). Server, async: va dentro de un `<Suspense>` para que
 * el H1 (el LCP) no espere a la consulta.
 *
 * Elige productos con foto de familias distintas (comida, bebidas, frescos,
 * despensa) y, si faltan, de categorías distintas. Lo de ferretería, madera o
 * alquiler no se sirve en un plato. Con menos de 3 fotos no hay bodegón: las
 * hojas del fondo ocupan el lugar. Si la consulta falla, tampoco: el hero no
 * se cae por esto.
 *
 * Usa la MISMA llamada (y por lo tanto la misma caché) que el «Destacados»
 * del catálogo: `/api/marketplace/catalog?sort=popular`.
 */
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { familiaDe, type FamiliaId } from "@/lib/marketplace/familias-categoria";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface Plato {
  id: number;
  nombre: string;
  corto: string;
  precio: string;
  imagen: string;
  href: string;
}

const FAMILIAS_DEL_PLATO: readonly FamiliaId[] = ["comida", "bebidas", "frescos", "despensa"];
const PALABRAS_DE_RELLENO = new Set(["a", "al", "la", "el", "de", "del", "con", "y", "en", "x"]);

/** Solo hosts que `next.config.ts › images.remotePatterns` acepta (o rutas propias). */
function imagenServible(src: string | null | undefined): src is string {
  if (!src) return false;
  if (/^\/(?!\/)/.test(src)) return true;
  return /^https:\/\/([a-z0-9-]+\.)*(supabase\.co|unsplash\.com|openfoodfacts\.org|public\.blob\.vercel-storage\.com|r2\.dev)\//i.test(
    src,
  );
}

/** «Chicha Morada 1 Lt» → «Chicha Morada»; «1/8 Pollo a la Brasa» → «1/8 Pollo». */
function nombreCorto(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/);
  const out: string[] = [];
  for (const p of palabras) {
    if ([...out, p].join(" ").length > 18) break;
    out.push(p);
  }
  while (out.length > 1) {
    const ultima = out[out.length - 1].toLowerCase();
    if (PALABRAS_DE_RELLENO.has(ultima) || /^\d/.test(ultima) || ultima.length <= 2) out.pop();
    else break;
  }
  return out.join(" ") || palabras[0];
}

async function cargarPlatos(): Promise<Plato[]> {
  try {
    const filas = await MarketplacePublicDB.getCatalogPage({
      sort: "popular",
      limit: 240,
      excludePrepared: true,
    });
    const candidatas = filas
      .filter((f) => imagenServible(f.product.image))
      .map((f) => ({ f, familia: familiaDe(f.product.category, f.product.name) }))
      .filter(({ familia }) => FAMILIAS_DEL_PLATO.includes(familia));

    const elegidas: typeof candidatas = [];
    const familias = new Set<FamiliaId>();
    const categorias = new Set<string>();
    // 1.ª pasada: una por familia (variedad de colores en el plato).
    for (const c of candidatas) {
      if (elegidas.length === 3) break;
      if (familias.has(c.familia)) continue;
      elegidas.push(c);
      familias.add(c.familia);
      categorias.add((c.f.product.category ?? "").toLowerCase());
    }
    // 2.ª pasada: completar con categorías que todavía no están.
    for (const c of candidatas) {
      if (elegidas.length === 3) break;
      const cat = (c.f.product.category ?? "").toLowerCase();
      if (categorias.has(cat) || elegidas.includes(c)) continue;
      elegidas.push(c);
      categorias.add(cat);
    }
    return elegidas.map(({ f }) => ({
      id: f.product.id,
      nombre: f.product.name,
      corto: nombreCorto(f.product.name),
      precio: Number(f.retailPrice).toFixed(2),
      imagen: f.product.image as string,
      href: `/marketplace/${f.store.slug}/producto/${f.product.id}`,
    }));
  } catch (err) {
    logger.warn("[home] bodegón del hero sin datos", { error: String(err) });
    return [];
  }
}

// Triángulo en diagonal: el mediano arriba a la derecha (sobre el sol), el
// grande abajo a la izquierda (al costado de la bajada y los CTAs, que son más
// angostos que la 2.ª línea del H1) y el chico abajo a la derecha.
const POSICIONES = [
  { tam: 176, giro: "-6deg", retraso: "0s", clase: "bottom-[34px] left-0 z-[2]" },
  { tam: 124, giro: "4deg", retraso: "1.2s", clase: "right-1 top-2 z-[1]" },
  { tam: 96, giro: "-2deg", retraso: "2.4s", clase: "bottom-0 right-0 z-[3]" },
] as const;

const FOCO = "rounded-full focus-visible:outline-offset-4! focus-visible:outline-white!";

function PlatoFoto({ plato, tam, giro, retraso }: { plato: Plato; tam: number; giro: string; retraso: string }) {
  return (
    <div
      className="dosel-flotar"
      style={{ "--giro": giro, animationDelay: retraso } as CSSProperties}
    >
      <div
        className="relative overflow-clip rounded-full bg-[var(--plato)] shadow-[var(--shadow-xl)] ring-[6px] ring-white/25"
        style={{ width: tam, height: tam }}
      >
        <Image src={plato.imagen} alt="" fill sizes={`${tam}px`} className="object-cover" />
      </div>
    </div>
  );
}

export default async function HeroBodegon() {
  const platos = await cargarPlatos();
  if (platos.length < 3) return null;
  const [grande] = platos;

  return (
    <>
      {/* md+: el bodegón completo, a la derecha del tile */}
      <div className="absolute bottom-5 right-6 top-5 z-20 hidden w-[248px] transition-opacity duration-[var(--dur-slower)] starting:opacity-0 md:block">
        {platos.map((plato, i) => {
          const pos = POSICIONES[i];
          return (
            <Link
              key={plato.id}
              href={plato.href}
              aria-label={`${plato.nombre}, S/ ${plato.precio}`}
              className={cn("absolute block", pos.clase, FOCO)}
            >
              <PlatoFoto plato={plato} tam={pos.tam} giro={pos.giro} retraso={pos.retraso} />
              {i === 0 && (
                <span
                  aria-hidden
                  className="absolute -left-6 top-3 inline-flex h-8 rotate-[-4deg] items-center whitespace-nowrap rounded-full bg-amber-500 px-3 text-sm font-extrabold tabular-nums text-[var(--brand-ink)] shadow-[var(--shadow-md)]"
                >
                  {plato.corto} · S/ {plato.precio}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {/* celular: un solo plato de 88 px asomando por la esquina (decorativo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-5 z-20 transition-opacity duration-[var(--dur-slower)] starting:opacity-0 md:hidden"
      >
        <PlatoFoto plato={grande} tam={88} giro="-6deg" retraso="0s" />
      </div>
    </>
  );
}
