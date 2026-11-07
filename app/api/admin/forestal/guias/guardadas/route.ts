import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { GuiasGuardadasDB } from "@/lib/db/guias-guardadas.db";
import { GuiaGuardadaInput } from "@/lib/forestal/guias-guardadas";
import { prepararGuia } from "@/lib/forestal/guias-guardadas-server";
import { errorJson, guardGuias } from "./guard";

/**
 * Guías guardadas antes del ingreso (Libro CTP, ADR-442).
 *
 *   GET  ?estado=por_ingresar|ingresadas|todas → la lista (por ingresar primero)
 *   GET  ?buscar=<N° de registro o de GTF>     → la que corresponde, o null
 *   POST GuiaGuardadaInput                     → guarda una (con `consultarSerfor`
 *                                                el SERVIDOR pide la ficha)
 *
 * Los papeles se suben por los casilleros de siempre
 * (`/api/admin/forestal/guias/documentos?gtf=`), que aceptan la GTF de una
 * guía guardada aunque el ingreso todavía no exista.
 */

const Estado = z.enum(["por_ingresar", "ingresadas", "todas"]);
const Buscar = z.string().trim().min(1).max(60);

export const GET = withApiHandler("forestal-guias-guardadas-get", async (req: NextRequest) => {
  const g = await guardGuias(req, false);
  if ("res" in g) return g.res;
  const { auth } = g;
  const sp = req.nextUrl.searchParams;

  if (sp.has("buscar")) {
    const q = Buscar.safeParse(sp.get("buscar"));
    if (!q.success) return NextResponse.json({ guia: null });
    const guia = await GuiasGuardadasDB.buscar(auth.tenantId, q.data, auth.role);
    return NextResponse.json({ guia });
  }

  const estado = Estado.safeParse(sp.get("estado") ?? "todas");
  if (!estado.success)
    return NextResponse.json({ error: "invalid_query", issues: estado.error.issues }, { status: 400 });
  return NextResponse.json(await GuiasGuardadasDB.list(auth.tenantId, estado.data, auth.role));
});

export const POST = withApiHandler("forestal-guias-guardadas-post", async (req: NextRequest) => {
  const g = await guardGuias(req, true);
  if ("res" in g) return g.res;
  const { auth } = g;
  const body = GuiaGuardadaInput.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "invalid_body", issues: body.error.issues }, { status: 400 });

  const p = await prepararGuia(body.data);
  if (!p.ok) return errorJson(p);
  const r = await GuiasGuardadasDB.crear(auth.tenantId, p.datos, auth.username ?? "unknown");
  if (!r.ok) return errorJson(r);
  const guia = await GuiasGuardadasDB.obtener(auth.tenantId, r.id, auth.role);
  return NextResponse.json({ guia, corregidos: p.corregidos, aviso: p.aviso }, { status: 201 });
});
