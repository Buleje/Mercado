import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ReferralsDB } from "@/lib/db/referrals.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { ConfigReferidasSchema, resumenDelPrograma } from "@/lib/referidas/reglas";

/**
 * Referidas «Trae a una amiga» del negocio (ADR-510), en Crecimiento › Puntos › Más.
 *
 *  · GET                         → `ResumenReferidas`: config + quién trajo a quién y sus premios (acredita antes).
 *  · PUT  {config}               → guarda las reglas (featureFlagsJson.referidas).
 *  · POST {amiga, quienRefiere}  → anota «a esta clienta la trajo tal» (o `codigo` en vez de `quienRefiere`).
 *  · DELETE ?amiga=X             → quita un vínculo anotado por error (sólo si no se usó ningún premio).
 *
 * Mismos roles que la lista de clientes: admin + el tier de gestión que `requireAdmin` deja pasar.
 */
const ROLES = ["admin"] as const;
const Celular = z.string().trim().min(6).max(40);
const AnotarSchema = z
  .object({ amiga: Celular, quienRefiere: Celular.optional(), codigo: z.string().trim().min(3).max(20).optional() })
  .refine((d) => Boolean(d.quienRefiere) !== Boolean(d.codigo), { message: "Indica el celular de quien la recomendó o su código" });

function errorDe(contexto: string, err: unknown, tenantId: string) {
  logger.error(`[admin/referidas] ${contexto} failed`, { error: err instanceof Error ? err.message : String(err), tenantId });
  return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await ReferralsDB.resumen(auth.tenantId));
  } catch (err) {
    return errorDe("GET", err, auth.tenantId);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  return runWithAuditContext(req, auth.username, async () => {
    try {
      const parsed = ConfigReferidasSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Revisa los datos del programa", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      }
      await ReferralsDB.guardarConfig(auth.tenantId, parsed.data);
      await logActivity("referidas.config", "loyalty", `Referidas: ${resumenDelPrograma(parsed.data)}`, undefined, auth.username, undefined, auth.tenantId);
      return NextResponse.json({ ok: true, config: parsed.data });
    } catch (err) {
      return errorDe("PUT", err, auth.tenantId);
    }
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  return runWithAuditContext(req, auth.username, async () => {
    try {
      const parsed = AnotarSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
      const { amiga, quienRefiere, codigo } = parsed.data;
      const r = await ReferralsDB.vincular(auth.tenantId, amiga, { quienRefierePhone: quienRefiere, codigo }, auth.username);
      if (!r.ok) return NextResponse.json({ error: r.mensaje }, { status: r.status });
      return NextResponse.json({ ok: true, mensaje: r.mensaje, cupones: r.cupones, referidaPor: r.referidaPor });
    } catch (err) {
      return errorDe("POST", err, auth.tenantId);
    }
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  return runWithAuditContext(req, auth.username, async () => {
    try {
      const amiga = Celular.safeParse(req.nextUrl.searchParams.get("amiga") ?? "");
      if (!amiga.success) return NextResponse.json({ error: "Falta el celular de la clienta" }, { status: 400 });
      const r = await ReferralsDB.desvincular(auth.tenantId, amiga.data, auth.username);
      if (!r.ok) return NextResponse.json({ error: r.mensaje }, { status: r.status });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorDe("DELETE", err, auth.tenantId);
    }
  });
}
