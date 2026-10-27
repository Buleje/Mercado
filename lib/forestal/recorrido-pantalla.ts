/**
 * recorrido-pantalla — lo que la pantalla del «Recorrido del permiso» dice de
 * cada paso (ADR-519, fase 4): en qué paso vas, cómo se nombra cada estado,
 * cuándo se puede registrar el lote y las jornadas, el aviso de plazo, el
 * rendimiento y los datos que se copian al formulario de la GTF de SERFOR.
 *
 * El estado lo DERIVA el servidor (`recorrido-permiso.ts`); acá sólo se
 * presenta. Nada de esto calcula un m³: se formatea lo que llegó.
 * PURO y client-safe.
 */

import { fmtM3, fmtPt } from "./cubicacion-formato";
import type { GtfDatos } from "./ctp-gtf-datos";
import {
  PASOS_RECORRIDO,
  type EstadoDePaso,
  type EstadoRecorrido,
  type PasoDelRecorrido,
  type PasoRecorrido,
} from "./recorrido-permiso";

export const TOTAL_PASOS = PASOS_RECORRIDO.length;

/** Los 6 pasos en orden, con lo que mandó el servidor (un paso que no llegó es «pendiente», nunca «hecho»). */
export interface PasoEnPantalla extends PasoDelRecorrido {
  numero: number;
  titulo: string;
  ejecutable: boolean;
}

export function pasosEnOrden(estado: Pick<EstadoRecorrido, "pasos"> | null): PasoEnPantalla[] {
  return PASOS_RECORRIDO.map((def, i) => {
    const p = estado?.pasos.find((x) => x.paso === def.id);
    return {
      paso: def.id,
      estado: p?.estado ?? "pendiente",
      ids: p?.ids ?? [],
      motivo: p?.motivo,
      code: p?.code,
      detalle: p?.detalle,
      numero: i + 1,
      titulo: def.titulo,
      ejecutable: def.ejecutable,
    };
  });
}

/** «Vas en el paso 3 de 6» · «Recorrido completo». */
export function textoAvance(siguiente: PasoRecorrido | null): string {
  if (siguiente === null) return "Recorrido completo";
  const i = PASOS_RECORRIDO.findIndex((p) => p.id === siguiente);
  return `Vas en el paso ${i < 0 ? 1 : i + 1} de ${TOTAL_PASOS}`;
}

export type TonoEstado = "exito" | "neutro" | "error" | "apagado";

/** Cómo se nombra cada estado en la pantalla (Brandon: Hecho / Pendiente / Con problema / No aplica). */
export const ESTADO_EN_PANTALLA: Record<EstadoDePaso, { etiqueta: string; tono: TonoEstado }> = {
  hecho: { etiqueta: "Hecho", tono: "exito" },
  pendiente: { etiqueta: "Pendiente", tono: "neutro" },
  con_problema: { etiqueta: "Con problema", tono: "error" },
  no_aplica: { etiqueta: "No aplica", tono: "apagado" },
};

/** La línea de debajo del título: el motivo si hay problema; si no, lo hecho. */
export function lineaDelPaso(p: Pick<PasoDelRecorrido, "estado" | "motivo" | "detalle">): string | null {
  if (p.estado === "con_problema") return p.motivo?.trim() || p.detalle?.trim() || "El servidor lo frenó sin decir por qué.";
  return p.detalle?.trim() || p.motivo?.trim() || null;
}

/**
 * El botón «Registrar lote y jornadas»: lo hace el servidor desde `siguiente`
 * hasta las jornadas. Sólo se ofrece cuando lo que falta es justo eso; antes
 * hay pasos que pide la persona (datos, trozas) y el servidor no los salta.
 */
