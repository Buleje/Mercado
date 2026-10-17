/**
 * El primer día de un Libro de Operaciones CTP.
 *
 * El libro está afinado para un aserradero que YA opera: doce pestañas, guías,
 * lotes, corridas, cierre. Un CTP que lo abre por primera vez ve todo eso
 * vacío y sin un orden — y el orden importa, porque los pasos dependen entre
 * sí: sin Ficha no hay guía de salida válida, sin ingresos no hay lote que
 * armar, sin lote no hay corrida que declarar.
 *
 * Este módulo NO decide si un dato está bien: eso ya lo saben
 * `ctpFichaFaltantes` y `requisitosFaltantes`. Acá sólo se ordena el camino y
 * se dice en cuál de sus tramos está el libro.
 *
 * PURO y client-safe.
 */

import { ctpFichaFaltantes, CTP_FICHA_LABELS, type CtpFicha } from "./ctp-ficha-types";

/** Lo que hay que saber del tenant para ubicarlo en el camino. */
export interface EstadoDelLibro {
  ficha: CtpFicha | null;
  /** Especies en el catálogo del centro. */
  especies: number;
  /** Guías de ingreso cargadas (de cualquier estado). */
  ingresos: number;
  /** Lotes de aserrío armados. */
  lotes: number;
  /** Corridas de producción declaradas. */
  corridas: number;
  /** Guías de transporte emitidas por el centro. */
  despachos: number;
}

export type EstadoPaso = "hecho" | "ahora" | "despues" | "opcional";

export interface PasoDeArranque {
  clave: "ficha" | "especies" | "historico" | "ingreso" | "lote" | "produccion" | "despacho";
  titulo: string;
  /** Por qué importa, en una línea. */
  porque: string;
  estado: EstadoPaso;
  /** Lo que falta, cuando se puede nombrar. */
  detalle: string | null;
  /** La vista del libro donde se hace. */
  vista: string;
}

/**
 * ¿El libro está recién abierto?
 *
 * Sin un solo movimiento registrado. La Ficha no cuenta: se puede llenar antes
 * de que entre la primera troza, y de hecho es lo que corresponde.
 */
export function libroReciénAbierto(e: EstadoDelLibro): boolean {
  return e.ingresos === 0 && e.lotes === 0 && e.corridas === 0 && e.despachos === 0;
}

/**
 * Los pasos del arranque, en el orden en que se pueden hacer.
 *
 * «ahora» es UNO solo: el primero que no está hecho y que no depende de otro
 * pendiente. Marcar tres cosas como urgentes a la vez es no marcar ninguna.
 */
