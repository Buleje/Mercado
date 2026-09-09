/**
 * «Esto que sobra, reprocesalo en lo que falta» — la sugerencia de reproceso de
 * la distribución (ADR-404, pedido de Brandon 2026-09-08).
 *
 * El caso, con sus números: en el saldo hay **comercial**, 25 piezas por 2.215
 * m³, y lo que hay que despachar son **161 paquetes de paquetería por 2.124
 * m³**. Son la misma madera con otra escuadría: pasar comercial por la sierra
 * otra vez da paquetería —más piezas, menos volumen—. Hasta ahora eso se veía
 * mirando dos tablas y haciendo la cuenta a mano.
 *
 * ## La regla dura: el volumen NUNCA crece
 *
 * Un reproceso **pierde** madera (el corte, el recorte, el aserrín). Así que
 * sólo se sugiere convertir hasta lo que hay: `convertir = min(disponible,
 * faltante)`. Si el faltante es mayor que lo disponible, la sugerencia dice
 * cuánto alcanza a cubrir y cuánto sigue faltando — nunca «sale más de lo que
 * entró», que es lo que Brandon marcó como «no tendría sentido».
 *
 * ## Dos formas de detectarlo
 *
 * 1. **Falta amparar** (`motivo: "faltante"`): hay piezas cubicadas de un tipo
 *    que ningún bloque respalda, y hay capacidad LIBRE en bloques de otro tipo.
 *    Un bloque de comercial que no ampara nada porque lo cubicado es paquetería
 *    es madera parada esperando la sierra.
 * 2. **Ya lo está amparando** (`motivo: "amparado"`): el bloque dice comercial
 *    y está respaldando piezas de paquetería. El reparto lo permite —no mira
 *    tipos salvo que se lo pidan con «Lleva sólo»— pero el papel queda
 *    afirmando que esa paquetería salió de un respaldo comercial. Eso es
 *    justamente un reproceso: hay que declararlo, o el libro y el papel dicen
 *    cosas distintas.
 *
 * Los dos se cruzan **dentro de la misma especie**: reprocesar tornillo no
 * produce cachimbo. Y nunca de un tipo hacia sí mismo.
 */

import { tipoDelBloque, type Distribucion } from "@/lib/forestal/cubicacion-reparto";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Bajo esto no hay madera que reprocesar: es ruido de coma flotante. */
const EPS = 0.0001;

/**
 * El piso para SUGERIR, en la unidad del aserradero y no en la del float.
 *
 * El reparto asigna piezas enteras, así que a un bloque casi siempre le quedan
 * unos litros libres —los de la pieza que ya no entraba—. Sugerir «reprocesá
 * 0.010 m³» es mandar diez litros de madera a la sierra: nadie lo hace, y una
 * lista con esos renglones enseña a ignorar la lista entera (la lección de los
 * siete rojos falsos por redondeo del importador CTP).
 *
 * 0.05 m³ ≈ 21 pie tablar ≈ una tabla de 2×8×10. Menos que eso no es una orden
 * de trabajo.
 */
export const MINIMO_SUGERIBLE_M3 = 0.05;

export interface BloqueOrigen {
  id: string;
  etiqueta: string;
  libreM3: number;
}

export type MotivoSugerencia = "faltante" | "amparado";

export interface SugerenciaReproceso {
  especie: string;
  /**
   * `faltante` = hay piezas sin respaldo y capacidad libre de otro tipo.
   * `amparado` = el bloque YA está respaldando piezas de otro tipo, y ese
   * reproceso hay que declararlo para que el papel diga la verdad.
   */
  motivo: MotivoSugerencia;
  /** El tipo que sobra: de acá sale la madera. */
  desdeTipo: string;
  /** El tipo que falta: a esto se convierte. */
  haciaTipo: string;
  /** Capacidad libre de los bloques de `desdeTipo`. */
  disponibleM3: number;
  /** Lo que falta amparar de `haciaTipo`. */
  faltanteM3: number;
  faltantePiezas: number;
  /** Lo que se puede convertir: nunca más de lo que hay. */
  convertirM3: number;
  /** `true` si con eso el faltante queda cubierto. */
  cubreTodo: boolean;
  /** Lo que seguiría faltando después de reprocesar. */
  restaM3: number;
  /** Lo que quedaría sin usar del origen. */
  sobraM3: number;
  /** Qué parte del origen se aprovecha (%). */
  aprovechaPct: number;
  bloques: BloqueOrigen[];
}

/**
 * Cruza lo que sobra contra lo que falta, especie por especie.
 *
 * Las sugerencias salen ordenadas por volumen convertible: la primera es la que
 * más cuadra la hoja. Un mismo origen puede aparecer para dos destinos —la
 * decisión de cuál hacer es del operario, no del cálculo—, y por eso cada línea
 * dice cuánto hay disponible, no cuánto quedaría después de la otra.
 */
