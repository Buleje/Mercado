/**
 * «Qué DICE la guía hoy» para una solicitud de corrección (ADR-512).
 *
 * Funciones PURAS: reciben la guía ya armada por el servidor (la MISMA entrada
 * que imprime la hoja SERFOR: `CuerpoGtfInput` + la lista de trozas) y
 * devuelven, por cada cambio pedido, su etiqueta y lo que la hoja tiene en ese
 * casillero o fila. El navegador nunca llena `dice`.
 *
 * Claves:
 *   · casillero → el número del formato 2024 que se ve en el papel («12»,
 *     «28», «34a»; con o sin paréntesis). Uno que el formato no tiene es error.
 *   · item → la troza por el código que sale en la lista, su código único del
 *     libro o su id; el renglón de una guía de salida del CTP por «Línea #N»
 *     (`claveLineaCtp`) o el id del despacho. Una fila que la guía no trae es
 *     error (`item_desconocido`), igual que un casillero que el formato no
 *     tiene: «falta la troza 15» se pide en el motivo, no inventando la fila.
 */
import {
  CASILLEROS_GTF_2024,
  casillerosGtf,
  detalleGtf,
  type CuerpoGtfInput,
  type FuenteGtf2024,
  type LineaProducto,
} from "@/lib/forestal/ctp-gtf-formato";
import { celdasTroza } from "@/lib/forestal/ctp-lista-trozas";
import type { FilaListaTrozas } from "@/lib/forestal/loth-guia-despacho";
import { claveLineaCtp, type CambioPedido, type CambioResuelto } from "./correccion-guia";

/** Un casillero de la hoja: su rótulo con número y lo que imprime (null = en blanco). */
export interface CasilleroLeido {
  etiqueta: string;
  dice: string | null;
}

/** Una fila de la lista de la guía (troza o producto). */
export interface FilaLeida {
  /** Código como sale en el papel. */
  clave: string;
  /** Otros códigos con los que se la puede nombrar (el código único del libro). */
  alias: string[];
  etiqueta: string;
  dice: string;
}

/** La guía lista para resolver cambios: número, fecha, casilleros y filas. */
export interface GuiaLeida {
  numero: string;
  /** YYYY-MM-DD o null. */
  fecha: string | null;
  casilleros: ReadonlyMap<string, CasilleroLeido>;
  filas: readonly FilaLeida[];
}

const limpio = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** «(12)», « 12 », «34A» → «12», «34a». */
export function normalizarCasillero(clave: string): string {
  return clave.trim().replace(/^\(\s*|\s*\)$/g, "").trim().toLowerCase();
}

/** «línea  #12 » ≡ «Línea #12»; «12a» ≡ «12A». */
const normalizarCodigo = (c: string): string => c.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Cada casillero del formato 2024 con lo que imprime la hoja. Mismo cálculo que
 * `cuerpoGtfOficial` (las fuentes de `de` unidas por « / »); el detalle (34a)–(34g)
 * junta sus renglones con « | » y el (34h) es el total movilizado.
 */
export function casillerosDeLaHoja(cuerpo: CuerpoGtfInput): Map<string, CasilleroLeido> {
  const base = casillerosGtf(cuerpo);
  const detalle = detalleGtf(cuerpo.lineas);
  const columna = (k: keyof (typeof detalle.filas)[number]): string =>
    detalle.filas.map((f) => limpio(f[k])).filter(Boolean).join(" | ");
  const valor = (k: FuenteGtf2024): string => {
    if (k === "numeroGtf") return limpio(cuerpo.numeroGtf);
    if (k === "volumenTotal") return limpio(detalle.total);
    if (k.startsWith("37")) return columna(k as keyof (typeof detalle.filas)[number]);
    return limpio((base as Record<string, string>)[k]);
  };
  const out = new Map<string, CasilleroLeido>();
  for (const c of CASILLEROS_GTF_2024) {
    const fuentes: readonly FuenteGtf2024[] = "de" in c ? c.de : [];
    const dice = fuentes.map(valor).filter(Boolean).join(" / ");
    out.set(c.n.toLowerCase(), { etiqueta: `(${c.n}) ${c.rotulo}`, dice: dice || null });
  }
  return out;
}

