/**
 * Las vistas del Libro CTP que se mudaron ADENTRO de otra (plan «panel
 * unificado», fusión F31 + F34, ola 2 — 2026-10-10).
 *
 * El riel pasó de 26 a 22 entradas sin borrar nada: cada vista vieja es ahora
 * una pestaña interna (`?sub=`) de la que la absorbió.
 *   · «GTF ingresadas» era el MISMO `CtpIngresosView` que Ingresos con otro
 *     filtro: queda como Ingresos › Recepcionadas;
 *   · Reportes, Análisis y Rentabilidad —más el Rendimiento del aserradero que
 *     vivía en Herramientas— son pestañas del Tablero;
 *   · los Lotes comerciales con QR (`forestal-lotes`) son una pestaña de
 *     Despacho (Brandon, 2026-10-09: «dentro de Libro CTP › Despacho»).
 *
 * Los nombres viejos siguen llegando: un botón que todavía dice `irA("reportes")`,
 * un `?vista=rentabilidad` guardado o la tecla `g y` caen en su pestaña nueva.
 */

export const SUBS_INGRESOS = ["por-recepcionar", "recepcionadas"] as const;
export type SubIngresos = (typeof SUBS_INGRESOS)[number];

/** Qué guías lista Ingresos: las dos mitades del libro, o la bandeja abierta a todo el período. */
export type FiltroRecepcion = "pendiente" | "cerrada" | "";

export const SUBS_TABLERO = ["movimiento", "produccion", "tendencias", "margen", "rendimiento"] as const;
export type SubTablero = (typeof SUBS_TABLERO)[number];

/** `guias` = las Guías emitidas (compactación 17-10: la vista se mudó acá). */
export const SUBS_DESPACHO = ["despachos", "lotes-qr", "guias"] as const;
export type SubDespacho = (typeof SUBS_DESPACHO)[number];

/*
 * Compactación del libro (17-10, plan `.claude/autonomo/ctp-compactar/plan.md`):
 * seis vistas más se mudan adentro de otra. Las listas van primero, solas, para
 * que cada vista construya su `?sub=`; el riel, los alias y las teclas
 * (`CTP_VISTAS_FUSIONADAS`, `TECLAS_FUSIONADAS`) se cambian al final, juntos.
 */

/** Saldos. `libro` = «Lo que firma el libro»: absorbe los Cuadros SERFOR (`resumenes`). */
export const SUBS_SALDOS = ["estado", "capacidad", "movimiento", "libro"] as const;
export type SubSaldos = (typeof SUBS_SALDOS)[number];

/** Lotes de aserrío. `historia` = la Historia del lote (`historia-lote`). */
export const SUBS_LOTES = ["lotes", "historia"] as const;
export type SubLotes = (typeof SUBS_LOTES)[number];

/** Volumen disponible. `por-troza` = la vista Trozas (`trozas`), pieza por pieza. */
export const SUBS_DISPONIBLES = ["volumen", "por-troza"] as const;
export type SubDisponibles = (typeof SUBS_DISPONIBLES)[number];

/** Cumplimiento. `cerrar` = el Cierre del mes (`cierre`). */
export const SUBS_CUMPLIMIENTO = ["chequeo", "cerrar"] as const;
export type SubCumplimiento = (typeof SUBS_CUMPLIMIENTO)[number];

/**
 * Directorio: los seis roles de `ROLES_PARTE` (lib/forestal/directorio.ts), los
 * vehículos y `tu-ctp` = la Ficha del CTP (`ficha`), los datos que llenan la guía.
 * Escrita a mano (no `...ROLES_PARTE`): el guardián de subvistas lee la lista literal.
 */
export const SUBS_DIRECTORIO = [
  "proveedor",
  "destinatario",
  "transportista",
  "conductor",
  "cliente",
  "establecimiento",
  "vehiculos",
  "tu-ctp",
] as const;
export type SubDirectorio = (typeof SUBS_DIRECTORIO)[number];

/** Las vistas del riel que tienen pestañas internas. */
export type VistaConSubs =
  | "ingresos"
  | "tablero"
  | "despacho"
  | "saldos"
  | "lotes"
  | "disponibles"
  | "cumplimiento"
  | "directorio";

export interface DestinoFusionado {
  vista: VistaConSubs;
  sub: string;
}

/** Vista vieja → su pestaña nueva. */
export const CTP_VISTAS_FUSIONADAS: Readonly<Record<string, DestinoFusionado>> = {
  "gtf-ingresadas": { vista: "ingresos", sub: "recepcionadas" },
  reportes: { vista: "tablero", sub: "produccion" },
  analisis: { vista: "tablero", sub: "tendencias" },
  rentabilidad: { vista: "tablero", sub: "margen" },
};

/** Para `useVistaModulo`: el nombre viejo abre la vista que lo absorbió. */
export const ALIAS_FUSIONADAS: Readonly<Record<string, VistaConSubs>> = Object.fromEntries(
  Object.entries(CTP_VISTAS_FUSIONADAS).map(([vieja, d]) => [vieja, d.vista]),
);

/**
 * Las teclas `g` + letra de las vistas que se mudaron. La cabina deriva sus
 * atajos del riel, y estas vistas ya no están en él: sin esta tabla, `g y`
 * dejaba de llevar a Reportes.
 */
export const TECLAS_FUSIONADAS: readonly { tecla: string; vieja: string; descripcion: string }[] = [
  { tecla: "z", vieja: "gtf-ingresadas", descripcion: "Ingresos › Recepcionadas" },
  { tecla: "y", vieja: "reportes", descripcion: "Tablero › Producción" },
  { tecla: "b", vieja: "rentabilidad", descripcion: "Tablero › Margen" },
  { tecla: "a", vieja: "analisis", descripcion: "Tablero › Tendencias" },
];

export function destinoFusionado(vista: string): DestinoFusionado | null {
  return Object.hasOwn(CTP_VISTAS_FUSIONADAS, vista) ? CTP_VISTAS_FUSIONADAS[vista] : null;
}

/**
 * La pestaña interna que pide una URL vieja (`?vista=reportes`) para la vista
 * `host`. Se lee al montar la pestaña interna, ANTES de que el libro reescriba
 * `?vista=` con el nombre de hoy (los efectos del hijo corren antes que los del
 * padre, y el inicializador de estado, antes que cualquier efecto).
 */
export function subPedidoPorVistaVieja(host: VistaConSubs): string | undefined {
  if (typeof window === "undefined") return undefined;
  const vieja = new URLSearchParams(window.location.search).get("vista");
  const d = vieja ? destinoFusionado(vieja) : null;
  return d && d.vista === host ? d.sub : undefined;
}

/**
 * Los avisos que apuntaban a una vista que se mudó suman en la que la absorbió:
 * si no, el punto del riel se perdía (un pendiente de «rentabilidad» no tenía
 * dónde dibujarse).
 */
export function plegarAlertasFusionadas(alertas: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [vista, n] of Object.entries(alertas)) {
    const destino = destinoFusionado(vista)?.vista ?? vista;
    out[destino] = (out[destino] ?? 0) + n;
  }
  return out;
}

/** Un pedido de pestaña interna desde el libro: el contador hace que repetir el mismo salto se aplique. */
export interface PedidoSub {
  vista: VistaConSubs;
  sub: string;
  n: number;
}
