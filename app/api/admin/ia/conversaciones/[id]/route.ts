import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { leerJson } from "@/lib/errores/sin-dato";
import { processSafeInput } from "@/lib/ai-safety/sanitize";
import { IaConversacionesDB } from "@/lib/db/ia-conversaciones.db";

type Ctx = { params: Promise<{ id: string }> };

const ROLES = ["admin", "owner", "manager"] as const;
const Renombrar = z.object({ titulo: z.string().trim().min(1).max(120) });

/** GET → `{ id, titulo, mensajes: MensajeApp[] }` · 404 si no es de quien pide. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const limitado = await applyRateLimit(req, "SHELL_POLL", "ia-conversacion");
  if (limitado) return limitado;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const c = await IaConversacionesDB.obtener(auth.tenantId, auth.username, id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(c);
}

/** PATCH `{ titulo }` */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const limitado = await applyRateLimit(req, "MODERATE", "ia-conversacion-editar");
  if (limitado) return limitado;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const parsed = Renombrar.safeParse(await leerJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: "Escribe un título." }, { status: 400 });
  }
  const { id } = await ctx.params;
  const titulo = processSafeInput(parsed.data.titulo).trim();
  if (!titulo) return NextResponse.json({ error: "invalid_body", message: "Escribe un título." }, { status: 400 });
  const ok = await IaConversacionesDB.renombrar(auth.tenantId, auth.username, id, titulo);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, titulo });
}

/** DELETE */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const limitado = await applyRateLimit(req, "MODERATE", "ia-conversacion-borrar");
  if (limitado) return limitado;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const ok = await IaConversacionesDB.borrar(auth.tenantId, auth.username, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
