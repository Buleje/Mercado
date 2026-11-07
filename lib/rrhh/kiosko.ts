/**
 * kiosko.ts — marcación de asistencia por el propio trabajador (kiosko con el
 * QR del fotocheck, 2026-10-10). APAGADO por defecto.
 *
 * La tablet del local abre `/kiosko/asistencia/<token>`; el trabajador elige
 * ENTRADA o SALIDA, muestra el QR de su fotocheck (o tipea su DNI) y la
 * cámara le toma una foto. La marca se escribe con `origen: "kiosko"` por la
 * misma puerta de siempre (`revisarMarca` → `AsistenciaDB.guardar`).
 *
 * La configuración vive en `Settings.featureFlagsJson[CLAVE_KIOSKO]` (sin
 * migración): bandera + hash SHA-256 del secreto del enlace + vencimiento. El
 * token en claro sólo se muestra al generarlo.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import { z } from "zod";
import { STORE_TIMEZONE } from "@/lib/utils";
import { normalizarDocumento } from "./documento";
import { horaDeMinutos, minutosDeHora } from "./fechas";
import { tardanzaDe } from "./asistencia";
import { esMarcaDelKiosko, type EstadoAsistencia, type EstadoColaborador } from "./tipos";

/** Clave dentro de `Settings.featureFlagsJson`. */
export const CLAVE_KIOSKO = "kiosko_asistencia";

/** Dos marcas de la misma persona más juntas que esto: la segunda se ignora. */
export const MS_ENTRE_MARCAS = 2 * 60_000;

/** Opciones de vencimiento del enlace, en días. */
export const DIAS_VENCE_KIOSKO = [30, 90, 180, 365] as const;
export const DIAS_VENCE_POR_DEFECTO = 90;

/** Quien firma la marca en `marcadoPor` y en el Drive (vive en `tipos.ts`, lo lee la DTO). */
export { MARCADO_POR_KIOSKO } from "./tipos";

// ── Configuración ────────────────────────────────────────────────────────────

export interface ConfigKiosko {
  activo: boolean;
  /** SHA-256 (hex) del secreto. Nunca el secreto. */
  tokenHash: string | null;
  /** Últimos 4 caracteres del secreto: para reconocer cuál está impreso. */
  tokenFin: string | null;
  creadoEn: string | null;
  venceEn: string | null;
  creadoPor: string | null;
  /** Marcar sin foto (tablet sin cámara). Apagado por defecto: la foto es la única evidencia. */
  permitirSinFoto: boolean;
  /** SHA-256 del secreto de la cookie de la tablet atada (`kiosko-aparato.ts`). Nunca el secreto. */
  aparatoHash: string | null;
  aparatoEn: string | null;
  /** «Android · Chrome»: para reconocer la tablet en el panel. */
  aparatoNombre: string | null;
}

export const CONFIG_KIOSKO_VACIA: ConfigKiosko = {
  activo: false,
  tokenHash: null,
  tokenFin: null,
  creadoEn: null,
  venceEn: null,
  creadoPor: null,
  permitirSinFoto: false,
  aparatoHash: null,
  aparatoEn: null,
  aparatoNombre: null,
};

/** Lo que se pisa al generar o revocar un enlace: el aparato atado se va con él. */
export const SIN_APARATO = { aparatoHash: null, aparatoEn: null, aparatoNombre: null } as const satisfies Partial<ConfigKiosko>;
export const SIN_ENLACE = {
  tokenHash: null,
  tokenFin: null,
  creadoEn: null,
  venceEn: null,
  creadoPor: null,
  ...SIN_APARATO,
} as const satisfies Partial<ConfigKiosko>;

const configSchema = z.object({
  activo: z.boolean().catch(false),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().catch(null),
  tokenFin: z.string().max(8).nullable().catch(null),
  creadoEn: z.string().max(40).nullable().catch(null),
  venceEn: z.string().max(40).nullable().catch(null),
  creadoPor: z.string().max(120).nullable().catch(null),
  permitirSinFoto: z.boolean().catch(false),
  aparatoHash: z.string().regex(/^[0-9a-f]{64}$/).nullable().catch(null),
  aparatoEn: z.string().max(40).nullable().catch(null),
  aparatoNombre: z.string().max(60).nullable().catch(null),
});

