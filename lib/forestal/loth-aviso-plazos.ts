/**
 * loth-aviso-plazos — qué hay que decirle HOY al titular del Libro TH, antes de
 * que se le pase un plazo.
 *
 * El Libro CTP ya avisa (`ctp-aviso-plazos` + cron `forestal-plazos`); el Libro
 * de Operaciones de Títulos Habilitantes (LO-TH, RDE 264-2019) no avisaba nada:
 * la línea tardía se pintaba en ámbar recién DESPUÉS de guardarla, y el plan que
 * vence se veía sólo si alguien abría su ficha. Esto invierte el orden.
 *
 * PURO: recibe lo ya leído (`ForestLothDB.datosAvisoPlazos`) y decide. El cron
 * sólo junta y manda. `ahora` entra por parámetro.
 *
 * ── Qué significa «pendiente de registrar» en el LO-TH (y qué NO) ──────────
 * El libro NO tiene borradores: una línea existe (`registrado`) o fue anulada.
 * El plazo (`PLAZO_REGISTRO_DIAS`, 15 días calendario) se mide entre la fecha
 * del hecho (`entryDate`) y la del asiento (`createdAt`) — `estaFueraDePlazo`.
 * Así que de una tala o un trozado que nadie asentó no queda NINGÚN rastro en la
 * base: no hay cómo avisar de él sin inventarlo.
 *
 * El único hecho del monte que deja huella ANTES de asentarse es el DESPACHO:
 * la GTF de trozas se emite (`ForestGtf`, con su fecha) y la sección «Despacho
 * de trozas» todavía no tiene ninguna línea que la cite. Eso es el veredicto
 * `registrada_sin_trozas` de `cuadrarGuias` — el mismo cruce que muestra el
 * control del permiso. Ése es el «pendiente de registrar» que se avisa, con el
 * plazo contado desde la fecha de la guía.
 *
 * Además, para que lo ya perdido no pase callado: las líneas asentadas FUERA de
 * plazo en los últimos `VENTANA_TARDIAS_DIAS` días. Esas se CUENTAN pero no
 * disparan el aviso solas — mismo criterio que el Libro CTP: ya no se pueden
 * salvar, y un aviso que no se puede accionar enseña a ignorar los avisos.
 *
 * Los otros dos avisos:
 *  · Plan vivo por vencer (≤ 90 días), vencido, o SIN vigencia cargada. La
 *    cuenta es la de la ficha del permiso (`construirFichaPermiso` → mismo
 *    `estadoVigencia` y el «hoy» de Lima): el aviso y la ficha no pueden contar
 *    distinto el mismo vencimiento.
 *  · Guías que el libro cita y no existen entre las emitidas
 *    (`citada_sin_registrar` de `cuadrarGuias`): el documento de origen no está.
 */

import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo, type LothEntryDTO, type LothSection } from "./loth-constants";
import { cuadrarGuias, type GtfRegistrada } from "./loth-cuadre-guias";
import { construirFichaPermiso, fechaDelPermiso, nombreDelPlan, type PlanFichaApi } from "./loth-ficha-permiso";
import { construirTablero } from "./loth-tablero-trozas";
import { hoyDelLibro } from "./vigencia-avisos";

/**
 * Desde cuántos días de la guía se empieza a avisar. Diez de quince: quedan
 * cinco días para asentar — una semana de trabajo en el monte, no una tarde.
 */
export const DIAS_AVISO_REGISTRO = 10;

/** Cuánto hacia atrás se cuentan las líneas recién asentadas fuera de plazo. */
export const VENTANA_TARDIAS_DIAS = 7;

/** Un plan por vencer dentro de la semana ya es urgente (mismo escalón que `vigencia-avisos`). */
const DIAS_URGENTE_PLAN = 7;

/* ── Acciones: vistas que YA existen en el Libro TH ─────────────────────── */

/** Pestaña del Libro TH (`TabRouter`). */
export const URL_LIBRO_TH = "/admin?tab=loth-libro-operaciones";

export interface AccionAviso {
  url: string;
  label: string;
}

