/**
 * cubicacion-reparto-diagnostico — POR QUÉ un bloque quedó con volumen libre,
 * y QUÉ medidas habría que ponerle para cerrarlo.
 *
 * Nace de una fricción concreta (Brandon, 2026-09-02): cargó bloques que
 * coincidían en volumen y cantidad con lo aserrado, y la pantalla igual avisaba
 * «5.232 m³ de capacidad quedaron libres · 5.232 m³ de lo aserrado no tienen
 * bloque que los ampare». Los dos números IGUALES no son casualidad: el bloque
 * y la madera no se cruzaban —el bloque estaba cargado con otra especie, o sin
 * especie—, así que su capacidad entera quedó libre y la madera entera sin
 * amparar. La alerta decía QUÉ pasaba pero no POR QUÉ, y sin el porqué no hay
 * nada que corregir.
 *
 * Este módulo mira la distribución YA calculada y explica cada hueco:
 *
 * · `otra-especie`   — el bloque es de X y lo que falta es de Y. Se arregla
 *                      cambiando la especie del bloque (o cargando uno de Y).
 * · `filtro-grupo`   — el bloque dice «sólo Comercial» y lo que falta es Corta.
 * · `filtro-largo`   — el bloque está fijado a ciertos largos.
 * · `tope-piezas`    — llegó al tope de piezas declarado a mano; le sobra volumen.
 * · `no-entra`       — lo que falta no cabe en el hueco ni de a una pieza: es el
 *                      residuo honesto de repartir piezas ENTERAS.
 * · `sin-faltante`   — no falta nada por amparar: entró más capacidad de la que
 *                      se aserró. No es un error, es rolliza para la próxima.
 * · `piezas-de-mas`  — el m³ del bloque ya cerró, pero declaró más PIEZAS de
 *                      las que se le pudieron ubicar. Volumen y conteo tienen
 *                      que cerrar los dos («ver si resta o queda»).
 * · `pasado`         — el bloque ampara unos litros MÁS de lo que declaró,
 *                      porque si no una pieza real quedaba fuera de todo papel.
 *                      No es un error: es el aviso de la diferencia.
 *
 * Y en los casos que se pueden cerrar, dice con QUÉ: las medidas concretas y
 * cuántas piezas de cada una entran en ese hueco, calculadas con el mismo motor
 * del reparto (`medidasQueEntran`), no a ojo.
 *
 * PURO y client-safe: sin React, sin fetch, sin DOM.
 */

import {
  gruposAdmitidos, medidasQueEntran, sanearFiltroLargo,
  type BloqueDistribuido, type Distribucion, type EspecieDistribucion, type FaltanteGrupo,
} from "./cubicacion-reparto";
import { toFeet, type Unidad } from "./cubicacion";
import type { DimensionResumen } from "./cubicacion-resumen";

/** Debajo de esto, el hueco es redondeo del % aprovechable y no madera real. */
export const HUECO_MIN_M3 = 0.05;

export type CausaHueco =
  | "otra-especie"
  | "filtro-grupo"
  | "filtro-largo"
  | "tope-piezas"
  | "no-entra"
  | "sin-faltante"
  | "piezas-de-mas"
  | "pasado";

/** Una medida concreta que entraría en el hueco, con cuántas piezas. */
export interface MedidaSugerida {
  medida: string;
  piezas: number;
  m3: number;
  /** El grupo de la vista vigente (Comercial, Corta…) del que sale. */
  grupo: string;
  /** Especie de esa madera — distinta a la del bloque en `otra-especie`. */
  especie: string;
}

export interface HuecoBloque {
  bloqueId: string;
  etiqueta: string;
  /** Especie con la que está cargado el bloque ("Sin especie" si no se declaró). */
  especie: string;
  libreM3: number;
  /** Piezas del conteo declarado que quedaron sin ubicar (`null` = no declaró). */
  piezasLibres: number | null;
  causa: CausaHueco;
  /** Qué está pasando, en una línea que se pueda leer en el patio. */
  detalle: string;
  /** Qué hacer para cerrarlo. Vacío cuando no hay nada que corregir. */
  accion: string;
  /** Medidas que entrarían si se destraba (vacío en `no-entra`/`sin-faltante`). */
  sugerencia: MedidaSugerida[];
  /** m³ que cerrarían esas medidas. */
  sugeridoM3: number;
}

