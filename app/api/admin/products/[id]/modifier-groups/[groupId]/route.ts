/**
 * PATCH  /api/admin/products/[id]/modifier-groups/[groupId] — update grupo
 * DELETE /api/admin/products/[id]/modifier-groups/[groupId] — borra grupo (cascade)
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductModifiersDB } from "@/lib/db/product-modifiers.db";
import { logger } from "@/lib/logger";

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  required: z.boolean().optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(1).max(20).optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withApiHandler(
  "admin-modifier-groups-patch",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-groups-patch");
    if (rl) return rl;

    const params = await ctx.params;
    const productId = parseInt(params.id ?? "0", 10);
    const groupId = params.groupId;
    if (!productId || !groupId) {
      return NextResponse.json({ error: "ids invalidos" }, { status: 400 });
    }

    const raw = await req.json().catch((err) => {
      logger.warn("[modifier-group] invalid json", { error: String(err) });
      return null;
    });
    const parsed = UpdateGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    // Para usar upsertGroup necesitamos el shape completo; cargamos el actual
    // y mergeamos los campos nuevos.
    const current = (await ProductModifiersDB.listForProductAdmin(
      auth.tenantId,
      productId,
    )).find((g) => g.id === groupId);
    if (!current) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }

    try {
      const updated = await ProductModifiersDB.upsertGroup(auth.tenantId, {
        id: groupId,
        productId,
        name: parsed.data.name ?? current.name,
        description:
          parsed.data.description !== undefined
            ? parsed.data.description
            : current.description,
        required: parsed.data.required ?? current.required,
        minSelect: parsed.data.minSelect ?? current.minSelect,
        maxSelect: parsed.data.maxSelect ?? current.maxSelect,
        position: parsed.data.position ?? current.position,
        isActive: parsed.data.isActive ?? current.isActive,
      });
      return NextResponse.json(updated);
    } catch (err) {
      logger.warn("[modifier-group] patch failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);

export const DELETE = withApiHandler(
  "admin-modifier-groups-delete",
  async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const rl = applyRateLimit(req, "GENEROUS", "modifier-groups-delete");
    if (rl) return rl;

    const params = await ctx.params;
    const groupId = params.groupId;
    if (!groupId) {
      return NextResponse.json({ error: "groupId invalido" }, { status: 400 });
    }

    try {
      await ProductModifiersDB.deleteGroup(auth.tenantId, groupId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.warn("[modifier-group] delete failed", { error: String(err) });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Error" },
        { status: 400 },
      );
    }
  },
);
