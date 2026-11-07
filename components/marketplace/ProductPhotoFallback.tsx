/**
 * ProductPhotoFallback — el «sin foto» del marketplace: un SELLO DE FAMILIA.
 *
 * Única fuente del "sin foto" (Brandon 2026-07-04). Rediseño «Dosel»
 * (2026-10-10): el 57 % de los productos no tiene foto, así que esto es el caso
 * común y tiene que verse intencional, no «a medio terminar».
 *
 *   · Fondo con el tinte de su familia (`data-familia` → `--tinte-bg`) y su
 *     motivo (`.patron-familia`: mantel en comida, hojitas en frescos, ondas en
 *     bebidas, granos en despensa, greca en hogar). El color vive en globals.css.
 *   · Un blob orgánico (3 formas, elegida por el nombre para que la grilla no
 *     se vea clonada) con un brillo arriba a la izquierda.
 *   · El glifo más específico: pistas por nombre → categoría → familia.
 *   · SIN texto adentro: el nombre ya está debajo de la foto. `showName` queda
 *     para superficies que no lo muestran afuera.
 *
 * `forma="mini"` (≤ 56 px): solo blob y glifo, sin motivo. Server-safe.
 */

import {
  Apple,
  Beef,
  Beer,
  CakeSlice,
  Candy,
  Carrot,
  ChefHat,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Fish,
  GlassWater,
  Hammer,
  IceCreamCone,
  Milk,
  Package,
  Pizza,
  Sandwich,
  SprayCan,
  Truck,
  Wheat,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { familiaDe, familiaPorId, sinTildes } from "@/lib/marketplace/familias-categoria";
import { cn } from "@/lib/utils";

// Pistas por NOMBRE (sin tildes, minúsculas). Van antes que la categoría: el
// nombre es más específico («Inca Kola» dice más que «Bebidas»). 1.er match gana.
const PISTAS_POR_NOMBRE: Array<[RegExp, LucideIcon]> = [
  [/torta|keke|tiramisu|brownie|pastel|cupcake|cheesecake|alfajor/, CakeSlice],
  [/helado|yamboly|marciano|paleta/, IceCreamCone],
  [/cerveza|pilsen|cusquena|corona|vino|pisco|\bron\b|whisky|trago|licor/, Beer],
  [/cafe|instantaneo|nescaf|\bte\b|infusion|emoliente/, Coffee],
  [/gaseosa|kola|\bcola\b|sprite|fanta|pepsi|guarana|7 ?up/, CupSoda],
  [/agua|jugo|refresco|chicha|limonada|bebida|gatorade|frugos/, GlassWater],
  [/pollo|brasa|alita|pierna|presa|broaster/, Drumstick],
  [/pizza|calzone/, Pizza],
  [/hamburgues|sandwich|hot ?dog|salchipapa|shawarma|butifarra/, Sandwich],
  [/arroz|fideo|spaghetti|tallarin|harina|avena|quinua|trigo|menestra|lenteja/, Wheat],
  [/golosina|caramelo|chupetin|chicle|gomita|chocolate|sublime/, Candy],
  [/galleta|snack|papitas|chizito|cheetos|piqueo|chifle|doritos|lays/, Cookie],
  [/\bpan\b|croissant|bizcocho|empanada/, Croissant],
  [/leche|yogur|queso|mantequilla|manjar|huevo/, Milk],
  [/carne|\bres\b|cerdo|chuleta|bistec|lomo|molida|chorizo/, Beef],
  [/pescado|paiche|doncella|trucha|atun|sardina|conserva/, Fish],
  [/manzana|platano|fruta|naranja|papaya|pina|mango|palta/, Apple],
  [/zanahoria|verdura|lechuga|tomate|cebolla|\bpapa\b|culantro/, Carrot],
  [/detergente|lejia|jabon|limpia|lavavajilla|desinfect|suavizante/, SprayCan],
  [/madera|tabla|tornillo|clavo|cemento|fierro|herramienta|aserrad|triplay/, Hammer],
  [/cargador|maquinaria|excavadora|volquete|tractor|camion/, Truck],
  [/almuerzo|menu|combo|plato|ceviche|cebiche|guiso|chaufa/, ChefHat],
];

/** El glifo más específico: nombre → categoría → familia. */
function glifoDe(category?: string | null, name?: string | null): LucideIcon {
  if (name) {
    const n = sinTildes(name);
    for (const [re, icon] of PISTAS_POR_NOMBRE) if (re.test(n)) return icon;
  }
  if (category) {
    const porCategoria = getProductCategoryIcon(category);
    if (porCategoria !== Package) return porCategoria;
  }
  return familiaPorId(familiaDe(category, name)).icon;
}

// Tres blobs orgánicos (viewBox 100×100). El nombre elige uno: la grilla varía
// sin colores nuevos.
const BLOBS = [
  "M58 6c18 4 34 20 35 40 1 19-9 37-27 46-19 9-43 6-56-9C-2 69 2 45 13 29 24 13 40 2 58 6Z",
  "M49 3c21-1 41 13 46 33 5 21-5 44-25 54-20 10-46 7-59-10C-1 63 1 38 15 22 24 10 36 4 49 3Z",
  "M63 8c17 8 29 26 28 45-1 20-15 38-35 41-21 4-44-6-51-26C-2 48 7 24 26 12 37 5 51 2 63 8Z",
] as const;

function blobDe(name?: string | null): string {
  let h = 0;
  for (const ch of name ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BLOBS[h % BLOBS.length];
}

export function ProductPhotoFallback({
  name,
  category,
  /** Grosor del glifo: "sm" para mini-cards (trazo un poco más grueso), "md" default. */
  size = "md",
  showName = false,
  forma = "tile",
}: {
  name?: string | null;
  category?: string | null;
  size?: "sm" | "md";
  showName?: boolean;
  /** "tile" = pozo de tarjeta (default) · "mini" = miniatura ≤ 56 px, sin motivo. */
  forma?: "tile" | "mini";
}) {
  const Icon = glifoDe(category, name);
  const mini = forma === "mini";
  const conNombre = showName && !!name && !mini;
  return (
    <div
      data-familia={familiaDe(category, name)}
      role="img"
      aria-label={name ? `${name}, sin foto` : "Producto sin foto"}
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[var(--tinte-bg)]"
    >
      {!mini && <span aria-hidden className="patron-familia" />}
      <span
        aria-hidden
        className={cn("relative grid place-items-center", mini ? "h-[84%] w-[84%]" : "h-[62%] w-[62%]", conNombre && "h-[52%] w-[52%]")}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <path d={blobDe(name)} fill="var(--tinte-blob)" />
          <ellipse
            cx="34"
            cy="27"
            rx="15"
            ry="7.5"
            transform="rotate(-28 34 27)"
            className="fill-white/50 dark:fill-white/10"
          />
        </svg>
        <Icon
          className="relative h-[64%] w-[64%] -rotate-6 text-[var(--tinte-ink)]"
          strokeWidth={size === "sm" || mini ? 1.75 : 1.5}
          aria-hidden
        />
      </span>
      {conNombre && (
        <p className="relative mt-2 line-clamp-2 max-w-[88%] text-center text-xs font-semibold leading-tight text-[var(--text-secondary)]">
          {name}
        </p>
      )}
    </div>
  );
}