export interface DiagnosticoReparto {
  huecos: HuecoBloque[];
  /** Lo que se recuperaría aplicando TODAS las sugerencias. */
  recuperableM3: number;
  /** Hueco que ninguna sugerencia cierra (residuo por pieza entera, o sobra real). */
  irrecuperableM3: number;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Medidas del faltante de una especie, en la forma que espera `medidasQueEntran`. */
function candidatasDe(esp: EspecieDistribucion): {
  clave: string; medida: string; m3Unit: number; piezas: number; grupo: string; especie: string;
}[] {
  const out: { clave: string; medida: string; m3Unit: number; piezas: number; grupo: string; especie: string }[] = [];
  for (const f of esp.faltante) {
    for (const m of f.medidas) {
      if (m.piezas <= 0 || m.m3 <= 0) continue;
      out.push({
        clave: `${f.clave}|${m.clave}`,
        medida: m.medida,
        m3Unit: m.m3 / m.piezas,
        piezas: m.piezas,
        grupo: f.label,
        especie: esp.especie,
      });
    }
  }
  return out;
}

/** ¿Este grupo del faltante lo admite el bloque, con la vista vigente? */
function grupoAdmitido(b: BloqueDistribuido, f: FaltanteGrupo, dim: DimensionResumen): boolean {
  const ok = gruposAdmitidos(b.bloque, dim);
  return !ok || ok.has(f.clave);
}

/** ¿Alguna medida del faltante pasa el filtro de largos del bloque? */
function largoAdmitido(b: BloqueDistribuido, esp: EspecieDistribucion): boolean {
  const filtro = sanearFiltroLargo(b.bloque.largoFiltro);
  if (!filtro) return true;
  for (const f of esp.faltante) {
    for (const m of f.medidas) {
      if (m.piezas <= 0) continue;
      const pies = toFeet(m.largo, m.uLargo as Unidad);
      if (filtro.some((x) => Math.abs(pies - x.largo) < 0.05)) return true;
    }
  }
  return false;
}

/** Piezas que el bloque ya ampara (para saber si topó contra `piezasManual`). */
const piezasDelBloque = (b: BloqueDistribuido): number =>
  b.asignado.reduce((a, g) => a + g.piezas, 0);

/**
 * Explica cada bloque que quedó con capacidad libre y propone con qué cerrarlo.
 *
 * @param dim la MISMA dimensión con la que se calculó la distribución: los
 *   filtros por grupo se guardan con la clave de esa vista, y leerlos con otra
 *   diría que un filtro no aplica cuando sí (ver `gruposFiltro`).
 */
export function diagnosticarReparto(d: Distribucion, dim: DimensionResumen = "tipo"): DiagnosticoReparto {
  const huecos: HuecoBloque[] = [];

  /** Faltante de las OTRAS especies, para el caso «el bloque no cruza». */
  const faltantePorEspecie = new Map<string, ReturnType<typeof candidatasDe>>();
  for (const esp of d.especies) {
    const c = candidatasDe(esp);
    if (c.length > 0) faltantePorEspecie.set(esp.especie, c);
  }

  for (const esp of d.especies) {
    for (const b of esp.bloques) {
      const sobranPiezas = (b.piezasLibres ?? 0) > 0;
      const sePasó = b.libreM3 < 0;
      if (b.libreM3 <= HUECO_MIN_M3 && !sobranPiezas && !sePasó) continue;

      const base = {
        bloqueId: b.bloque.id,
        etiqueta: b.bloque.etiqueta,
        especie: esp.especie,
        libreM3: r4(b.libreM3),
        piezasLibres: b.piezasLibres,
      };

      /* Se pasó unos litros para no dejar una pieza real sin amparar: se avisa
         el exceso, que es exactamente lo que hay que poder ver antes de firmar. */
      if (sePasó) {
        huecos.push({
          ...base,
          causa: "pasado",
          detalle: `Ampara ${r4(-b.libreM3)} m³ más de los ${b.capacidadM3} m³ que declaró: era eso o dejar ${sobranPiezas ? "piezas" : "una pieza"} sin ningún bloque que la ampare.`,
          accion: `Si el número tiene que cerrar clavado, subí el m³ del bloque a ${r4(b.usadoM3)}.`,
          sugerencia: [],
          sugeridoM3: 0,
        });
        continue;
      }

      /* El volumen ya cerró pero el conteo no: no es un hueco de capacidad, es
         un bloque que declaró más piezas de las que se le pudieron ubicar. */
      if (b.libreM3 <= HUECO_MIN_M3) {
        huecos.push({
          ...base,
          causa: "piezas-de-mas",
          detalle:
            b.piezasLibres === 1
              ? "El m³ de este bloque ya cerró, pero quedó 1 de las piezas que declaró sin ubicar."
              : `El m³ de este bloque ya cerró, pero quedaron ${b.piezasLibres} de las piezas que declaró sin ubicar.`,
          accion: "Revisá el conteo del bloque: con ese volumen no entran más piezas.",
          sugerencia: [],
          sugeridoM3: 0,
        });
        continue;
      }

      const propias = faltantePorEspecie.get(esp.especie) ?? [];

      // ── 1) Hay faltante de la MISMA especie: algo lo está trabando ────────
      if (propias.length > 0) {
        const admitidas = propias.filter((c) => {
          const grupo = esp.faltante.find((f) => c.clave.startsWith(`${f.clave}|`));
          return grupo ? grupoAdmitido(b, grupo, dim) : true;
        });
        const tope = b.bloque.piezasManual;
        const topeAlcanzado = tope != null && Number.isFinite(Number(tope)) && piezasDelBloque(b) >= Number(tope);

        if (topeAlcanzado) {
          huecos.push(conSugerencia({
            ...base,
            causa: "tope-piezas",
            detalle: `Llegó a las ${Number(tope)} piezas declaradas a mano y le sobran ${base.libreM3} m³ de capacidad.`,
            accion: "Subí el tope de piezas del bloque (o sacalo) para que siga cargando.",
          }, sugerir(propias, b.libreM3)));
        } else if (admitidas.length === 0) {
          huecos.push(conSugerencia({
            ...base,
            causa: "filtro-grupo",
            detalle: `El bloque sólo admite ciertos grupos y lo que falta de ${esp.especie} no está entre ellos.`,
            accion: "Sacá el filtro de grupos del bloque, o mandá ese faltante a otro bloque.",
          }, sugerir(propias, b.libreM3)));
        } else if (!largoAdmitido(b, esp)) {
          huecos.push(conSugerencia({
            ...base,
            causa: "filtro-largo",
            detalle: "El bloque está fijado a ciertos largos y lo que falta no los tiene.",
            accion: "Ampliá los largos del bloque, o mandá ese faltante a otro bloque.",
          }, sugerir(propias, b.libreM3)));
        } else {
          const mas = sugerir(admitidas, b.libreM3);
          const cierra = r4(mas.reduce((a, x) => a + x.m3, 0));
          huecos.push({
            ...base,
            causa: "no-entra",
            detalle:
              cierra > 0
                ? `Entran ${cierra} m³ más en este bloque.`
                : `Ninguna pieza del faltante de ${esp.especie} entra en ${base.libreM3} m³: es el resto de repartir piezas enteras.`,
            accion: cierra > 0 ? "Revisá el orden de los bloques: hay madera que todavía entra acá." : "",
            sugerencia: mas,
            sugeridoM3: cierra,
          });
        }
        continue;
      }

      // ── 2) Sin faltante propio: ¿hay madera de otra especie esperando? ────
      const otras = [...faltantePorEspecie.entries()].filter(([e]) => e !== esp.especie);
      if (otras.length > 0) {
        const candidatas = otras.flatMap(([, c]) => c);
        const mas = sugerir(candidatas, b.libreM3);
        const cierra = r4(mas.reduce((a, x) => a + x.m3, 0));
        const nombres = [...new Set(mas.map((m) => m.especie))].join(", ") || otras.map(([e]) => e).join(", ");
        huecos.push({
          ...base,
          causa: "otra-especie",
          detalle: `Este bloque está cargado como ${esp.especie} y lo que falta amparar es de ${nombres}. Una especie no ampara a la otra, así que su capacidad queda entera sin usar.`,
          accion: `Cambiá la especie del bloque a ${nombres.split(", ")[0]} si es la misma madera, o cargá un bloque de esa especie.`,
          sugerencia: mas,
          sugeridoM3: cierra,
        });
        continue;
      }

      // ── 3) No falta nada en ningún lado: sobra capacidad, y está bien ─────
      huecos.push({
        ...base,
        causa: "sin-faltante",
        detalle: "Toda la madera ya tiene bloque que la ampare: esta capacidad queda para la próxima corrida.",
        accion: "",
        sugerencia: [],
        sugeridoM3: 0,
      });
    }
  }

  const recuperableM3 = r4(huecos.reduce((a, h) => a + h.sugeridoM3, 0));
  const irrecuperableM3 = r4(Math.max(0, huecos.reduce((a, h) => a + h.libreM3, 0) - recuperableM3));
  return { huecos, recuperableM3, irrecuperableM3 };
}

/** Cierra el hallazgo con su sugerencia y el m³ que ésta recupera. */
function conSugerencia(
  h: Omit<HuecoBloque, "sugerencia" | "sugeridoM3">,
  sugerencia: MedidaSugerida[],
): HuecoBloque {
  return { ...h, sugerencia, sugeridoM3: r4(sugerencia.reduce((a, x) => a + x.m3, 0)) };
}

/** Las medidas que entran en `cap`, ya en la forma que se muestra. */
function sugerir(
  candidatas: ReturnType<typeof candidatasDe>,
  cap: number,
): MedidaSugerida[] {
  const elegidas = medidasQueEntran(candidatas, cap);
  const porClave = new Map(candidatas.map((c) => [c.clave, c] as const));
  return elegidas.map((e) => {
    const c = porClave.get(e.clave);
    return { medida: e.medida, piezas: e.piezas, m3: e.m3, grupo: c?.grupo ?? "", especie: c?.especie ?? "" };
  });
}