/** «Cedro · Troza · D1 0,45 · D2 0,42 · L 4,20 m · 1 · 0,612 m³» — la fila como sale en la lista. */
export function filaDeTroza(f: FilaListaTrozas, alias: readonly string[] = []): FilaLeida {
  const c = celdasTroza(f);
  const partes = [
    limpio(f.especieComun),
    limpio(f.producto),
    c.d1 ? `D1 ${c.d1}` : "",
    c.d2 ? `D2 ${c.d2}` : "",
    c.largo ? `L ${c.largo} m` : "",
    c.cant ? `${c.cant} pza` : "",
    c.vol ? `${c.vol} m³` : "",
  ].filter(Boolean);
  const clave = limpio(f.codificacion);
  return {
    clave,
    alias: alias.map(limpio).filter((a) => a && a !== clave),
    etiqueta: `Troza ${clave}`,
    dice: partes.join(" · "),
  };
}

/**
 * Un renglón del detalle (34) de la guía de salida del CTP, con los textos que
 * imprime la hoja (`detalleGtf`): especie (binomio), producto, presentación,
 * cantidad y total. `juntoCon` = otras líneas del libro que el papel suma en el
 * mismo renglón (misma especie, producto y unidad).
 */
export function filaDeLineaCtp(
  linea: { lineNo: number; despachoId: string; producto: LineaProducto },
  juntoCon: readonly number[] = [],
): FilaLeida {
  const f = detalleGtf([linea.producto]).filas[0];
  const especie = f ? [limpio(f["37b"]), limpio(f["37a"]) ? `(${limpio(f["37a"])})` : ""].filter(Boolean).join(" ") : "";
  const partes = f
    ? [
        especie,
        limpio(f["37c"]),
        limpio(f["37d"]) ? `presentación ${limpio(f["37d"])}` : "",
        limpio(f["37e"]) ? `cantidad ${limpio(f["37e"])}` : "",
        limpio(f["37g"]) ? `total ${limpio(f["37g"])} ${limpio(f["37f"])}`.trim() : "",
        juntoCon.length ? `en la hoja va sumada con ${juntoCon.map((n) => `la línea #${n}`).join(" y ")}` : "",
      ].filter(Boolean)
    : [];
  const clave = claveLineaCtp(linea.lineNo);
  return { clave, alias: [linea.despachoId], etiqueta: clave, dice: partes.join(" · ") };
}

export type ResolverCambiosResultado =
  | { ok: true; cambios: CambioResuelto[] }
  | { ok: false; error: "casillero_desconocido" | "item_desconocido"; clave: string };

/**
 * Cambios pedidos → cambios con lo que la guía DICE. Lo único que pasa del
 * pedido es `donde`/`clave`/`correcto`; `etiqueta` y `dice` salen de `guia`.
 */
export function resolverCambios(guia: GuiaLeida, cambios: readonly CambioPedido[]): ResolverCambiosResultado {
  const porCodigo = new Map<string, FilaLeida>();
  for (const f of guia.filas) {
    for (const k of [f.clave, ...f.alias]) {
      const n = normalizarCodigo(k);
      if (n && !porCodigo.has(n)) porCodigo.set(n, f);
    }
  }
  const out: CambioResuelto[] = [];
  for (const c of cambios) {
    const base = { donde: c.donde, clave: c.clave, correcto: c.correcto };
    if (c.donde === "casillero") {
      const cas = guia.casilleros.get(normalizarCasillero(c.clave));
      if (!cas) return { ok: false, error: "casillero_desconocido", clave: c.clave };
      out.push({ ...base, etiqueta: cas.etiqueta, dice: cas.dice });
    } else {
      const fila = porCodigo.get(normalizarCodigo(c.clave));
      if (!fila) return { ok: false, error: "item_desconocido", clave: c.clave };
      out.push({ ...base, etiqueta: fila.etiqueta, dice: fila.dice || null });
    }
  }
  return { ok: true, cambios: out };
}
