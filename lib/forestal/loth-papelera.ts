/**
 * Papelera del Libro TH (ADR-535, 04-11-2026, Brandon: «mejora mi panel, integra
 * funciones»). Borrar una línea del LO-TH es soft-delete (`deletedAt`): la fila
 * sigue en la base, pero ninguna pantalla la mostraba ni la devolvía. Medido en
 * Blas: 60 líneas borradas en 3 momentos (28-09 y dos el 07-10, 44 de ellas en
 * dos borrados en bloque) y ningún camino para recuperar una sola.
 *
 * Este módulo es la parte pura: cómo se agrupan los borrados para mostrarlos
 * («07/10 09:34 · 44 líneas · por blasadmin»), en qué orden se recuperan (de la
 * FUENTE a la salida: la tala antes que su trozado, el trozado antes que su
 * despacho — al revés que el borrado) y el contrato de la respuesta.
 *
 * Recuperar NO es «des-borrar» a ciegas: cada línea vuelve a pasar las MISMAS
 * reglas que un alta nueva (T1–T9, mes cerrado, plan vivo) contra el libro de
 * HOY. Lo que pasó después del borrado manda: si el árbol ya se taló con otra
 * línea, la vieja no vuelve (eso lo decide `ForestLothDB.recuperarLineas`).
 */

import type { LothSection } from "@/lib/forestal/loth-constants";
import { ORDEN_DE_BORRADO } from "@/lib/forestal/loth-borrar-del-plan";

/** Cuántas borradas muestra la papelera (las más recientes); el total sale aparte. */
export const MAX_LINEAS_A_RECUPERAR = 2000;

/**
 * Tope por pedido de recupero. El borrado en bloque más grande medido fue de 44
 * líneas; si el lote no pasa, se juzgan de a una (~10 consultas cada una) y
 * todo va en UNA transacción: 300 entra holgado en el minuto de la tx y en los
 * 300 s de la función (`vercel.json`).
 */
export const MAX_LINEAS_POR_RECUPERO = 300;

/** De la fuente a la salida: lo que depende de otra línea vuelve después. */
export const ORDEN_DE_RECUPERO: readonly LothSection[] = [...ORDEN_DE_BORRADO].reverse();

/**
 * Dos borrados separados por menos que esto se muestran como UNO: «borrar los
 * despachos y después los trozados» a un minuto es la misma limpieza (Blas
 * 07-10: 09:34 y 09:35). Más que esto, son decisiones distintas.
 */
export const PAUSA_ENTRE_BORRADOS_MS = 120_000;

/** Margen para atar un borrado con su evento de auditoría (quién lo hizo). */
const MARGEN_EVENTO_MS = 60_000;

export interface LineaBorradaDTO {
  id: string;
  section: LothSection;
  lineNo: number;
  /** Fecha de la actividad (date-only, ISO a medianoche UTC). */
  entryDate: string;
  /** Cuándo se borró (ISO). */
  deletedAt: string;
  status: string;
  /** Troza, árbol o producto: lo que la identifica en su sección. */
  codigo: string | null;
  speciesCommon: string | null;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
  gtfNumber: string | null;
  planId: string | null;
}

/** Un «loth_linea_delete» de la auditoría: de ahí sale quién borró. */
export interface EventoDeBorrado {
  createdAt: string;
  user: string;
}

export interface SeccionDelBorrado {
  section: LothSection;
  n: number;
  /** Volumen de las registradas (las anuladas no suman en ningún saldo). */
  m3: number;
}

export interface BorradoDelLibro {
  /** El `deletedAt` más reciente del grupo: clave estable para la lista. */
  clave: string;
  desde: string;
  hasta: string;
  /** Usuarios de la auditoría en esa ventana («blasadmin»), o null si no hay rastro. */
  por: string | null;
  lineas: LineaBorradaDTO[];
  porSeccion: SeccionDelBorrado[];
  m3: number;
}

export type MotivoNoRecupera = "mes_cerrado" | "plan_de_baja" | "guia_anulada" | "fuente_no_volvio" | "regla_del_libro";

export const MOTIVO_NO_RECUPERA_TEXTO: Record<MotivoNoRecupera, string> = {
  mes_cerrado: "su mes está cerrado (reábrelo primero)",
  plan_de_baja: "su plan de manejo está dado de baja",
  guia_anulada: "su guía de transporte está anulada o borrada",
  fuente_no_volvio: "su tala o su trozado se quedó en la papelera",
  regla_del_libro: "hoy rompería una regla del libro",
};

export interface LineaNoRecuperada {
  id: string;
  section: LothSection;
  lineNo: number;
  codigo: string | null;
  motivo: MotivoNoRecupera;
  /** El texto exacto de la regla (el mismo 422 que daría registrarla hoy). */
  mensaje: string;
}