/** Lo guardado → `ConfigKiosko`. Cualquier cosa rara = apagado y sin enlace. */
export function leerConfigKiosko(raw: unknown): ConfigKiosko {
  if (!raw || typeof raw !== "object") return { ...CONFIG_KIOSKO_VACIA };
  const r = configSchema.safeParse({ ...CONFIG_KIOSKO_VACIA, ...(raw as Record<string, unknown>) });
  return r.success ? r.data : { ...CONFIG_KIOSKO_VACIA };
}

export type EstadoEnlace = "sin_enlace" | "vigente" | "vencido";

export function estadoDelEnlace(c: ConfigKiosko, ahora: Date): EstadoEnlace {
  if (!c.tokenHash) return "sin_enlace";
  const vence = c.venceEn ? Date.parse(c.venceEn) : NaN;
  if (!Number.isFinite(vence) || vence <= ahora.getTime()) return "vencido";
  return "vigente";
}

/** Lo que ve el panel: nunca el hash. */
export interface ResumenKioskoDTO {
  activo: boolean;
  permitirSinFoto: boolean;
  enlace: {
    estado: Exclude<EstadoEnlace, "sin_enlace">;
    creadoEn: string | null;
    venceEn: string | null;
    creadoPor: string | null;
    /** «…ab12»: los últimos caracteres del enlace impreso. */
    termina: string | null;
    /** La tablet atada al enlace; null = todavía no se abrió en ninguna. */
    aparato: { nombre: string | null; desde: string | null } | null;
  } | null;
}

export function resumenKiosko(c: ConfigKiosko, ahora: Date): ResumenKioskoDTO {
  const estado = estadoDelEnlace(c, ahora);
  return {
    activo: c.activo,
    permitirSinFoto: c.permitirSinFoto,
    enlace:
      estado === "sin_enlace"
        ? null
        : {
            estado,
            creadoEn: c.creadoEn,
            venceEn: c.venceEn,
            creadoPor: c.creadoPor,
            termina: c.tokenFin,
            aparato: c.aparatoHash ? { nombre: c.aparatoNombre, desde: c.aparatoEn } : null,
          },
  };
}

/** Respuesta del panel al generar: el token en claro, una sola vez. */
export interface EnlaceGeneradoDTO extends ResumenKioskoDTO {
  token: string;
}

// ── Token: `<tenantId>.<secreto>` ────────────────────────────────────────────

/* El id del negocio es un cuid… salvo el principal, que se llama `main`. */
const TOKEN_RE = /^([a-z0-9][a-z0-9-]{1,39})\.([A-Za-z0-9_-]{32,64})$/;

/** Parte el token del enlace. El negocio va en claro (no es secreto); el secreto se compara por hash. */
export function partirToken(token: string | null | undefined): { tenantId: string; secreto: string } | null {
  const m = TOKEN_RE.exec((token ?? "").trim());
  return m ? { tenantId: m[1]!, secreto: m[2]! } : null;
}

export type RechazoToken = "apagado" | "sin_enlace" | "vencido" | "no_coincide";

/** ¿Este enlace sirve hoy? `coincide` = el hash del secreto es el guardado (lo calcula el servidor). */
export function revisarEnlace(c: ConfigKiosko, coincide: boolean, ahora: Date): { ok: true } | { ok: false; motivo: RechazoToken } {
  const estado = estadoDelEnlace(c, ahora);
  if (estado === "sin_enlace") return { ok: false, motivo: "sin_enlace" };
  if (!coincide) return { ok: false, motivo: "no_coincide" };
  if (estado === "vencido") return { ok: false, motivo: "vencido" };
  if (!c.activo) return { ok: false, motivo: "apagado" };
  return { ok: true };
}

// ── Código del trabajador ────────────────────────────────────────────────────

export type CodigoMarcacion = { tipo: "id"; id: string } | { tipo: "documento"; documento: string };

const CUID_RE = /^c[a-z0-9]{20,32}$/;