export function botonRegistrar(
  estado: Pick<EstadoRecorrido, "siguiente" | "pasos"> | null,
  puedeDeclarar: boolean,
): { mostrar: boolean; activo: boolean; etiqueta: string; motivo: string | null } {
  const etiquetaBase = "Registrar lote y jornadas";
  if (!estado) return { mostrar: false, activo: false, etiqueta: etiquetaBase, motivo: null };
  const pasos = pasosEnOrden(estado);
  const lote = pasos.find((p) => p.paso === "lote");
  const jornadas = pasos.find((p) => p.paso === "jornadas");
  const listos = (p?: PasoEnPantalla) => p?.estado === "hecho" || p?.estado === "no_aplica";
  if (listos(lote) && listos(jornadas)) return { mostrar: false, activo: false, etiqueta: etiquetaBase, motivo: null };
  const etiqueta = listos(lote) ? "Registrar las jornadas" : etiquetaBase;
  const sig = estado.siguiente;
  if (sig !== "lote" && sig !== "jornadas") {
    const antes = PASOS_RECORRIDO.find((p) => p.id === sig);
    return { mostrar: true, activo: false, etiqueta, motivo: antes ? `Primero: ${antes.titulo.toLowerCase()}.` : null };
  }
  if (!puedeDeclarar) {
    return { mostrar: true, activo: false, etiqueta, motivo: "Solo el administrador o el dueño declaran producción. Avisa a uno de ellos." };
  }
  return { mostrar: true, activo: true, etiqueta, motivo: null };
}

// ── Fechas (date-only, en UTC: un plazo es un día, no una hora) ─────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «2026-10-29» o «2026-10-29T…» → «miércoles 29-10». */
export function diaCorto(iso: string): string {
  const d = iso.slice(0, 10);
  const [a, m, dd] = d.split("-").map(Number);
  if (!a || !m || !dd) return d;
  const dia = DIAS[new Date(Date.UTC(a, m - 1, dd)).getUTCDay()];
  return `${dia} ${String(dd).padStart(2, "0")}-${String(m).padStart(2, "0")}`;
}

/** El aviso del plazo de registro (2 días hábiles), comparado con el «hoy» de Lima. */
export function avisoDePlazo(
  plazo: EstadoRecorrido["plazo"],
  hoy: string,
): { texto: string; vencido: boolean } | null {
  if (!plazo?.venceEl) return null;
  const vence = plazo.venceEl.slice(0, 10);
  const guia = plazo.gtfNumber?.trim() ? ` (GTF ${plazo.gtfNumber.trim()})` : "";
  if (vence < hoy) return { texto: `Plazo vencido el ${diaCorto(vence)}${guia}: regístrala ya`, vencido: true };
  if (vence === hoy) return { texto: `Registrar hoy: vence hoy, ${diaCorto(vence)}${guia}`, vencido: false };
  return { texto: `Registrar hoy: vence el ${diaCorto(vence)}${guia}`, vencido: false };
}

