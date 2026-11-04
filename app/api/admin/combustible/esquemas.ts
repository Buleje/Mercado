import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { AdminRole } from "@/lib/session";

/**
 * Lo que comparten las rutas del cuaderno de combustible (ADR-533): quién
 * puede qué, los cuerpos (Zod) y cómo se arma la fecha del renglón.
 */

/** Leer y anotar: el que despacha en el almacén también (almacenero). */
export const ROLES_ANOTAR: readonly AdminRole[] = ["admin", "owner", "cajero", "almacenero"];
/** Anular un renglón o cambiar lo declarado: solo el dueño/admin. */
export const ROLES_ANULAR: readonly AdminRole[] = ["admin", "owner"];

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha aaaa-mm-dd");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora hh:mm").optional().nullable();
const texto = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const ingresoSchema = z
  .object({
    tipo: z.enum(["compra", "inicial"]).default("compra"),
    fecha: dia,
    hora,
    factura: texto(40),
    grifo: texto(150),
    grifoRuc: z.string().trim().regex(/^\d{11}$/, "El RUC tiene 11 dígitos").optional().nullable().or(z.literal("").transform(() => null)),
    guia: texto(40),
    cilindros: z.number().int().min(1).max(20),
    galones: z.number().positive().max(1100),
    precioGal: z.number().min(0).max(1000).optional().nullable(),
    monto: z.number().min(0).max(1_000_000).optional().nullable(),
    notas: texto(500),
    anotarGasto: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "compra" && !v.factura) ctx.addIssue({ code: "custom", path: ["factura"], message: "Falta el n.° de factura" });
    if (v.tipo === "compra" && !v.grifo) ctx.addIssue({ code: "custom", path: ["grifo"], message: "Falta el grifo" });
  });

export const valeSchema = z.object({
  fecha: dia,
  hora,
  maquinaId: z.string().min(1).max(40),
  horometro: z.number().min(0).max(9_999_999).optional().nullable(),
  galones: z.number().positive().max(500),
  operador: z.string().trim().min(2, "Falta el operador").max(100),
  /** PNG de la firma dibujada (~10 KB). */
  firma: z.string().startsWith("data:image/png;base64,").max(150_000).optional().nullable(),
  notas: texto(500),
});

export const conteoSchema = z.object({
  fecha: dia,
  hora,
  cilindros: z.number().int().min(0).max(50),
  galones: z.number().min(0).max(5000),
  contadoPor: z.string().trim().min(2, "Falta quién contó").max(100),
  testigo: texto(100),
  notas: texto(500),
});

export const anularSchema = z.object({ motivo: z.string().trim().min(3, "Escribe el motivo").max(300) });

export const configSchema = z.object({
  producto: z.string().trim().min(2).max(80),
  galPorCilindro: z.number().positive().max(100),
  maxCilindros: z.number().int().min(1).max(50),
  cupoAnualGal: z.number().positive().max(1_000_000).nullable(),
  proyeccionCilindros: z.array(z.number().int().min(0).max(100)).length(12).nullable(),
  responsable: z.string().trim().max(120).nullable(),
});

const LIMA_MS = 5 * 3600_000;

/**
 * La fecha del renglón: con hora, esa hora de Lima; sin hora, ahora si es hoy
 * y el mediodía si es otro día. Nunca en el futuro (desordena el saldo).
 */
export function fechaDelRenglon(fecha: string, h: string | null | undefined): Date | { error: string } {
  const ahora = Date.now();
  const hoy = new Date(ahora - LIMA_MS).toISOString().slice(0, 10);
  let t: number;
  if (h) t = Date.parse(`${fecha}T${h}:00Z`) + LIMA_MS;
  else if (fecha === hoy) t = ahora;
  else t = Date.parse(`${fecha}T12:00:00Z`) + LIMA_MS;
  if (!Number.isFinite(t)) return { error: "Fecha inválida" };
  if (t > ahora + 10 * 60_000) return { error: "La fecha no puede ser futura" };
  if (fecha < "2020-01-01") return { error: "Fecha muy antigua" };
  return new Date(t);
}

/** El cuerpo JSON validado o la respuesta 400 lista. */
export async function leerCuerpo<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, res: NextResponse.json({ error: "JSON inválido" }, { status: 400 }) };
  }
  const p = schema.safeParse(body);
  if (!p.success) {
    const primero = p.error.issues[0];
    return { ok: false, res: NextResponse.json({ error: primero?.message ?? "Datos inválidos", campo: primero?.path.join("."), issues: p.error.issues }, { status: 400 }) };
  }
  return { ok: true, data: p.data };
}
