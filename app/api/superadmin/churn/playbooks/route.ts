import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { SuperadminChurnPlaybooksDB } from "@/lib/db/superadmin-churn-playbooks.db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { SuperadminChurnSignalsDB } from "@/lib/db/superadmin-churn-signals.db";
import { ACCIONES, SENALES, SEVERIDADES } from "@/lib/churn/playbook-catalog";

// ─── Schemas de validación ────────────────────────────────────────────────────

// Una sola fuente con la pantalla de reglas (lib/churn/playbook-catalog.ts).
const VALID_SIGNALS = SENALES;
const VALID_SEVERITIES = SEVERIDADES;
const VALID_ACTIONS = ACCIONES;

// Campos SIN `.default()`: en Zod 4 `.partial()` conserva los defaults, y un PATCH
// con sólo `{ id, isActive: false }` reescribía triggerSeverity a "high" (medido
// 2026-10-09: «critical_score» quedó en high). Los defaults van sólo en el alta.
const playbookFields = {
  name: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "Solo letras minúsculas, números y guión bajo"),
  triggerSignal: z.enum(VALID_SIGNALS),
  triggerSeverity: z.enum(VALID_SEVERITIES),
  action: z.enum(VALID_ACTIONS),
  templateId: z.string().max(100).optional().nullable(),
  discountPercent: z.number().int().min(1).max(100).optional().nullable(),
  discountDays: z.number().int().min(1).max(365).optional().nullable(),
  isActive: z.boolean(),
};

const createPlaybookSchema = z.object({
  ...playbookFields,
  triggerSeverity: playbookFields.triggerSeverity.default("high"),
  isActive: playbookFields.isActive.default(true),
});

const updatePlaybookSchema = z
  .object(playbookFields)
  .partial()
  .extend({ id: z.string().min(1) });

// ─── GET /api/superadmin/churn/playbooks ──────────────────────────────────────

/**
 * Lista todos los playbooks.
 * Filtro opcional: ?isActive=true|false
 *
 * También devuelve lo que la pantalla de reglas necesita para leerlas:
 * `autorun` (si el cron ejecuta la acción o sólo guarda la alerta) y las
 * alertas abiertas por tipo y severidad (a cuántos negocios les toca hoy).
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
    const [playbooks, abiertas] = await Promise.all([
      SuperadminChurnPlaybooksDB.list(isActiveFilter),
      SuperadminChurnSignalsDB.resumenAbiertas(),
    ]);
    const autorun = (process.env.CHURN_AUTORUN ?? "").toLowerCase() === "true";

    return NextResponse.json({ playbooks, autorun, abiertas });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── POST /api/superadmin/churn/playbooks — crear playbook ───────────────────

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
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
    logSuperadminAction(
      "create_churn_playbook",
      `Creó la regla de retención "${playbook.name}"`,
      { playbookId: playbook.id, action: playbook.action, triggerSignal: playbook.triggerSignal },
      auth.username,
    ).catch((err) =>
      logger.error("[churn/playbooks POST] audit log failed", { err: String(err) }),
    );

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