const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %`;

/** «Sugerido 52 % · real 48,5 %» (los dos ya vienen en 0-100). */
export function textoRendimiento(r: EstadoRecorrido["rendimiento"]): string | null {
  if (!r) return null;
  return `Sugerido ${pct(r.sugeridoPct)} · real ${r.realPct == null ? "sin producción" : pct(r.realPct)}`;
}

/** El real por debajo de lo sugerido en más de 5 puntos se avisa (madera que no rindió). */
export const rendimientoBajo = (r: EstadoRecorrido["rendimiento"]): boolean =>
  r != null && r.realPct != null && r.realPct < r.sugeridoPct - 5;

// ── Lectura defensiva de la respuesta ────────────────────────────────────────

const esEstado = (x: unknown): x is EstadoRecorrido =>
  typeof x === "object" && x !== null && Array.isArray((x as { pasos?: unknown }).pasos);

/** El GET o el POST pueden devolver el estado pelado o dentro de `{ estado }` / `{ recorrido }`. */
export function leerEstadoRecorrido(json: unknown): EstadoRecorrido | null {
  if (esEstado(json)) return json;
  if (typeof json !== "object" || json === null) return null;
  const { estado, recorrido } = json as { estado?: unknown; recorrido?: unknown };
  if (esEstado(estado)) return estado;
  if (esEstado(recorrido)) return recorrido;
  return null;
}

/** Tope de vueltas del POST: el servidor corta por tiempo y pide seguir con `continuar`. */
export const TOPE_VUELTAS_RECORRIDO = 30;

export interface EjecutadoDelRecorrido {
  paso: PasoRecorrido;
  detalle: string;
}

/** La respuesta del POST (`{ estado, ejecutados, continuar }`); lo que falte no rompe. */
export function leerRespuestaEjecutar(json: unknown): {
  estado: EstadoRecorrido | null;
  ejecutados: EjecutadoDelRecorrido[];
  continuar: boolean;
} {
  const j = (typeof json === "object" && json !== null ? json : {}) as { ejecutados?: unknown; continuar?: unknown };
  const validos = new Set<unknown>(PASOS_RECORRIDO.map((p) => p.id));
  const ejecutados = Array.isArray(j.ejecutados)
    ? j.ejecutados.filter((x): x is EjecutadoDelRecorrido => {
        const e = (typeof x === "object" && x !== null ? x : {}) as { paso?: unknown; detalle?: unknown };
        return validos.has(e.paso) && typeof e.detalle === "string";
      })
    : [];
  return { estado: leerEstadoRecorrido(json), ejecutados, continuar: j.continuar === true };
}

/** «Se escribió el lote y 3 jornadas.» — suma lo escrito en todas las vueltas. */
export function textoEjecutados(ejecutados: readonly EjecutadoDelRecorrido[]): string | null {
  const lote = ejecutados.some((e) => e.paso === "lote");
  const jornadas = ejecutados.filter((e) => e.paso === "jornadas").length;
  const partes = [lote ? "el lote" : null, jornadas > 0 ? `${jornadas} jornada${jornadas === 1 ? "" : "s"}` : null].filter(Boolean);
  return partes.length > 0 ? `Se escribió ${partes.join(" y ")}.` : null;
}

/** El mensaje de un error del servidor, en sus palabras si las mandó. */
export function mensajeDeError(json: unknown, status: number): { mensaje: string; code?: string } {
  const j = (typeof json === "object" && json !== null ? json : {}) as { message?: unknown; error?: unknown; code?: unknown };
  const code = typeof j.code === "string" ? j.code : typeof j.error === "string" ? j.error : undefined;
  if (typeof j.message === "string" && j.message.trim()) return { mensaje: j.message.trim(), code };
  if (status === 403) return { mensaje: "No tienes permiso para esto. Avisa al administrador o al dueño.", code };
  if (status === 404) return { mensaje: "No se encontró esa distribución o ese bloque. Vuelve a guardarla.", code };
  return { mensaje: `El servidor respondió ${status}.`, code };
}

// ── Datos para SERFOR (la GTF se emite allá; acá se preparan para copiar) ───

export type OrigenDato = "recorrido" | "anexo" | "ultima" | "produccion";

export interface DatoSerfor {
  id: string;
  etiqueta: string;
  /** Vacío = falta: no se inventa. */
  valor: string;
  origen: OrigenDato | null;
}

export interface FuenteDatosSerfor {
  permiso: string | null;
  especie: string;
  producidoM3: number;
  producidoPt: number;
  /** El Anexo 04 guardado del bloque: el papel que viaja con la guía. */
  anexo: { numero?: string; empresa?: string; especieGlobal?: string; totalPiezas?: number; totalM3?: number; totalPt?: number } | null;
  /** Los datos de la última guía emitida (molde, ADR-371): destinatario, transporte. */
  ultima: Pick<GtfDatos, "destinatario" | "transportista" | "vehiculo" | "traslado"> | null;
}

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Los datos de la guía de salida en el orden del formulario de SERFOR:
 * título habilitante y titular → destinatario → transportista y vehículo →
 * producto. Lo que no existe queda vacío («falta»); lo que sale de la última
 * guía se marca para que se revise antes de copiarlo.
 */
export function datosParaSerfor(f: FuenteDatosSerfor): DatoSerfor[] {
  const u = f.ultima;
  const a = f.anexo;
  const de = (valor: string, origen: OrigenDato): Pick<DatoSerfor, "valor" | "origen"> =>
    valor ? { valor, origen } : { valor: "", origen: null };
  const doc = (tipo: unknown) => (t(tipo) || "RUC");
  const conAnexo = a != null && (a.totalM3 ?? 0) > 0;
  const filas: DatoSerfor[] = [
    { id: "permiso", etiqueta: "N° del título habilitante (permiso)", ...de(t(f.permiso), "recorrido") },
    { id: "titular", etiqueta: "Titular del CTP", ...de(t(a?.empresa), "anexo") },
    { id: "destinatario", etiqueta: "Destinatario", ...de(t(u?.destinatario?.nombre), "ultima") },
    { id: "destinatarioDoc", etiqueta: `${doc(u?.destinatario?.docTipo)} del destinatario`, ...de(t(u?.destinatario?.docNumero), "ultima") },
    { id: "llegada", etiqueta: "Punto de llegada", ...de(t(u?.traslado?.puntoLlegada) || t(u?.destinatario?.direccion), "ultima") },
    { id: "transportista", etiqueta: "Transportista", ...de(t(u?.transportista?.nombre), "ultima") },
    { id: "transportistaDoc", etiqueta: `${doc(u?.transportista?.docTipo)} del transportista`, ...de(t(u?.transportista?.docNumero), "ultima") },
    { id: "placa", etiqueta: "Placa", ...de(t(u?.vehiculo?.placa).toUpperCase(), "ultima") },
    { id: "conductor", etiqueta: "Conductor", ...de(t(u?.vehiculo?.conductor), "ultima") },
    { id: "conductorDni", etiqueta: "DNI del conductor", ...de(t(u?.vehiculo?.conductorDni), "ultima") },
    { id: "licencia", etiqueta: "Licencia de conducir", ...de(t(u?.vehiculo?.licencia), "ultima") },
    { id: "especie", etiqueta: "Especie", ...(t(a?.especieGlobal) ? de(t(a?.especieGlobal), "anexo") : de(t(f.especie), "recorrido")) },
    { id: "piezas", etiqueta: "Piezas", ...de(conAnexo && (a?.totalPiezas ?? 0) > 0 ? String(a?.totalPiezas) : "", "anexo") },
    {
      id: "m3",
      etiqueta: "Volumen (m³)",
      ...(conAnexo ? de(fmtM3(a?.totalM3 ?? 0), "anexo") : de(f.producidoM3 > 0 ? fmtM3(f.producidoM3) : "", "produccion")),
    },
    {
      id: "pt",
      etiqueta: "Pies tablares",
      ...(conAnexo && (a?.totalPt ?? 0) > 0 ? de(fmtPt(a?.totalPt ?? 0), "anexo") : de(f.producidoPt > 0 ? fmtPt(f.producidoPt) : "", "produccion")),
    },
    { id: "anexo", etiqueta: "N° del Anexo 04", ...de(t(a?.numero), "anexo") },
  ];
  return filas;
}

export const ORIGEN_EN_PANTALLA: Record<OrigenDato, string> = {
  recorrido: "del bloque",
  anexo: "del Anexo 04",
  ultima: "de tu última guía",
  produccion: "de la producción",
};

/** «Copiar todo»: una línea por dato, `Etiqueta: valor` (lo que falta se dice). */
export function textoParaCopiar(datos: readonly DatoSerfor[]): string {
  return datos.map((d) => `${d.etiqueta}: ${d.valor || "(falta)"}`).join("\n");
}

// ── Cubicador: ¿esta madera es de un permiso? ───────────────────────────────

/**
 * Los permisos de la madera del cubicador: el de la ficha de la cubicación y
 * los de los bloques sembrados desde Capacidad (la hoja de rolliza). Sin
 * repetir, en el orden en que aparecen.
 */
export function permisosDelLote(
  tituloDeLaFicha: string | null | undefined,
  bloques: ReadonlyArray<{ id: string; permiso?: string | null; trozaIds?: readonly string[] | null }>,
): { permisos: string[]; bloqueId: string | null } {
  const vistos = new Set<string>();
  const permisos: string[] = [];
  const sumar = (p: unknown) => {
    const v = t(p);
    if (v && !vistos.has(v.toUpperCase())) {
      vistos.add(v.toUpperCase());
      permisos.push(v);
    }
  };
  sumar(tituloDeLaFicha);
  const conPermiso = bloques.filter((b) => t(b.permiso));
  conPermiso.forEach((b) => sumar(b.permiso));
  /* Un solo bloque con permiso: el enlace abre directo su recorrido. */
  return { permisos, bloqueId: conPermiso.length === 1 ? conPermiso[0].id : null };
}
