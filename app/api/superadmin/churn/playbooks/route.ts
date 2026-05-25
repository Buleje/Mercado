import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { SuperadminChurnPlaybooksDB } from "@/lib/db/superadmin-churn-playbooks.db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";

// ─── Schemas de validación ────────────────────────────────────────────────────

const VALID_SIGNALS = [
  "login_drop",
  "order_drop",
  "trial_expiring",
  "support_unresolved",
  "plan_downgrade_intent",
] as const;

const VALID_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const VALID_ACTIONS = ["email", "whatsapp", "discount", "call"] as const;

const createPlaybookSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "Solo letras minúsculas, números y guión bajo"),
  triggerSignal: z.enum(VALID_SIGNALS),
  triggerSeverity: z.enum(VALID_SEVERITIES).default("high"),
  action: z.enum(VALID_ACTIONS),
  templateId: z.string().max(100).optional().nullable(),
  discountPercent: z.number().int().min(1).max(100).optional().nullable(),
  discountDays: z.number().int().min(1).max(365).optional().nullable(),
  isActive: z.boolean().default(true),
});

const updatePlaybookSchema = createPlaybookSchema
  .partial()
  .extend({ id: z.string().min(1) });

// ─── GET /api/superadmin/churn/playbooks ──────────────────────────────────────

/**
 * Lista todos los playbooks.
 * Filtro opcional: ?isActive=true|false
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    const url = new URL(req.url);
    const isActiveParam = url.searchParams.get("isActive");
    const isActiveFilter =
      isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;

    logger.info("[superadmin/churn/playbooks] GET", { user: auth.username, isActiveFilter });

    // Audit project-wide 2026-05-19: migrado a SuperadminChurnPlaybooksDB.
    const playbooks = await SuperadminChurnPlaybooksDB.list(isActiveFilter);

    return NextResponse.json({ playbooks });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST /api/superadmin/churn/playbooks — crear playbook ───────────────────

export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "superadmin-churn-playbooks"); if (_rl) return _rl;
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = createPlaybookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Verificar que el nombre no exista
    const existing = await SuperadminChurnPlaybooksDB.findByName(parsed.data.name);
    if (existing) {
      return NextResponse.json(
        { error: `Ya existe un playbook con el nombre "${parsed.data.name}"` },
        { status: 409 }
      );
    }

    const playbook = await SuperadminChurnPlaybooksDB.create({
      name: parsed.data.name,
      triggerSignal: parsed.data.triggerSignal,
      triggerSeverity: parsed.data.triggerSeverity,
      action: parsed.data.action,
      templateId: parsed.data.templateId ?? null,
      discountPercent: parsed.data.discountPercent ?? null,
      discountDays: parsed.data.discountDays ?? null,
      isActive: parsed.data.isActive,
    });

    logger.info("[superadmin/churn/playbooks] Playbook creado", {
      user: auth.username,
      name: playbook.name,
      action: playbook.action,
    });

    return NextResponse.json({ playbook }, { status: 201 });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── PATCH /api/superadmin/churn/playbooks — actualizar playbook ─────────────

export async function PATCH(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "superadmin-churn-playbooks"); if (_rl) return _rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = updatePlaybookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { id, ...updateData } = parsed.data;

    const existing = await SuperadminChurnPlaybooksDB.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Playbook no encontrado" }, { status: 404 });
    }

    // Si se cambia el nombre, verificar unicidad
    if (updateData.name && updateData.name !== existing.name) {
      const nameConflict = await SuperadminChurnPlaybooksDB.findByName(updateData.name);
      if (nameConflict) {
        return NextResponse.json(
          { error: `Ya existe un playbook con el nombre "${updateData.name}"` },
          { status: 409 }
        );
      }
    }

    const updated = await SuperadminChurnPlaybooksDB.update(id, updateData);

    logger.info("[superadmin/churn/playbooks] Playbook actualizado", {
      user: auth.username,
      id,
      name: updated.name,
    });
    logSuperadminAction(
      "update_churn_playbook",
      `Actualizó playbook "${updated.name}"`,
      { playbookId: id, changes: updateData },
      auth.username,
    ).catch((err) =>
      logger.error("[churn/playbooks PATCH] audit log failed", { err: String(err) }),
    );

    return NextResponse.json({ playbook: updated });

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── DELETE /api/superadmin/churn/playbooks — desactivar playbook ────────────

export async function DELETE(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "superadmin-churn-playbooks"); if (_rl) return _rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta el parámetro id" }, { status: 400 });
    }

    const existing = await SuperadminChurnPlaybooksDB.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Playbook no encontrado" }, { status: 404 });
    }

    // Soft delete: desactivar en lugar de eliminar
    const updated = await SuperadminChurnPlaybooksDB.deactivate(id);

    logger.info("[superadmin/churn/playbooks] Playbook desactivado", {
      user: auth.username,
      id,
      name: updated.name,
    });
    logSuperadminAction(
      "deactivate_churn_playbook",
      `Desactivó playbook "${updated.name}"`,
      { playbookId: id, previousName: existing.name },
      auth.username,
    ).catch((err) =>
      logger.error("[churn/playbooks DELETE] audit log failed", { err: String(err) }),
    );

    return NextResponse.json({ ok: true, playbook: updated });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
