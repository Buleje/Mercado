import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * Dos formas de PATCH: editar la ficha, o anotar que se le mandó un
 * recordatorio. Van juntas porque son la misma persona; se distinguen por
 * `action` para que editar sin querer no pise el recordatorio ni al revés.
 */
const RecordatorioSchema = z.object({ action: z.literal("recordatorio") });

const UpdateSchema = z.object({
  nombre: z.string().min(1).max(200),
  documento: z.string().max(20).optional(),
  telefono: z.string().max(20).optional(),
  notas: z.string().max(500).optional(),
  limiteCredito: z.number().positive().max(9_999_999).nullable().optional(),
  /** (330) Lo que trae RENIEC/SUNAT, o se carga a mano. */
  tipoDocumento: z.string().max(10).nullable().optional(),
  razonSocial: z.string().max(300).nullable().optional(),
  direccion: z.string().max(400).nullable().optional(),
  departamento: z.string().max(80).nullable().optional(),
  provincia: z.string().max(80).nullable().optional(),
  distrito: z.string().max(80).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  estadoSunat: z.string().max(60).nullable().optional(),
  condicionSunat: z.string().max(60).nullable().optional(),
  verificadoEn: z.string().max(40).nullable().optional(),
  banco: z.string().max(80).nullable().optional(),
  cuentaBancaria: z.string().max(40).nullable().optional(),
  cci: z.string().max(40).nullable().optional(),
  activo: z.boolean().optional(),
});

// PATCH /api/adelantos/beneficiarios/[id] — editar persona
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    const body: unknown = await req.json();

    // Anotar el recordatorio: la MISMA columna que escribe el cron, así los dos
    // se enteran y al deudor no le llega el aviso automático y el manual juntos.
    const esRecordatorio = RecordatorioSchema.safeParse(body);
    if (esRecordatorio.success) {
      const r = await AdelantosDB.marcarRecordatorio(auth.tenantId, id);
      if (!r) {
        // Ya se le recordó hoy. No es un error de quien pide: es que no hay
        // nada que hacer, y decirlo es más útil que fingir que se mandó.
        return NextResponse.json({ yaRecordadoHoy: true }, { status: 200 });
      }
      logActivity("Recordatorio", "adelanto", `Cobranza recordada`, id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
      return NextResponse.json(r);
    }

    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const benef = await AdelantosDB.updateBeneficiario(auth.tenantId, id, parsed.data);
    if (!benef) return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    logActivity("Actualizar", "adelanto", `Beneficiario ${benef.nombre}`, benef.id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(benef);
  } catch (e) {
    logger.error("[adelantos/beneficiarios/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// DELETE /api/adelantos/beneficiarios/[id] — eliminar persona (bloquea si tiene adelantos)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-benef"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id } = await params;
    const res = await AdelantosDB.deleteBeneficiario(auth.tenantId, id);
    if (!res.ok) {
      if (res.reason === "not_found") return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
      return NextResponse.json({ error: "No se puede eliminar: la persona tiene adelantos registrados." }, { status: 409 });
    }
    logActivity("Eliminar", "adelanto", `Beneficiario ${id}`, id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[adelantos/beneficiarios/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