/**
 * Lo que leyó la cámara o lo que se tipeó → a quién buscar. El QR del
 * fotocheck es la URL de la ficha (`…?persona=<id>`); lo tipeado es el DNI
 * (o el documento que tenga). Nunca decide el negocio: eso lo pone el token,
 * y la búsqueda va con `tenantId` en el WHERE (un QR de otro negocio no
 * encuentra a nadie).
 */
export function codigoDeMarcacion(texto: string | null | undefined): CodigoMarcacion | null {
  const t = (texto ?? "").trim();
  if (!t || t.length > 500) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      const id = new URL(t).searchParams.get("persona")?.trim() ?? "";
      return CUID_RE.test(id) ? { tipo: "id", id } : null;
    } catch {
      return null;
    }
  }
  if (CUID_RE.test(t)) return { tipo: "id", id: t };
  const documento = normalizarDocumento(t);
  if (!documento || documento.length < 6 || documento.length > 15) return null;
  return { tipo: "documento", documento };
}

/** «Ana María Quispe» → «Ana». Lo único del trabajador que devuelve la ruta pública. */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

// ── Hora de Lima ─────────────────────────────────────────────────────────────

const FORMATO_HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: STORE_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutos desde las 00:00 de Lima (como `Asistencia.entradaMin`). */
export function minutosLimaDe(d: Date): number {
  return minutosDeHora(FORMATO_HORA.format(d)) ?? 0;
}

// ── Decidir la marca ─────────────────────────────────────────────────────────

export type TipoMarcaKiosko = "ENTRADA" | "SALIDA";

/** La viva del día (si hay), con lo que hace falta para decidir. */
export interface VivaKiosko {
  estado: EstadoAsistencia;
  entradaMin: number | null;
  salidaMin: number | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
  origen: string;
  marcadoPor: string;
  createdAt: Date;
}

export interface HorarioPuesto {
  horaEntrada: string | null;
  toleranciaMin: number;
}

/** Lo que se le pasa a `revisarMarca` (sin persona ni fecha: las pone la ruta). */
export interface MarcaKiosko {
  estado: EstadoAsistencia;
  entrada: string | null;
  salida: string | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
}

export type DecisionKiosko =
  /** Repetida: se devuelve la ÚLTIMA marca (su tipo y su hora), no la que se pidió. */
  | { accion: "ignorar"; tipo: TipoMarcaKiosko; hora: string }
  | { accion: "rechazar"; motivo: "ya_tiene_entrada" | "salida_antes_de_entrada"; message: string; hora: string | null }
  | { accion: "escribir"; marca: MarcaKiosko; hora: string; tarde: boolean | null; motivo: string };

const CON_TRABAJO: readonly EstadoAsistencia[] = ["PRESENTE", "TARDANZA", "MEDIO_DIA"];

/**
 * ENTRADA o SALIDA sobre la viva del día. Reglas:
 *  · la misma persona otra vez antes de 2 min de su marca del kiosko → se ignora (doble toque);
 *  · ENTRADA con entrada ya puesta → no se pisa («ya marcaste a las …»);
 *  · ENTRADA calcula la tardanza con el horario del puesto (`tardanzaDe`, ADR-417);
 *  · SALIDA pisa la salida anterior (vale la última) y nunca antes de la entrada;
 *  · SALIDA sin entrada se guarda igual, con nota, para que el dueño la complete;
 *  · una FALTA/PERMISO/… puesta antes la reemplaza: la persona vino.
 */
