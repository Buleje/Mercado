/**
 * Piezas comunes de las rutas de alquileres (ADR-524): roles, id del path,
 * lectura del JSON y el mapeo de los errores de `AlquileresDB` a HTTP.
 */
import type { AdminRole } from "@/lib/session";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import type { ResultadoPago } from "@/lib/db/alquileres.db";

export const ROLES_ALQUILERES: readonly AdminRole[] = ["admin", "owner"];

const STATUS: Record<string, number> = {
  not_found: 404,
  invalid_body: 400,
  periodo_ya_pagado: 409,
  tiene_pagos: 409,
  periodo_fuera_de_plazo: 422,
};

export function falla(r: { error: string; message: string } & Record<string, unknown>): NextResponse {
  const cuerpo: Record<string, unknown> = { ...r };
  delete cuerpo.ok;
  return NextResponse.json(cuerpo, { status: STATUS[r.error] ?? 400 });
}

/** id del path: vacío o > 40 caracteres = no existe. */
export function idValido(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  return id && id.length <= 40 ? id : null;
}

export const noExiste = (message = "Ese alquiler no existe en este negocio.") =>
  NextResponse.json({ error: "not_found", message }, { status: 404 });

/** JSON del cuerpo + safeParse. Devuelve el dato o la respuesta de error. */
export async function leerCuerpo<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return { ok: false, res: NextResponse.json(r.body, { status: r.status }) };
  }
  return { ok: true, data: parsed.data };
}

/** Pago: 201 si se creó, 200 si es corrección o replay idéntico (`duplicado`). */
export function respuestaPago(r: ResultadoPago, creado: boolean): NextResponse {
  if (!r.ok) return falla(r);
  const aviso = r.aviso ? { aviso: r.aviso } : {};
  if (r.duplicado) return NextResponse.json({ pago: r.pago, alquiler: r.alquiler, duplicado: true, ...aviso });
  return NextResponse.json({ pago: r.pago, alquiler: r.alquiler, ...aviso }, { status: creado ? 201 : 200 });
}
