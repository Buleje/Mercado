/**
 * «Lotes que puedes armar»: el patio agrupado en lotes listos para crear.
 *
 * Hoy el patio de Blas tiene 84 trozas y ninguna en un lote (medido el
 * 2026-09-27). Armar cada lote a mano pide elegir permiso, especie y después
 * tildar pieza por pieza en Consumos. Acá se propone un lote por cada
 * **especie + permiso** con la madera que ya se puede aserrar, y la pantalla
 * sólo aprieta «Crear lote».
 *
 * ## Por qué especie Y permiso
 *
 * Un lote es de UNA especie (L-A1, la sierra se calibra por especie) y de UN
 * título habilitante (ADR-393, la corrida tiene que poder decir de qué permiso
 * salió su madera). Proponer sólo por especie armaría lotes que el escritor
 * (`ForestLoteAserrioDB.agregarTrozas`) rechazaría a la mitad.
 *
 * El permiso se compara **tal cual está escrito** (sólo `trim`), igual que el
 * escritor: juntar dos grafías del mismo código acá armaría un lote que después
 * rechaza las piezas de la otra grafía. La especie, en cambio, por
 * `claveEspecie` — la misma función del escritor, que acepta «Tornillo» y
 * «TORNILLO» en el mismo lote.
 *
 * ## Qué entra y qué no
 *
 * No decide la elegibilidad: la recibe hecha (`estado`), porque la regla vive
 * en el servidor (`motivoNoElegible`, `lib/db/forest-lote-aserrio.db.ts`) y
 * copiarla acá es cómo la pantalla y el POST terminan discrepando. Lo que sí
 * hace es CONTAR lo que queda afuera, para decirlo:
 *   · `espera-guia`: la madera que entra cuando recibas su guía.
 *   · sin especie: no se puede armar un lote sin nombre de madera.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { pieTablarAserrableDe } from "./cubicacion";
import { grafiaPreferida } from "./especies-catalogo";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";

/**
 * Cómo llega cada troza, ya decidida por el servidor:
 *  · `elegible`    — puede ir a un lote hoy;
 *  · `espera-guia` — lo único que falta es recibir su guía en Ingresos;
 *  · `fuera`       — no va (en un lote mixto, no llegó, madre retrozada…).
 */
export type EstadoParaLote = "elegible" | "espera-guia" | "fuera";

export interface TrozaParaPropuesta {
  id: string;
  especieComun: string | null;
  especieCientifica: string | null;
  /** (6) N° del título habilitante, del INGRESO — la misma fuente que el escritor. */
  permiso: string | null;
  /** A nombre de quién está el permiso (contrato o, si no, el proveedor de la guía). */
  titular: string | null;
  volumenM3: number | null;
  gtfNumber: string | null;
  estado: EstadoParaLote;
}

export interface PropuestaDeLote {
  /** Identidad estable de la propuesta: especie normalizada + permiso. */
  clave: string;
  /** El nombre con el que nace el lote: la grafía más usada de esa especie. */
  especie: string;
  especieCientifica: string | null;
  /** `null` = las trozas no traen permiso; el lote nace sin permiso («todos»). */
  permiso: string | null;
  titular: string | null;
  trozas: number;
  m3: number;
  /**
   * Pie tablar ≈ ASERRABLE al 56 % (madera rolliza). No es `m³ × 424`: eso es
   * para madera ya aserrada y daba casi el doble para la misma pila. Se muestra
   * siempre con «≈» y «aserr.».
   */
  ptAserrable: number;
  /** Las piezas que la propuesta ofrece. El servidor las vuelve a validar al crear. */
  trozaIds: string[];
}

export interface PropuestasDelPatio {
  propuestas: PropuestaDeLote[];
  /** La madera que entra cuando recibas su guía. */
  esperanGuia: { trozas: number; m3: number; guias: number };
  /** Elegibles pero sin especie: no se arma un lote sin nombre de madera. */
  sinEspecie: { trozas: number; m3: number };
  /**
   * Elegibles pero su guía no dice el permiso: un lote sin permiso después
   * acepta trozas de cualquier título (ADR-393), así que no se propone. Se
   * arregla poniéndole el permiso a la guía en Ingresos.
   */
  sinPermiso: { trozas: number; m3: number };
}

/* ── Lo que va y vuelve al crear (lo comparten el servidor y la pantalla) ── */

