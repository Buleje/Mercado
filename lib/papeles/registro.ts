/**
 * lib/papeles/registro.ts — Registro de papeles emitidos (ADR-534). Puro y
 * client-safe (sin prisma): esquema del pedido, forma pública y la regla de
 * versiones que aplica `PapelesEmitidosDB.registrar`.
 *
 * Por diseño NO hay datos personales (nombre, DNI, detalle): la página pública
 * del QR no puede mostrar lo que la tabla no guarda (Ley 29733).
 */
import { z } from "zod";

export const TIPOS_PAPEL = [
  "proforma",
  "nota-venta",
  "estado-cuenta",
  "liquidacion",
  "recibo",
  "contrato",
  "solicitud",
  "carta",
  "informe",
  "resumen",
  "cubicacion",
] as const;
export type TipoPapel = (typeof TIPOS_PAPEL)[number];

/** Cómo se lee cada tipo en la página pública del QR. */
export const ETIQUETA_TIPO_PAPEL: Record<TipoPapel, string> = {
  proforma: "Proforma",
  "nota-venta": "Nota de venta",
  "estado-cuenta": "Estado de cuenta",
  liquidacion: "Liquidación",
  recibo: "Recibo",
  contrato: "Contrato",
  solicitud: "Solicitud",
  carta: "Carta",
  informe: "Informe",
  resumen: "Resumen",
  cubicacion: "Cubicación",
};

/** `reemplazado` lo pone SOLO el servidor (regla de versiones). */
export const ESTADOS_PAPEL = ["borrador", "revision", "oficial", "reemplazado", "anulado"] as const;
export type EstadoPapel = (typeof ESTADOS_PAPEL)[number];
export const ESTADOS_PEDIBLES = ["borrador", "revision", "oficial", "anulado"] as const;
export type EstadoPedible = (typeof ESTADOS_PEDIBLES)[number];

export const MONEDAS_PAPEL = ["PEN", "USD"] as const;
export type MonedaPapel = (typeof MONEDAS_PAPEL)[number];

export const RE_NUMERO = /^[A-Z]{2,4}-\d{4}$/;
export const RE_CODIGO = /^[A-Z0-9]{2,12}-[A-Z]{2,4}-\d{4}-[0-9A-F]{4}$/;
export const RE_CLAVE = /^[0-9a-f]{12}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_TOTAL = /^-?\d{1,12}(\.\d{1,2})?$/;

/** Largo máximo de un código que se busca (lo que venga de la URL se recorta). */
export const LARGO_MAX_CODIGO = 40;

