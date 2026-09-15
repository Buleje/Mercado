/**
 * loth-trace-umbrales — cuánta merma es tolerable **en esta especie**.
 *
 * La regla vieja era una sola para todo el bosque: «rendimiento < 40% avisa».
 * Con eso, un árbol que perdía el 52% de su volumen entre el tocón y las trozas
 * pasaba en silencio, y una especie de copa ancha (que legítimamente rinde poco)
 * quedaba marcada igual que un desvío real. La merma aceptable depende de la
 * especie y de cómo trabaja cada operador — así que es un ajuste del usuario,
 * no una constante escondida en el código.
 *
 * Dos escalones porque hay dos conversaciones distintas: `aviso` es «mirá esto»
 * y `grave` es «esto hay que explicarlo ante OSINFOR».
 *
 * Se guarda por tenant en `localStorage` (mismo patrón que la apariencia del
 * radar del CTP): es una preferencia de lectura, no un dato del libro.
 */

import { z } from "zod";

export interface UmbralMerma {
  /** Merma (%) a partir de la cual se avisa. */
  aviso: number;
  /** Merma (%) a partir de la cual el aviso es rojo. */
  grave: number;
}

export interface UmbralesMerma {
  general: UmbralMerma;
  /** Override por especie. Clave = nombre común normalizado (sin tildes, minúsculas). */
  porEspecie: Record<string, UmbralMerma>;
}

/**
 * Default: la merma tala→trozado se lleva copa, ramas, tocón y despuntes, así
 * que un 40% todavía es un árbol trabajado normal. Arriba de 55% ya no alcanza
 * con la copa para explicar la diferencia.
 */
export const UMBRALES_DEFAULT: UmbralesMerma = {
  general: { aviso: 40, grave: 55 },
  porEspecie: {},
};

export const LIMITE_UMBRAL = { min: 5, max: 95 } as const;

/** Normaliza el nombre común para que «Tornillo», «tornillo» y «TORNILLO » sean uno. */
export function normalizarEspecie(especie: string | null | undefined): string {
  return (especie ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** El umbral que le toca a una especie: el suyo si lo tiene, si no el general. */
export function umbralDe(u: UmbralesMerma, especie: string | null | undefined): UmbralMerma {
  return u.porEspecie[normalizarEspecie(especie)] ?? u.general;
}

export type VeredictoMerma = "ok" | "aviso" | "grave";

/** Dónde cae una merma contra su umbral. `grave` gana a `aviso`. */
export function veredictoMerma(mermaPct: number, umbral: UmbralMerma): VeredictoMerma {
  if (mermaPct >= umbral.grave) return "grave";
  if (mermaPct >= umbral.aviso) return "aviso";
  return "ok";
}

/** Acota un umbral escrito a mano y mantiene `grave ≥ aviso`. */
export function acotarUmbral(u: Partial<UmbralMerma>, base: UmbralMerma = UMBRALES_DEFAULT.general): UmbralMerma {
  const clamp = (v: number | undefined, fallback: number) =>
    Number.isFinite(v) ? Math.min(LIMITE_UMBRAL.max, Math.max(LIMITE_UMBRAL.min, Math.round(v as number))) : fallback;
  const aviso = clamp(u.aviso, base.aviso);
  const grave = clamp(u.grave, base.grave);
  return { aviso, grave: Math.max(aviso, grave) };
}

// ─── persistencia (preferencia de lectura, por tenant) ───────────────────────

const UMBRAL_SCHEMA = z.object({ aviso: z.number(), grave: z.number() });
const ESQUEMA = z.object({
  general: UMBRAL_SCHEMA,
  porEspecie: z.record(z.string(), UMBRAL_SCHEMA).optional(),
});

function clave(): string {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* storage bloqueado (modo privado): se usa el default */
  }
  return `buleje-loth-umbrales-merma-${slug}`;
}

export function leerUmbrales(): UmbralesMerma {
  if (typeof window === "undefined") return UMBRALES_DEFAULT;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(clave());
  } catch {
    return UMBRALES_DEFAULT;
  }
  if (!raw) return UMBRALES_DEFAULT;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return UMBRALES_DEFAULT;
  }
  const p = ESQUEMA.safeParse(json);
  if (!p.success) return UMBRALES_DEFAULT;
  const porEspecie: Record<string, UmbralMerma> = {};
  const general = acotarUmbral(p.data.general);
  for (const [especie, u] of Object.entries(p.data.porEspecie ?? {})) {
    porEspecie[normalizarEspecie(especie)] = acotarUmbral(u, general);
  }
  return { general, porEspecie };
}

export function guardarUmbrales(u: UmbralesMerma): void {
  try {
    localStorage.setItem(clave(), JSON.stringify(u));
  } catch {
    /* quota o storage bloqueado: la sesión sigue con los umbrales elegidos */
  }
}
