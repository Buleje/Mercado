import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { partePatchSchema, parteParaRol, patchParaRol } from "@/lib/forestal/directorio";
import { validarRuc } from "@/lib/admin/ruc";
import { respuestaInvalida } from "@/lib/admin/sin-claves";

/**
 * PATCH /api/admin/forestal/directorio/[id] — edición PARCIAL de una ficha (ADR-524).
 *
 * Solo se escriben las claves que vinieron; `null` borra. Es lo que usa el MCP
 * (`parte_guardar` con id) y la ficha de persona: el POST con `id` trata el
 * cuerpo como la fila entera y borraba lo que no viajaba.
 *
 * `adjuntosAgregar` / `adjuntosQuitar`: suman o sacan papeles sin reemplazar la
 * lista. Cada documento que se agrega tiene que ser de este negocio (404).
 * RUC: 11 dígitos, prefijo y dígito verificador → si no, 422 `ruc_invalido`;
 * RUC 10 que no lleva el DNI de la ficha → pasa con `aviso`.
 *
 * Mismos roles que el POST del directorio (admin/almacenero/owner). Al
 * almacenero se le descartan del patch los datos personales (Ley 29733) y la
 * respuesta le llega sin ellos: corrige el teléfono, no el DNI.
 * Convive con `PATCH /directorio` (marca uso): otro path, sin choque.
 */

async function ensureSpec(tenantId: string) {
  const ok =
    (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")) ||
    (await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro"));
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "Ni el Libro CTP ni el Libro de Títulos Habilitantes están habilitados para este negocio." },
        { status: 403 },
      );
}

function esP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export const PATCH = withApiHandler(
  "forestal-directorio-patch-parcial",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const guard = await ensureSpec(auth.tenantId);
    if (guard) return guard;

    const { id: rawId } = await ctx.params;
    const id = (rawId ?? "").trim();
    if (!id || id.length > 40) return NextResponse.json({ error: "not_found" }, { status: 404 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
    }
    const parsed = partePatchSchema.safeParse(body);
    if (!parsed.success) {
      const r = respuestaInvalida(parsed.error);
      return NextResponse.json(r.body, { status: r.status });
    }
    const { patch, descartados } = patchParaRol(parsed.data, auth.role);

    try {
      const actual = await ForestDirectorioDB.getParte(auth.tenantId, id);
      if (!actual) return NextResponse.json({ error: "not_found" }, { status: 404 });

      // RUC: lo que no puede ser un RUC se rechaza con el motivo concreto.
      let aviso: string | null = descartados.length
        ? "Los datos personales (DNI, nacimiento, estado civil, parentesco) solo los cambia el dueño o el administrador: esos no se guardaron."
        : null;
      if (patch.ruc) {
        const r = validarRuc(patch.ruc, {
          docTipo: patch.docTipo !== undefined ? patch.docTipo : actual.docTipo,
          docNumero: patch.docNumero !== undefined ? patch.docNumero : actual.docNumero,
        });
        if (!r.ok) return NextResponse.json({ error: "ruc_invalido", message: r.motivo }, { status: 422 });
        aviso = [aviso, r.aviso].filter(Boolean).join(" ") || null;
      }

      // Un adjunto apunta a un documento DE ESTE negocio: un id ajeno es un 404.
      for (const a of patch.adjuntosAgregar ?? []) {
        // Con el rol: un papel con candado que este rol no ve es un 404 (no se ata a ciegas).
        const doc = await DocumentsDB.getById(auth.tenantId, a.documentId, auth.role);
        if (!doc) {
          return NextResponse.json(
            { error: "not_found", message: `El documento ${a.documentId} no está en el Drive de este negocio.` },
            { status: 404 },
          );
        }
      }

      const parte = await ForestDirectorioDB.actualizarParteParcial(auth.tenantId, id, patch, auth.username ?? "unknown");
      if (!parte) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const visible = parteParaRol(parte, auth.role);
      return NextResponse.json(aviso ? { parte: visible, aviso } : { parte: visible });
    } catch (err) {
      if (esP2002(err)) {
        return NextResponse.json(
          { error: "documento_duplicado", message: "Ese documento ya está en otra ficha del directorio. Edita esa ficha en vez de repetirlo." },
          { status: 409 },
        );
      }
      logger.error("[directorio.PATCH.id] failed", { error: String(err), tenantId: auth.tenantId, id });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  },
);