export function decidirMarcaKiosko(args: {
  tipo: TipoMarcaKiosko;
  viva: VivaKiosko | null;
  ahora: Date;
  horario: HorarioPuesto | null;
}): DecisionKiosko {
  const { tipo, viva, ahora, horario } = args;
  const ahoraMin = minutosLimaDe(ahora);
  const hora = horaDeMinutos(ahoraMin) ?? "";

  if (viva && esMarcaDelKiosko(viva.origen, viva.marcadoPor) && ahora.getTime() - viva.createdAt.getTime() < MS_ENTRE_MARCAS) {
    const tipoUltima: TipoMarcaKiosko = viva.salidaMin != null ? "SALIDA" : "ENTRADA";
    return { accion: "ignorar", tipo: tipoUltima, hora: horaDeMinutos(viva.salidaMin ?? viva.entradaMin) ?? hora };
  }

  /* La viva con trabajo (PRESENTE/TARDANZA/MEDIO_DIA): de ella se conserva lo puesto. */
  const conTrabajo = viva && CON_TRABAJO.includes(viva.estado) ? viva : null;
  const parCompleto = conTrabajo?.entradaMin != null && conTrabajo.salidaMin != null;
  const refrigerioMin = conTrabajo?.refrigerioMin ?? 0;
  const horasPrevias = conTrabajo && !parCompleto ? conTrabajo.horas : null;
  const notaPrevia = viva?.nota ?? null;

  if (tipo === "ENTRADA") {
    if (viva?.entradaMin != null) {
      const ya = horaDeMinutos(viva.entradaMin);
      return { accion: "rechazar", motivo: "ya_tiene_entrada", message: `Ya marcaste tu entrada a las ${ya}.`, hora: ya };
    }
    const t = horario ? tardanzaDe(hora, horario.horaEntrada, horario.toleranciaMin) : null;
    const tarde = t ? t.tarde : null;
    let estado: EstadoAsistencia = "PRESENTE";
    if (tarde === true) estado = "TARDANZA";
    else if (conTrabajo && (tarde === null || conTrabajo.estado === "MEDIO_DIA")) estado = conTrabajo.estado;
    const salida = viva?.salidaMin != null && viva.salidaMin > ahoraMin ? horaDeMinutos(viva.salidaMin) : null;
    return {
      accion: "escribir",
      marca: { estado, entrada: hora, salida, refrigerioMin, horas: salida ? null : horasPrevias, nota: notaPrevia },
      hora,
      tarde,
      motivo: "Marcó su entrada en el kiosko",
    };
  }

  // SALIDA
  if (viva?.entradaMin != null && ahoraMin <= viva.entradaMin) {
    return {
      accion: "rechazar",
      motivo: "salida_antes_de_entrada",
      message: "La salida tiene que ser después de tu entrada: avísale al encargado.",
      hora: horaDeMinutos(viva.entradaMin),
    };
  }
  const entrada = horaDeMinutos(conTrabajo?.entradaMin ?? null);
  return {
    accion: "escribir",
    marca: {
      estado: conTrabajo?.estado ?? "PRESENTE",
      entrada,
      salida: hora,
      refrigerioMin,
      horas: entrada ? null : horasPrevias,
      nota: entrada ? notaPrevia : (notaPrevia ?? "Marcó la salida en el kiosko sin entrada"),
    },
    hora,
    tarde: null,
    motivo: "Marcó su salida en el kiosko",
  };
}

/** Sólo los ACTIVOS marcan en el kiosko (vacaciones, licencia o cese → avisar al encargado). */
export function puedeMarcarEnKiosko(estado: EstadoColaborador): boolean {
  return estado === "ACTIVO";
}

// ── Contratos HTTP ───────────────────────────────────────────────────────────

export const kioskoAjustesSchema = z
  .object({ activo: z.boolean().optional(), permitirSinFoto: z.boolean().optional() })
  .refine((b) => b.activo !== undefined || b.permitirSinFoto !== undefined, { message: "nada que cambiar" });
export const kioskoGenerarSchema = z.object({
  venceDias: z
    .number()
    .int()
    .refine((d) => (DIAS_VENCE_KIOSKO as readonly number[]).includes(d))
    .optional(),
});
export const kioskoMarcarSchema = z.object({
  token: z.string().trim().min(10).max(160),
  codigo: z.string().trim().min(1).max(500),
  tipo: z.enum(["ENTRADA", "SALIDA"]),
});

export const kioskoEmparejarSchema = z.object({ token: z.string().trim().min(10).max(160) });

/** Respuesta de `/api/kiosko/emparejar` (la tablet al abrir el enlace). */
export type RespuestaEmparejar =
  | { ok: true; fotoObligatoria: boolean; recienAtada: boolean }
  | { ok: false; error: string; message: string };

/** Lo único que devuelve la ruta pública. */
export type RespuestaKiosko =
  | { ok: true; nombre: string; tipo: TipoMarcaKiosko; hora: string; repetida: boolean }
  | { ok: false; error: string; message: string; nombre?: string; hora?: string | null };