export interface PedidoDeLote {
  especie: string;
  permiso: string | null;
  /** Lo que la pantalla mostró. Acota; nunca agrega piezas que el servidor no ofrece. */
  trozaIds?: string[];
}

export interface TrozaQueNoEntro {
  id: string;
  codigo: string | null;
  motivo: string;
}

export interface LoteCreadoDesdePropuesta {
  loteId: string;
  code: string;
  especie: string;
  permiso: string | null;
  trozas: number;
  m3: number;
  noEntraron: TrozaQueNoEntro[];
}

export interface PropuestaQueNoSeCreo {
  especie: string;
  permiso: string | null;
  motivo: string;
}

export interface ResultadoCrearLotes {
  creados: LoteCreadoDesdePropuesta[];
  noCreados: PropuestaQueNoSeCreo[];
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const texto = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t || null;
};

/**
 * La clave de una propuesta. La usan el GET (para armarla) y el POST (para
 * encontrarla otra vez): si las dos puntas la calcularan distinto, «Crear»
 * nunca encontraría lo que la pantalla ofreció.
 */
export function claveDePropuesta(especie: string | null | undefined, permiso: string | null | undefined): string {
  return `${claveEspecie(especie)}|${texto(permiso) ?? ""}`;
}

/** El valor más repetido; empate → alfabético, para que no cambie entre cargas. */
function masRepetido(valores: readonly (string | null)[]): string | null {
  const cuenta = new Map<string, number>();
  for (const v of valores) {
    const t = texto(v);
    if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  return (
    [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0]?.[0] ?? null
  );
}

/**
 * Agrupa las trozas elegibles por especie + permiso y cuenta lo que queda
 * afuera. Ordenadas por volumen: primero el lote que más madera mueve.
 */
export function proponerLotes(trozas: readonly TrozaParaPropuesta[]): PropuestasDelPatio {
  const grupos = new Map<string, TrozaParaPropuesta[]>();
  const esperan = { trozas: 0, m3: 0, guias: new Set<string>() };
  const sinEspecie = { trozas: 0, m3: 0 };
  const sinPermiso = { trozas: 0, m3: 0 };

  for (const t of trozas) {
    const m3 = Number(t.volumenM3 ?? 0);
    if (t.estado === "espera-guia") {
      esperan.trozas += 1;
      esperan.m3 += m3;
      esperan.guias.add(texto(t.gtfNumber) ?? `sin-guia:${t.id}`);
      continue;
    }
    if (t.estado !== "elegible") continue;
    if (!claveEspecie(t.especieComun)) {
      sinEspecie.trozas += 1;
      sinEspecie.m3 += m3;
      continue;
    }
    if (!texto(t.permiso)) {
      sinPermiso.trozas += 1;
      sinPermiso.m3 += m3;
      continue;
    }
    const clave = claveDePropuesta(t.especieComun, t.permiso);
    const g = grupos.get(clave);
    if (g) g.push(t);
    else grupos.set(clave, [t]);
  }

  const propuestas = [...grupos.entries()].map(([clave, filas]): PropuestaDeLote => {
    const grafias = new Map<string, number>();
    for (const f of filas) {
      const n = texto(f.especieComun);
      if (n) grafias.set(n, (grafias.get(n) ?? 0) + 1);
    }
    const m3 = r4(filas.reduce((a, f) => a + Number(f.volumenM3 ?? 0), 0));
    return {
      clave,
      especie: grafiaPreferida([...grafias.entries()].map(([t, usos]) => ({ texto: t, usos }))),
      especieCientifica: masRepetido(filas.map((f) => f.especieCientifica)),
      permiso: texto(filas[0]?.permiso),
      titular: masRepetido(filas.map((f) => f.titular)),
      trozas: filas.length,
      m3,
      ptAserrable: pieTablarAserrableDe(m3, RENDIMIENTO_META),
      trozaIds: filas.map((f) => f.id),
    };
  });

  propuestas.sort(
    (a, b) => b.m3 - a.m3 || b.trozas - a.trozas || a.especie.localeCompare(b.especie, "es"),
  );

  return {
    propuestas,
    esperanGuia: { trozas: esperan.trozas, m3: r4(esperan.m3), guias: esperan.guias.size },
    sinEspecie: { trozas: sinEspecie.trozas, m3: r4(sinEspecie.m3) },
    sinPermiso: { trozas: sinPermiso.trozas, m3: r4(sinPermiso.m3) },
  };
}
