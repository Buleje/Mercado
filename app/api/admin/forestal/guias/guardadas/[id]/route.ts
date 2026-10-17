import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { GuiasGuardadasDB } from "@/lib/db/guias-guardadas.db";
import { GuiaGuardadaInput } from "@/lib/forestal/guias-guardadas";
import { prepararGuia } from "@/lib/forestal/guias-guardadas-server";
import { errorJson, guardGuias } from "../guard";

/**
 * Una guía guardada (ADR-442).
 *
 *   GET    → el detalle (con la ficha de SERFOR)
 *   PATCH  GuiaGuardadaInput parcial → edita; si cambian GTF/titular/permiso,
 *          sus papeles se re-etiquetan y se mudan de carpeta
 *   DELETE → baja lógica, sólo admin y dueño. Los papeles se QUEDAN en el
 *          Drive (y en el ingreso, si lo hay): quitar la guía no borra nada.
 */

type Ctx = { params: Promise<{ id: string }> };
const Id = z.string().trim().min(1).max(40);

const noEsta = () =>
  NextResponse.json({ error: "not_found", message: "Esa guía ya no está." }, { status: 404 });

export const GET = withApiHandler("forestal-guia-guardada-get", async (req: NextRequest, ctx: Ctx) => {
  const g = await guardGuias(req, false);
  if ("res" in g) return g.res;
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return noEsta();
  const guia = await GuiasGuardadasDB.obtener(g.auth.tenantId, id.data, g.auth.role);
  return guia ? NextResponse.json({ guia }) : noEsta();
});

export const PATCH = withApiHandler("forestal-guia-guardada-patch", async (req: NextRequest, ctx: Ctx) => {
  const g = await guardGuias(req, true);
  if ("res" in g) return g.res;
  const { auth } = g;
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return noEsta();
  const body = GuiaGuardadaInput.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "invalid_body", issues: body.error.issues }, { status: 400 });

  const actual = await GuiasGuardadasDB.obtener(auth.tenantId, id.data, auth.role);
  if (!actual) return noEsta();
  const p = await prepararGuia(body.data, {
    numeroRegistro: actual.numeroRegistro,
    gtfNumber: actual.gtfNumber,
    gtfDate: actual.gtfDate,
    titularNombre: actual.titularNombre,
    titularDoc: actual.titularDoc,
    permisoCodigo: actual.permisoCodigo,
    contratoId: actual.contratoId,
    notas: actual.notas,
    serforGtf: actual.serforGtf,
    serforConsultadaEn: actual.serforConsultadaEn ? new Date(actual.serforConsultadaEn) : null,
  });
  if (!p.ok) return errorJson(p);
  const r = await GuiasGuardadasDB.editar(auth.tenantId, id.data, p.datos, auth.username ?? "unknown");
  if (!r.ok) return errorJson(r);
  const guia = await GuiasGuardadasDB.obtener(auth.tenantId, id.data, auth.role);
  return NextResponse.json({ guia, corregidos: p.corregidos, aviso: p.aviso });
});

export const DELETE = withApiHandler("forestal-guia-guardada-delete", async (req: NextRequest, ctx: Ctx) => {
  const g = await guardGuias(req, true);
  if ("res" in g) return g.res;
  const { auth } = g;
  /* `requireAdmin` deja pasar a manager por el bypass de management-tier:
     quitar una guía es una baja, sólo admin y dueño (como sus papeles). */
  const rol = soloAdminODueno(auth.role, "eliminar una guía guardada");
  if (rol) return rol;
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return noEsta();
  const ok = await GuiasGuardadasDB.eliminar(auth.tenantId, id.data, auth.username ?? "unknown");
  return ok ? NextResponse.json({ ok: true }) : noEsta();
});