/** Abre una sección del libro (`?seccion=` lo lee `LothLibroOperaciones`). */
export function accionSeccion(seccion: LothSection, label: string): AccionAviso {
  return { url: `${URL_LIBRO_TH}&vista=secciones&seccion=${seccion}`, label };
}
export const ACCION_PLAN: AccionAviso = { url: `${URL_LIBRO_TH}&vista=plan`, label: "Abrir el plan" };
export const ACCION_GUIAS: AccionAviso = { url: `${URL_LIBRO_TH}&vista=gtf`, label: "Registrar la guía" };
export const ACCION_DESPACHO = accionSeccion("despacho_troza", "Asentar el despacho");

/* ── Entrada ────────────────────────────────────────────────────────────── */

/** Una GTF del libro, con su tipo: sólo las de trozas se asientan en «Despacho de trozas». */
export interface GtfAvisoTh extends GtfRegistrada {
  /** `trozas` | `producto`. */
  tipo: string;
}

export interface DatosAvisoTh {
  /** Líneas vivas del libro, como las serializa la API (Decimals → string, fechas ISO). */
  lineas: readonly LothEntryDTO[];
  /** Todas las GTF del libro, anuladas incluidas (el cruce tiene que verlas). */
  gtfs: readonly GtfAvisoTh[];
  /** Todos los planes; acá se quedan los vivos (`isActive`). */
  planes: readonly PlanFichaApi[];
}

/* ── Salida ─────────────────────────────────────────────────────────────── */

export type EstadoDespacho = "por_vencer" | "vence_hoy" | "vencido";

/** Una GTF de trozas emitida que ninguna línea de Despacho de trozas cita todavía. */
export interface DespachoSinAsentar {
  gtfNumber: string;
  /** «20/09/2026». */
  fecha: string;
  /** Días calendario desde la guía. */
  dias: number;
  /** Días que quedan (0 = hoy es el último, negativo = ya se pasó). */
  quedan: number;
  estado: EstadoDespacho;
  volumenM3: number | null;
  piezas: number | null;
}

/** Una línea asentada fuera de plazo hace poco. */
export interface RegistroTardio {
  section: LothSection;
  lineNo: number;
  /** Días entre el hecho y el asiento. */
  dias: number;
}

export type EstadoPlanAviso = "vencido" | "por_vencer" | "sin_vigencia";

export interface PlanEnAviso {
  id: string;
  nombre: string;
  estado: EstadoPlanAviso;
  /** Días hasta el fin (negativo = venció hace N). `null` sin fecha. */
  diasQuedan: number | null;
  /** «sábado 20/03/2028», o null. */
  vigenciaHasta: string | null;
}

export interface GuiaSinRegistrar {
  gtfNumber: string;
  trozas: number;
  codigos: string[];
}

export type ClaveGrupo = "despachos" | "planes" | "guias" | "tardias";

/**
 * Un bloque del aviso con su acción. En la campana va UNA notificación por
 * bloque: cada una lleva su propio clic («Asentar el despacho», «Abrir el
 * plan»…) en vez de un único enlace genérico al libro.
 */
export interface GrupoAvisoTh {
  clave: ClaveGrupo;
  severidad: "HIGH" | "MEDIUM";
  titulo: string;
  resumen: string;
  accion: AccionAviso;
  /** false = se cuenta, pero no alcanza para interrumpir a nadie. */
  dispara: boolean;
}

