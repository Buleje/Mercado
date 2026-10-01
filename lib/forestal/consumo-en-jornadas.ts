import type { AsignacionGrupo, BloqueDistribuido } from "./cubicacion-reparto";

/**
 * consumo-en-jornadas — repartir un turno de sierra en varios días, sin partir
 * la madera en dos (ADR-373).
 *
 * El reparto de Resúmenes (`distribuirPorCapacidad`) ya dice qué piezas ampara
 * cada troza y, con `porDia`, cuánto de ESA troza cae en cada jornada. Sirve
 * para el papel, pero no para el libro: una troza **se consume una sola vez**
 * (invariante T1). Si la troza 7 apareciera en la corrida del lunes y en la del
 * martes, la segunda sería madera que ya no está — y el libro declararía dos
 * veces la misma pieza.
 *
 * Así que acá el día parte **las trozas**, no cada troza: el lunes entran unas,
 * el martes otras, y las piezas que cada una ampara viajan con ella. Es además
 * lo que pasa de verdad en el patio — una troza se termina en la jornada en la
 * que entró.
 *
 * El reparto es **LPT** (la más grande primero, al día más liviano): con trozas
 * de tamaños dispares es lo que deja las jornadas más parejas sin tener que
 * probar todas las combinaciones.
 *
 * PURA: la fecha de inicio entra por parámetro.
 */

export interface Jornada {
  /** 1…N, en el orden en que se va a aserrar. */
  dia: number;
  /** `YYYY-MM-DD` — la fecha con la que se registra esa corrida. */
  fecha: string;
  trozaIds: string[];
  /** Cómo se llaman esas trozas en el patio, para poder mostrarlas. */
  etiquetas: string[];
  /** Rolliza que entra a la sierra ese día. */
  rollizaM3: number;
  /** Lo aserrado que amparan esas trozas: es lo que se declara. */
  grupos: AsignacionGrupo[];
  piezas: number;
  pieTablar: number;
  m3: number;
}

export interface RepartoEnJornadas {
  jornadas: Jornada[];
  /**
   * Qué se ajustó, en palabras.
   *
   * `null` cuando salió tal cual se pidió. Un reparto que calla que devolvió
   * cuatro jornadas en vez de seis hace que alguien registre menos días de los
   * que cree.
   */
  aviso: string | null;
}

const redondear = (n: number, dec = 4) => {
  const f = 10 ** dec;
  return Math.round(n * f) / f;
};

/** Días CORRIDOS: en un aserradero se trabaja sábado. */
function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fechaIso;
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Suma dos listas de grupos por clave, conservando el detalle de medidas. */
function juntarGrupos(acumulado: AsignacionGrupo[], entran: AsignacionGrupo[]): AsignacionGrupo[] {
  const porClave = new Map<string, AsignacionGrupo>();
  for (const g of [...acumulado, ...entran]) {
    const previo = porClave.get(g.clave);
    if (!previo) {
      porClave.set(g.clave, { ...g, medidas: g.medidas.map((m) => ({ ...m })) });
      continue;
    }
    previo.piezas += g.piezas;
    previo.pieTablar = redondear(previo.pieTablar + g.pieTablar, 2);
    previo.m3 = redondear(previo.m3 + g.m3);
    for (const m of g.medidas) {
      const igual = previo.medidas.find((x) => x.clave === m.clave);
      if (igual) {
        igual.piezas += m.piezas;
        igual.pieTablar = redondear(igual.pieTablar + m.pieTablar, 2);
        igual.m3 = redondear(igual.m3 + m.m3);
      } else previo.medidas.push({ ...m });
    }
  }
  return [...porClave.values()];
}

export function armarJornadas(
  bloques: readonly BloqueDistribuido[],
  opciones: { dias: number; fechaInicio: string },
): RepartoEnJornadas {
  /* Sólo las trozas que efectivamente amparan algo: una tildada que no recibió
     ni una pieza no tiene por qué abrir una corrida vacía. */
  const conCarga = bloques.filter((b) => b.asignado.length > 0 && b.usadoM3 > 0);
  if (conCarga.length === 0) {
    return { jornadas: [], aviso: "Ninguna troza tildada quedó amparando producción: no hay nada que registrar." };
  }

  const pedidos = Math.max(1, Math.floor(opciones.dias));
  const cuantas = Math.min(pedidos, conCarga.length);
  const aviso =
    cuantas < pedidos
      ? `Hay ${conCarga.length} troza${conCarga.length === 1 ? "" : "s"} con producción y se pidieron ${pedidos} días: ` +
        `salieron ${cuantas} jornada${cuantas === 1 ? "" : "s"}. Una troza no se parte entre dos corridas.`
      : null;

  const jornadas: Jornada[] = Array.from({ length: cuantas }, (_, i) => ({
    dia: i + 1,
    fecha: sumarDias(opciones.fechaInicio, i),
    trozaIds: [],
    etiquetas: [],
    rollizaM3: 0,
    grupos: [],
    piezas: 0,
    pieTablar: 0,
    m3: 0,
  }));

  /* LPT: la troza más cargada primero, siempre al día que menos lleva. */
  const orden = [...conCarga].sort((a, b) => b.usadoM3 - a.usadoM3);
  for (const b of orden) {
    const destino = jornadas.reduce((menor, j) => (j.m3 < menor.m3 ? j : menor), jornadas[0]!);
    destino.trozaIds.push(b.bloque.id);
    destino.etiquetas.push(b.bloque.etiqueta);
    destino.rollizaM3 = redondear(destino.rollizaM3 + b.bloque.m3);
    destino.grupos = juntarGrupos(destino.grupos, b.asignado);
    destino.piezas += b.asignado.reduce((a, g) => a + g.piezas, 0);
    destino.pieTablar = redondear(destino.pieTablar + b.asignado.reduce((a, g) => a + g.pieTablar, 0), 2);
    destino.m3 = redondear(destino.m3 + b.usadoM3);
  }

  return { jornadas, aviso };
}