/** «2026-02-30» no existe: la fecha tiene que volver igual tras pasar por Date. */
export function fechaValida(s: string): boolean {
  if (!RE_FECHA.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** BLAS-PRO-0002-7F3A → PRO-0002 (null si el código no tiene la forma). */
export function numeroDelCodigo(codigo: string): string | null {
  if (!RE_CODIGO.test(codigo)) return null;
  return codigo.split("-").slice(1, 3).join("-");
}

/** Normaliza lo que llega de la URL antes de buscar: recorta y mayúsculas. */
export function normalizarCodigo(raw: string): string {
  return raw.trim().slice(0, LARGO_MAX_CODIGO).toUpperCase();
}

export const RegistroPapelSchema = z
  .object({
    numero: z.string().regex(RE_NUMERO, "El número va así: PRO-0002."),
    tipo: z.enum(TIPOS_PAPEL, { message: "Tipo de papel desconocido." }),
    /** Se acepta por compatibilidad pero NO se guarda: el servidor lo arma del tipo (texto libre = riesgo de datos personales). */
    titulo: z.string().trim().max(80, "El título pasa de 80 letras.").optional(),
    fecha: z.string().refine(fechaValida, "La fecha va así: 2026-11-04."),
    estado: z.enum(ESTADOS_PEDIBLES, { message: "Estado inválido (borrador, revision, oficial o anulado)." }),
    codigo: z.string().regex(RE_CODIGO, "El código va así: BLAS-PRO-0002-7F3A."),
    clave: z.string().regex(RE_CLAVE, "La clave del QR son 12 letras hex en minúscula."),
    total: z.string().regex(RE_TOTAL, "El total va como texto con 2 decimales: \"1250.00\".").nullish(),
    moneda: z.enum(MONEDAS_PAPEL).default("PEN"),
    hojas: z.number().int().min(1).max(50).optional(),
    documentId: z.string().trim().min(1).max(40).optional(),
  })
  .superRefine((d, ctx) => {
    if (numeroDelCodigo(d.codigo) !== null && numeroDelCodigo(d.codigo) !== d.numero) {
      ctx.addIssue({
        code: "custom",
        path: ["codigo"],
        message: `El código ${d.codigo} no es del papel ${d.numero}.`,
      });
    }
  });
export type RegistroPapel = z.output<typeof RegistroPapelSchema>;

export const FiltroPapelesSchema = z.object({
  numero: z.string().regex(RE_NUMERO, "El número va así: PRO-0002.").optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});
export type FiltroPapeles = z.output<typeof FiltroPapelesSchema>;

/** El prefijo del código (BLAS en BLAS-PRO-0002-7F3A): es de UN solo negocio (el primero que lo usó). */
export const prefijoDelCodigo = (codigo: string): string => codigo.split("-")[0] ?? "";

/** «1250» / «1250.5» / «1250.50» → «1250.50» (sin pasar por float). */
export function totalDosDecimales(t: string | null | undefined): string | null {
  if (t == null) return null;
  const [ent, dec = ""] = t.split(".");
  return `${ent}.${dec.padEnd(2, "0")}`;
}

/** Lo ÚNICO que ve la página pública del QR. */
export interface PapelPublico {
  numero: string;
  /** El código completo, para compararlo con el impreso. */
  codigo: string;
  tipo: string;
  /** YYYY-MM-DD */
  fecha: string;
  estado: EstadoPapel;
  hojas: number | null;
  /** Solo con la clave del QR; si no, null. */
  total: string | null;
  moneda: string;
  reemplazado: boolean;
  /** La clave del QR coincidió (por eso hay total). */
  conClave: boolean;
}

// ── Regla de versiones ──────────────────────────────────────────────────────

export interface VersionPapel {
  codigo: string;
  estado: EstadoPapel;
  reemplazadoPor: string | null;
  createdAt: Date;
}

export interface PlanVersiones {
  /** Estado con que queda la fila que llega. */
  estado: EstadoPapel;
  reemplazadoPor: string | null;
  /** Código vigente del número después de registrar. */
  vigente: string;
  /** Códigos de OTRAS filas que pasan a (o vuelven a apuntar como) reemplazado → vigente. */
  aReemplazar: string[];
  /** De esas, cuántas no estaban reemplazadas antes. */
  nuevosReemplazados: number;
}

/**
 * La fila más NUEVA (createdAt) de un número es la vigente. Si la que llega es
 * la vigente, las demás no anuladas pasan a `reemplazado` → su código. Si llega
 * un código VIEJO, queda reemplazado aunque pida otro estado (salvo `anulado`).
 *
 * `otras` = filas del mismo número SIN la del código que llega. `entrante.createdAt`
 * = el de su fila si ya existía, o «ahora» si es nueva (empata a favor de la que llega).
 */
export function planVersiones(
  otras: readonly VersionPapel[],
  entrante: { codigo: string; estado: EstadoPedible; createdAt: Date },
): PlanVersiones {
  const masNueva = otras.reduce<VersionPapel | null>(
    (max, f) => (f.createdAt.getTime() > (max?.createdAt.getTime() ?? -Infinity) ? f : max),
    null,
  );
  const esVigente = !masNueva || masNueva.createdAt.getTime() <= entrante.createdAt.getTime();
  if (!esVigente) {
    const anulado = entrante.estado === "anulado";
    return {
      estado: anulado ? "anulado" : "reemplazado",
      reemplazadoPor: anulado ? null : masNueva.codigo,
      vigente: masNueva.codigo,
      aReemplazar: [],
      nuevosReemplazados: 0,
    };
  }
  const aTocar = otras.filter(
    (f) => f.estado !== "anulado" && !(f.estado === "reemplazado" && f.reemplazadoPor === entrante.codigo),
  );
  return {
    estado: entrante.estado,
    reemplazadoPor: null,
    vigente: entrante.codigo,
    aReemplazar: aTocar.map((f) => f.codigo),
    nuevosReemplazados: aTocar.filter((f) => f.estado !== "reemplazado").length,
  };
}