export interface AvisoTh {
  hayQueAvisar: boolean;
  severidad: "HIGH" | "MEDIUM";
  titulo: string;
  resumen: string;
  whatsapp: string;
  despachos: DespachoSinAsentar[];
  tardias: RegistroTardio[];
  planes: PlanEnAviso[];
  guias: GuiaSinRegistrar[];
  grupos: GrupoAvisoTh[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

const DIA_MS = 86_400_000;

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

/** «20/09/2026», leído en UTC (fecha date-only). */
function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  const k = d.toISOString().slice(0, 10).split("-");
  return `${k[2]}/${k[1]}/${k[0]}`;
}

const NOMBRE_SECCION: Record<LothSection, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

export function fraseDespacho(d: DespachoSinAsentar): string {
  if (d.quedan < 0) {
    const n = Math.abs(d.quedan);
    return `pasado de plazo por ${plural(n, "día", "días")}`;
  }
  if (d.quedan === 0) return "hoy es el último día";
  return `te ${d.quedan === 1 ? "queda" : "quedan"} ${plural(d.quedan, "día", "días")}`;
}

export function frasePlan(p: PlanEnAviso): string {
  if (p.estado === "sin_vigencia") return "no tiene la vigencia cargada";
  if (p.estado === "vencido") {
    return p.diasQuedan != null ? `venció hace ${plural(Math.abs(p.diasQuedan), "día", "días")}` : "está vencido";
  }
  if (p.diasQuedan === 0) return "vence hoy";
  return `vence en ${plural(p.diasQuedan ?? 0, "día", "días")}${p.vigenciaHasta ? ` (${p.vigenciaHasta})` : ""}`;
}

/* ── Las cuatro lecturas ────────────────────────────────────────────────── */

/**
 * Despachos de trozas por asentar: GTF de trozas EMITIDA, con fecha, que
 * ninguna línea de Despacho de trozas cita (`registrada_sin_trozas`), desde el
 * día `DIAS_AVISO_REGISTRO` en adelante. Las vencidas siguen saliendo: todavía
 * hay que asentarlas (quedan marcadas tarde, pero un despacho sin línea es un
 * hueco peor que una línea tardía).
 */
export function despachosSinAsentar(d: DatosAvisoTh, ahora: Date | number): DespachoSinAsentar[] {
  const hoy = hoyDelLibro(ahora);
  const trozas = construirTablero(d.lineas, hoy);
  const cuadre = cuadrarGuias(trozas, d.gtfs);
  const sinTrozas = new Set(cuadre.filter((f) => f.veredicto === "registrada_sin_trozas").map((f) => f.gtf.trim().toUpperCase()));

  const out: DespachoSinAsentar[] = [];
  const vistas = new Set<string>();
  for (const g of d.gtfs) {
    const k = g.gtfNumber.trim().toUpperCase();
    if (!sinTrozas.has(k) || vistas.has(k)) continue;
    if (g.status === "anulada" || g.tipo !== "trozas" || !g.gtfDate) continue;
    // Fecha ilegible: no hay plazo que contar, no se inventa uno. Una futura da 0.
    const dias = diasDeRegistro(g.gtfDate, hoy);
    if (dias == null || dias < DIAS_AVISO_REGISTRO) continue;
    vistas.add(k);
    const quedan = PLAZO_REGISTRO_DIAS - dias;
    const vol = g.volumenTotalM3 == null || g.volumenTotalM3 === "" ? null : Number(g.volumenTotalM3);
    out.push({
      gtfNumber: g.gtfNumber.trim(),
      fecha: fechaCorta(g.gtfDate),
      dias,
      quedan,
      estado: quedan < 0 ? "vencido" : quedan === 0 ? "vence_hoy" : "por_vencer",
      volumenM3: vol != null && Number.isFinite(vol) ? vol : null,
      piezas: g.piezasTotal ?? null,
    });
  }
  return out.sort((a, b) => a.quedan - b.quedan || a.gtfNumber.localeCompare(b.gtfNumber, "es", { numeric: true }));
}

/** Líneas asentadas fuera de plazo en los últimos `VENTANA_TARDIAS_DIAS` días. */
export function registrosTardiosRecientes(lineas: readonly LothEntryDTO[], ahora: Date | number): RegistroTardio[] {
  const corte = new Date(ahora).getTime() - VENTANA_TARDIAS_DIAS * DIA_MS;
  return lineas
    .filter((l) => l.status !== "anulado" && l.createdAt && new Date(l.createdAt).getTime() >= corte)
    .filter((l) => estaFueraDePlazo(l.entryDate, l.createdAt))
    .map((l) => ({ section: l.section, lineNo: l.lineNo, dias: diasDeRegistro(l.entryDate, l.createdAt) ?? 0 }))
    .sort((a, b) => b.dias - a.dias);
}

/** Planes vivos por vencer, vencidos o sin vigencia — con la cuenta de la ficha del permiso. */
export function planesEnAviso(planes: readonly PlanFichaApi[], ahora: Date | number): PlanEnAviso[] {
  const out: PlanEnAviso[] = [];
  for (const p of planes) {
    if (!p.isActive) continue;
    const f = construirFichaPermiso(null, p, ahora);
    if (f.estado !== "vencido" && f.estado !== "por_vencer" && f.estado !== "sin_vigencia") continue;
    out.push({
      id: p.id,
      nombre: nombreDelPlan(p),
      estado: f.estado,
      diasQuedan: f.diasQuedan,
      vigenciaHasta: fechaDelPermiso(p.vigenciaHasta),
    });
  }
  const orden: Record<EstadoPlanAviso, number> = { vencido: 0, por_vencer: 1, sin_vigencia: 2 };
  return out.sort((a, b) => orden[a.estado] - orden[b.estado] || (a.diasQuedan ?? 0) - (b.diasQuedan ?? 0));
}

/** Guías que el libro cita y no están entre las emitidas (`cuadrarGuias`, sin duplicar el cruce). */
export function guiasSinRegistrar(d: DatosAvisoTh, ahora: Date | number): GuiaSinRegistrar[] {
  const trozas = construirTablero(d.lineas, hoyDelLibro(ahora));
  return cuadrarGuias(trozas, d.gtfs)
    .filter((f) => f.veredicto === "citada_sin_registrar")
    .map((f) => ({ gtfNumber: f.gtf, trozas: f.libroTrozas, codigos: f.codigos }));
}

/* ── El aviso ───────────────────────────────────────────────────────────── */

function grupoDespachos(ds: DespachoSinAsentar[]): GrupoAvisoTh | null {
  if (ds.length === 0) return null;
  const vencidos = ds.filter((x) => x.estado === "vencido").length;
  const hoy = ds.filter((x) => x.estado === "vence_hoy").length;
  const titulo =
    vencidos > 0
      ? `${plural(vencidos, "despacho", "despachos")} sin asentar, fuera de plazo, en el Libro TH`
      : hoy > 0
        ? `${plural(hoy, "despacho se vence", "despachos se vencen")} hoy en el Libro TH`
        : `${plural(ds.length, "despacho por asentar", "despachos por asentar")} en el Libro TH`;
  return {
    clave: "despachos",
    severidad: vencidos > 0 || hoy > 0 ? "HIGH" : "MEDIUM",
    titulo,
    resumen: ds
      .slice(0, 3)
      .map((x) => `GTF ${x.gtfNumber} (${x.fecha}) — ${fraseDespacho(x)}`)
      .concat(ds.length > 3 ? [`y ${ds.length - 3} más`] : [])
      .join(" · "),
    accion: ACCION_DESPACHO,
    dispara: true,
  };
}

function grupoPlanes(ps: PlanEnAviso[]): GrupoAvisoTh | null {
  if (ps.length === 0) return null;
  const urgente = ps.some(
    (p) => p.estado === "vencido" || (p.estado === "por_vencer" && (p.diasQuedan ?? 0) <= DIAS_URGENTE_PLAN),
  );
  const primero = ps[0];
  const titulo =
    ps.length === 1
      ? `Plan ${primero.nombre}: ${frasePlan(primero)}`
      : primero.estado === "vencido"
        ? `${plural(ps.filter((p) => p.estado === "vencido").length, "plan vencido", "planes vencidos")} en el Libro TH`
        : `${plural(ps.length, "plan", "planes")} con la vigencia por revisar`;
  return {
    clave: "planes",
    severidad: urgente ? "HIGH" : "MEDIUM",
    titulo,
    resumen: ps.map((p) => `${p.nombre} — ${frasePlan(p)}`).join(" · "),
    accion: ACCION_PLAN,
    dispara: true,
  };
}

function grupoGuias(gs: GuiaSinRegistrar[]): GrupoAvisoTh | null {
  if (gs.length === 0) return null;
  return {
    clave: "guias",
    severidad: "MEDIUM",
    titulo:
      gs.length === 1
        ? `La GTF ${gs[0].gtfNumber} está en el libro pero no entre tus guías`
        : `${plural(gs.length, "guía citada", "guías citadas")} en el libro sin registrar`,
    resumen: gs
      .map((g) => `GTF ${g.gtfNumber} — ${plural(g.trozas, "troza", "trozas")} la citan`)
      .join(" · "),
    accion: ACCION_GUIAS,
    dispara: true,
  };
}

function grupoTardias(ts: RegistroTardio[]): GrupoAvisoTh | null {
  if (ts.length === 0) return null;
  const porSeccion = new Map<LothSection, number>();
  for (const t of ts) porSeccion.set(t.section, (porSeccion.get(t.section) ?? 0) + 1);
  const principal = [...porSeccion.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return {
    clave: "tardias",
    severidad: "MEDIUM",
    titulo: `${plural(ts.length, "línea asentada", "líneas asentadas")} fuera de plazo esta semana`,
    resumen: [...porSeccion.entries()].map(([s, n]) => `${NOMBRE_SECCION[s]}: ${n}`).join(" · "),
    accion: accionSeccion(principal, "Ver en el libro"),
    dispara: false,
  };
}

/**
 * Arma el aviso completo. Sólo interrumpe por lo ACCIONABLE hoy: despachos por
 * asentar, planes por vencer / vencidos / sin vigencia, y guías que faltan.
 * Las líneas tardías de la semana se cuentan en el texto pero no disparan.
 */
export function construirAvisoTh(d: DatosAvisoTh, ahora: Date | number = Date.now(), nombreNegocio?: string): AvisoTh {
  const despachos = despachosSinAsentar(d, ahora);
  const tardias = registrosTardiosRecientes(d.lineas, ahora);
  const planes = planesEnAviso(d.planes, ahora);
  const guias = guiasSinRegistrar(d, ahora);

  // Orden de gravedad: un plan vencido invalida TODO lo que se movilice; después
  // el despacho sin asentar (plazo que corre), la guía que falta y lo tardío.
  // Lo urgente (HIGH) encabeza; entre iguales manda ese orden (sort estable).
  const candidatos = [grupoDespachos(despachos), grupoPlanes(planes), grupoGuias(guias), grupoTardias(tardias)];
  const planVencido = planes.some((p) => p.estado === "vencido");
  const rango = (g: GrupoAvisoTh) => (g.severidad === "HIGH" ? 0 : 2) - (planVencido && g.clave === "planes" ? 1 : 0);
  const grupos = candidatos.filter((g): g is GrupoAvisoTh => g !== null).sort((a, b) => rango(a) - rango(b));

  const disparan = grupos.filter((g) => g.dispara);
  const hayQueAvisar = disparan.length > 0;
  const severidad: "HIGH" | "MEDIUM" = disparan.some((g) => g.severidad === "HIGH") ? "HIGH" : "MEDIUM";
  const titulo = disparan[0]?.titulo ?? grupos[0]?.titulo ?? "Libro TH al día";

  const partes: string[] = [];
  if (despachos.length > 0) partes.push(`${plural(despachos.length, "despacho", "despachos")} por asentar`);
  if (planes.length > 0) partes.push(`${plural(planes.length, "plan", "planes")} con la vigencia por revisar`);
  if (guias.length > 0) partes.push(`${plural(guias.length, "guía citada", "guías citadas")} sin registrar`);
  if (tardias.length > 0) partes.push(`${plural(tardias.length, "línea asentada", "líneas asentadas")} fuera de plazo esta semana`);
  const resumen = partes.join(" · ") || "Sin pendientes.";

  // `null` = línea que no corresponde; `""` = renglón en blanco a propósito.
  const whatsapp = [
    `🌳 *${titulo}*${nombreNegocio ? ` — ${nombreNegocio}` : ""}`,
    "",
    ...planes.slice(0, 3).map((p) => `• Plan ${p.nombre} — ${frasePlan(p)}`),
    ...despachos.slice(0, 6).map((x) => {
      const vol = x.volumenM3 ? ` · ${x.volumenM3} m³` : "";
      return `• GTF ${x.gtfNumber} (${x.fecha})${vol} sin asentar en Despacho de trozas — ${fraseDespacho(x)}`;
    }),
    despachos.length > 6 ? `…y ${despachos.length - 6} más.` : null,
    ...guias.slice(0, 4).map((g) => `• GTF ${g.gtfNumber}: el libro la cita y no está entre tus guías registradas`),
    tardias.length > 0
      ? `⚠️ ${plural(tardias.length, "línea se asentó", "líneas se asentaron")} fuera de plazo esta semana.`
      : null,
    "",
    `El plazo para asentar en el Libro TH es de ${PLAZO_REGISTRO_DIAS} días calendario (RDE 264-2019).`,
    "Entra al panel → Libro TH (Forestal).",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { hayQueAvisar, severidad, titulo, resumen, whatsapp, despachos, tardias, planes, guias, grupos };
}