export function pasosDeArranque(e: EstadoDelLibro): PasoDeArranque[] {
  const faltanFicha = e.ficha ? ctpFichaFaltantes(e.ficha) : null;
  const fichaLista = faltanFicha != null && faltanFicha.length === 0;
  const sinSerie = !e.ficha?.gtfSerie?.trim();

  const pasos: Omit<PasoDeArranque, "estado">[] = [
    {
      clave: "ficha",
      titulo: "Completa la Ficha del CTP",
      porque:
        "Es la identidad del centro: código de CTP, RUC, registro ante la ARFFS y la serie del talonario. Sin esto, los papeles que emitas salen incompletos.",
      detalle:
        faltanFicha == null
          ? "Todavía no se cargó ninguna ficha."
          : faltanFicha.length > 0
            ? `Faltan ${faltanFicha.length}: ${faltanFicha.slice(0, 4).map((k) => CTP_FICHA_LABELS[k] ?? String(k)).join(", ")}${faltanFicha.length > 4 ? "…" : ""}`
            : null,
      vista: "ficha",
    },
    {
      clave: "especies",
      titulo: "Carga las especies que trabajas",
      porque: "El libro las pide en cada ingreso y en cada corrida; tenerlas antes evita tipearlas distinto cada vez.",
      detalle: e.especies === 0 ? "El catálogo está vacío." : `${e.especies} en el catálogo.`,
      vista: "especies",
    },
    {
      clave: "historico",
      titulo: "Trae lo que ya declaraste en el SNIFFS",
      porque:
        "Si el centro ya venía operando, el histórico entra de una en vez de tipearse: el libro arranca cuadrado con lo que la autoridad ya tiene.",
      detalle: "Opcional: sólo si el CTP ya declaraba antes de usar el libro.",
      vista: "ingresos",
    },
    {
      clave: "ingreso",
      titulo: "Registra la primera guía de ingreso",
      porque: "Toda la madera del libro entra por una GTF: es el origen legal, y sin ella no hay nada que aserrar.",
      detalle: e.ingresos === 0 ? "Ninguna guía cargada." : `${e.ingresos} cargada${e.ingresos === 1 ? "" : "s"}.`,
      vista: "ingresos",
    },
    {
      clave: "lote",
      titulo: "Arma el primer lote de aserrío",
      porque: "El lote junta las trozas de una especie que entran juntas al carro. Es lo que después consume Producción.",
      detalle: e.lotes === 0 ? "Ningún lote armado." : `${e.lotes} armado${e.lotes === 1 ? "" : "s"}.`,
      vista: "lotes",
    },
    {
      clave: "produccion",
      titulo: "Declara la primera corrida",
      porque: "Lo que salió de la sierra: producto, volumen y piezas. Es la mitad del libro que mira SERFOR.",
      detalle: e.corridas === 0 ? "Ninguna corrida declarada." : `${e.corridas} declarada${e.corridas === 1 ? "" : "s"}.`,
      vista: "produccion",
    },
    {
      clave: "despacho",
      titulo: "Emite la primera guía de salida",
      porque: "Con la GTF del centro la madera sale amparada, y ahí se cierra la cadena de custodia completa.",
      /* La serie del talonario se pide ACÁ y no en la Ficha: no está en
         `CTP_FICHA_REQUIRED` —que es el mínimo de identidad legal— pero sin
         ella no hay guía de salida que numerar. Cada paso pide lo suyo. */
      detalle:
        e.despachos > 0
          ? `${e.despachos} emitida${e.despachos === 1 ? "" : "s"}.`
          : sinSerie
            ? "Ninguna emitida. Antes carga la serie del talonario en la Ficha."
            : "Ninguna emitida.",
      vista: "despacho",
    },
  ];

  const hecho: Record<PasoDeArranque["clave"], boolean> = {
    ficha: fichaLista,
    especies: e.especies > 0,
    /* El histórico no se puede dar por «hecho»: que haya ingresos no dice si
       vinieron del SNIFFS o se cargaron a mano. Queda siempre opcional. */
    historico: false,
    ingreso: e.ingresos > 0,
    lote: e.lotes > 0,
    produccion: e.corridas > 0,
    despacho: e.despachos > 0,
  };

  let yaHayUnoAhora = false;
  return pasos.map((p) => {
    if (p.clave === "historico") return { ...p, estado: "opcional" as const };
    if (hecho[p.clave]) return { ...p, estado: "hecho" as const, detalle: p.detalle };
    if (!yaHayUnoAhora) {
      yaHayUnoAhora = true;
      return { ...p, estado: "ahora" as const };
    }
    return { ...p, estado: "despues" as const };
  });
}

/** Cuántos pasos obligatorios ya están, sobre el total. */
export function avanceDeArranque(pasos: readonly PasoDeArranque[]): { hechos: number; total: number } {
  const obligatorios = pasos.filter((p) => p.estado !== "opcional");
  return { hechos: obligatorios.filter((p) => p.estado === "hecho").length, total: obligatorios.length };
}

/**
 * ¿Conviene mostrar el arranque?
 *
 * Dos condiciones, y la segunda se ganó verificando en el tenant real: el
 * aserradero de Brandon tiene 24 ingresos, 5 lotes y 14 corridas… y **cero
 * guías de salida emitidas desde el libro**. Con la regla ingenua —«mientras
 * falte un paso»— le aparecía un cartel de PRIMEROS PASOS a quien opera hace
 * meses. Eso no enseña nada y ocupa el lugar de lo que sí importa.
 *
 * Un centro que ya recibió madera, armó lotes y declaró corridas **ya sabe
 * operar**: lo que le falte a partir de ahí es un pendiente normal, y para eso
 * está la campana de avisos. La guía es para el que todavía no dio la vuelta.
 */
export function hayQueGuiar(pasos: readonly PasoDeArranque[], e: EstadoDelLibro): boolean {
  const { hechos, total } = avanceDeArranque(pasos);
  if (hechos >= total) return false;
  const yaOpera = e.ingresos > 0 && e.lotes > 0 && e.corridas > 0;
  return !yaOpera;
}