export interface ResultadoRecuperar {
  simulado: boolean;
  pedidas: number;
  /** Ids que no son líneas borradas de este negocio (o ya se recuperaron). */
  ignoradas: number;
  recuperadas: number;
  m3: number;
  porSeccion: { section: LothSection; recuperadas: number; m3: number }[];
  noRecuperadas: LineaNoRecuperada[];
  /** Árboles del censo que vuelven a «talado» con su tala recuperada (sólo al escribir). */
  arbolesTalados: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const rango = (s: LothSection) => {
  const i = ORDEN_DE_RECUPERO.indexOf(s);
  return i < 0 ? ORDEN_DE_RECUPERO.length : i;
};

/** De la fuente a la salida; dentro de la sección, por N° de línea. */
export function ordenarParaRecuperar<T extends { section: LothSection; lineNo: number }>(xs: readonly T[]): T[] {
  return [...xs].sort((a, b) => rango(a.section) - rango(b.section) || a.lineNo - b.lineNo);
}

/**
 * Agrupa las líneas borradas por momento (los más recientes primero) y le pone
 * a cada grupo quién borró, si la auditoría tiene un borrado en esa ventana.
 */
export function agruparBorrados(
  lineas: readonly LineaBorradaDTO[],
  eventos: readonly EventoDeBorrado[] = [],
): BorradoDelLibro[] {
  const ms = (iso: string) => new Date(iso).getTime();
  const orden = [...lineas]
    .filter((l) => Number.isFinite(ms(l.deletedAt)))
    .sort((a, b) => ms(b.deletedAt) - ms(a.deletedAt) || a.lineNo - b.lineNo);

  const grupos: LineaBorradaDTO[][] = [];
  for (const l of orden) {
    const actual = grupos[grupos.length - 1];
    const ultima = actual?.[actual.length - 1];
    if (actual && ultima && ms(ultima.deletedAt) - ms(l.deletedAt) <= PAUSA_ENTRE_BORRADOS_MS) actual.push(l);
    else grupos.push([l]);
  }

  return grupos.map((g) => {
    const hasta = g[0].deletedAt;
    const desde = g[g.length - 1].deletedAt;
    const ini = ms(desde) - MARGEN_EVENTO_MS;
    const fin = ms(hasta) + MARGEN_EVENTO_MS;
    const usuarios = [
      ...new Set(
        eventos
          .filter((e) => {
            const t = ms(e.createdAt);
            return Number.isFinite(t) && t >= ini && t <= fin && e.user?.trim();
          })
          .map((e) => e.user.trim()),
      ),
    ];
    const porSeccion = new Map<LothSection, SeccionDelBorrado>();
    for (const l of g) {
      const s = porSeccion.get(l.section) ?? { section: l.section, n: 0, m3: 0 };
      porSeccion.set(l.section, s);
      s.n += 1;
      if (l.status === "registrado") s.m3 = r4(s.m3 + (l.volumeM3 ?? 0));
    }
    const secciones = ordenarParaRecuperar([...porSeccion.values()].map((s) => ({ ...s, lineNo: 0 }))).map(
      ({ section, n, m3 }) => ({ section, n, m3 }),
    );
    return {
      clave: hasta,
      desde,
      hasta,
      por: usuarios.length > 0 ? usuarios.join(", ") : null,
      lineas: ordenarParaRecuperar(g),
      porSeccion: secciones,
      m3: r4(secciones.reduce((a, s) => a + s.m3, 0)),
    };
  });
}

/**
 * ¿Lo borró una limpieza de datos de PRUEBA? (Blas 28-09: «claude-limpieza-qa-…»,
 * 8 líneas sembradas para probar). La pantalla lo avisa: devolverlas metería
 * pruebas en el libro que mira OSINFOR.
 */
export const esLimpiezaDePruebas = (por: string | null | undefined): boolean => /limpieza/i.test(por ?? "");

/** La clave con que una hija busca a su fuente: sin espacios y en mayúsculas (como el candado del árbol). */
export const claveDeCodigo = (c: string | null | undefined): string | null => c?.trim().toUpperCase() || null;

/**
 * Hijas que NO pueden volver porque su fuente se quedó en la papelera: el
 * trozado de una tala que no volvió (por T9, DMC, mes cerrado…) o la salida de
 * un trozado que no volvió. El borrado arrastra a las hijas; el regreso también
 * tiene que hacerlo — si no, queda una troza en el libro con su tala borrada.
 * Si la fuente ya está viva en el libro (otra línea del mismo árbol o troza),
 * la hija sí vuelve: se juzga contra esa.
 */
export function sinSuFuente<T>(
  hijas: readonly T[],
  claveDe: (h: T) => string | null | undefined,
  fuentesQueNoVolvieron: ReadonlySet<string>,
  fuentesVivas: ReadonlySet<string>,
): T[] {
  return hijas.filter((h) => {
    const k = claveDeCodigo(claveDe(h));
    return k !== null && fuentesQueNoVolvieron.has(k) && !fuentesVivas.has(k);
  });
}

/**
 * La justificación que la tala ya llevaba en el libro, para volver a pasar T8
 * (DMC) y T9 (cupo) con el MISMO motivo con que se registró — nunca uno nuevo
 * inventado al recuperar. `observations` las guarda así (ver `buildObservations`
 * y `notaSobreCupo`).
 */
export function motivosGuardados(observations: string | null | undefined): {
  justificacionDmc: string | null;
  motivoSobreCupo: string | null;
} {
  const obs = observations ?? "";
  const dmc = contenidoDeMarca(obs, "[Tala bajo DMC justificada: ")?.trim() || null;
  const nota = contenidoDeMarca(obs, "[Tala sobre el cupo: ");
  const i = nota?.indexOf("Motivo: ") ?? -1;
  const cupo = (nota && i >= 0 ? nota.slice(i + "Motivo: ".length) : "").trim() || null;
  return { justificacionDmc: dmc, motivoSobreCupo: cupo };
}

/**
 * Lo que va entre la marca y SU «]» de cierre, contando los corchetes de
 * adentro: un motivo como «caído [por viento] en la trocha» vuelve entero (con
 * un «hasta el primer ]» volvía «caído [por viento» y la tala no pasaba T9).
 */
function contenidoDeMarca(texto: string, marca: string): string | null {
  const ini = texto.indexOf(marca);
  if (ini < 0) return null;
  let nivel = 1;
  for (let k = ini + marca.length; k < texto.length; k++) {
    if (texto[k] === "[") nivel += 1;
    else if (texto[k] === "]" && --nivel === 0) return texto.slice(ini + marca.length, k);
  }
  return null;
}