export function sugerenciasDeReproceso(d: Distribucion): SugerenciaReproceso[] {
  const out: SugerenciaReproceso[] = [];

  for (const e of d.especies) {
    /* Lo que sobra, por tipo: sólo bloques cuyo tipo se conoce. Un bloque sin
       tipo declarado no puede decir en qué se convierte. */
    const libres = new Map<string, BloqueOrigen[]>();
    for (const b of e.bloques) {
      if (!(b.libreM3 > EPS)) continue;
      const tipo = tipoDelBloque(b.bloque);
      if (!tipo) continue;
      const lista = libres.get(tipo) ?? [];
      lista.push({ id: b.bloque.id, etiqueta: b.bloque.etiqueta, libreM3: r4(b.libreM3) });
      libres.set(tipo, lista);
    }
    /* Sin capacidad libre no hay nada que ofrecer para el faltante, pero el
       motivo 2 (lo que el bloque YA ampara de otro tipo) corre igual: ahí la
       capacidad está toda usada, que es justamente el caso. */
    for (const f of libres.size === 0 ? [] : e.faltante) {
      if (!(f.m3 > EPS)) continue;
      for (const [desdeTipo, bloques] of libres) {
        /* De un tipo hacia sí mismo no hay reproceso que hacer: si sobra
           comercial y falta comercial, lo que hay es capacidad sin usar y de
           eso ya avisa el diagnóstico del reparto. */
        if (mismoTipo(desdeTipo, f.label)) continue;
        const disponibleM3 = r4(bloques.reduce((a, b) => a + b.libreM3, 0));
        if (!(disponibleM3 > EPS)) continue;
        const convertirM3 = r4(Math.min(disponibleM3, f.m3));
        if (!(convertirM3 > EPS)) continue;
        out.push({
          especie: e.especie,
          motivo: "faltante",
          desdeTipo,
          haciaTipo: f.label,
          disponibleM3,
          faltanteM3: r4(f.m3),
          faltantePiezas: f.piezas,
          convertirM3,
          cubreTodo: disponibleM3 + EPS >= f.m3,
          restaM3: r4(Math.max(0, f.m3 - convertirM3)),
          sobraM3: r4(Math.max(0, disponibleM3 - convertirM3)),
          aprovechaPct: disponibleM3 > 0 ? r2((convertirM3 / disponibleM3) * 100) : 0,
          bloques,
        });
      }
    }

    /* Motivo 2: el bloque ya está amparando piezas de OTRO tipo. No hace falta
       que sobre capacidad —al contrario, acá está toda usada—: lo que falta es
       declarar el reproceso que ese respaldo está dando por hecho. */
    for (const b of e.bloques) {
      const tipo = tipoDelBloque(b.bloque);
      if (!tipo) continue;
      for (const g of b.asignado) {
        if (!(g.m3 > EPS) || mismoTipo(tipo, g.label)) continue;
        out.push({
          especie: e.especie,
          motivo: "amparado",
          desdeTipo: tipo,
          haciaTipo: g.label,
          /* Para amparar ese volumen hace falta al menos ese volumen de
             origen: el reproceso no crea madera. */
          disponibleM3: r4(g.m3),
          faltanteM3: r4(g.m3),
          faltantePiezas: g.piezas,
          convertirM3: r4(g.m3),
          cubreTodo: true,
          restaM3: 0,
          sobraM3: 0,
          aprovechaPct: 100,
          bloques: [{ id: b.bloque.id, etiqueta: b.bloque.etiqueta, libreM3: r4(b.libreM3) }],
        });
      }
    }
  }

  return out
    .filter((s) => s.convertirM3 >= MINIMO_SUGERIBLE_M3)
    .sort((a, b) => b.convertirM3 - a.convertirM3);
}

/** Dos etiquetas de tipo son la misma sin importar tildes ni mayúsculas. */
function mismoTipo(a: string, b: string): boolean {
  const norm = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return norm(a) === norm(b);
}

/** Cuántas sugerencias hay y cuánto cuadrarían — para el título del apartado. */
export function resumenDeSugerencias(s: readonly SugerenciaReproceso[]) {
  return {
    cuantas: s.length,
    /* Sin sumar el mismo origen dos veces: una sugerencia por destino puede
       repetir el bloque, y sumarlas daría un total que no existe. */
    convertibleM3: r4(
      [...new Map(s.map((x) => [`${x.especie}|${x.haciaTipo}`, x])).values()].reduce(
        (a, x) => a + x.convertirM3,
        0,
      ),
    ),
  };
}
