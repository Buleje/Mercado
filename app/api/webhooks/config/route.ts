/**
 * Webhooks configurables por tenant
 *
 * GET    /api/webhooks/config  → lista webhooks del tenant
 * POST   /api/webhooks/config  → crea un webhook
 * DELETE /api/webhooks/config  → elimina un webhook por id
 *
 * Los webhooks se almacenan en Settings.featureFlagsJson bajo la clave "webhooks"
 * (sin migración de schema).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueActivityLog } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type WebhookEvent = "new_order" | "low_stock" | "new_customer" | "payment";

export interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

// ── Schemas Zod ──────────────────────────────────────────────────────────────

const VALID_EVENTS: WebhookEvent[] = ["new_order", "low_stock", "new_customer", "payment"];

const CreateWebhookSchema = z.object({
  url: z.string().url("URL inválida").max(500),
  events: z
    .array(z.enum(["new_order", "low_stock", "new_customer", "payment"]))
    .min(1, "Selecciona al menos un evento"),
  active: z.boolean().default(true),
});

const DeleteWebhookSchema = z.object({
  id: z.string().min(1, "ID requerido"),
});

// ── Helpers para leer/escribir webhooks en featureFlagsJson ──────────────────

async function getWebhooksFromSettings(tenantId: string): Promise<WebhookConfig[]> {
  const row = await prisma.settings.findUnique({
    where: { tenantId },
    select: { featureFlagsJson: true },
  }) as { featureFlagsJson: string | null } | null;

  if (!row?.featureFlagsJson) return [];

  try {
    const parsed = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
    const webhooks = parsed["webhooks"];
    if (Array.isArray(webhooks)) return webhooks as WebhookConfig[];
  } catch {
    // ignorar JSON corrupto
  }
  return [];
}

async function saveWebhooksToSettings(tenantId: string, webhooks: WebhookConfig[]): Promise<void> {
  // Leer flags actuales para no sobreescribirlos
  const row = await prisma.settings.findUnique({
    where: { tenantId },
    select: { featureFlagsJson: true },
  }) as { featureFlagsJson: string | null } | null;

  let current: Record<string, unknown> = {};
  if (row?.featureFlagsJson) {
    try {
      current = JSON.parse(row.featureFlagsJson) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const updated = { ...current, webhooks };

  await prisma.settings.upsert({
    where: { tenantId },
    update: { featureFlagsJson: JSON.stringify(updated) },
    create: { tenantId, featureFlagsJson: JSON.stringify(updated) },
  });
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const webhooks = await getWebhooksFromSettings(auth.tenantId);
    return NextResponse.json({ webhooks, events: VALID_EVENTS });
  } catch (e) {
    return NextResponse.json(
      { error: "Error al obtener webhooks", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = CreateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const webhooks = await getWebhooksFromSettings(auth.tenantId);

    const newWebhook: WebhookConfig = {
      id: crypto.randomUUID(),
      url: parsed.data.url,
      events: parsed.data.events,
      active: parsed.data.active,
      createdAt: new Date().toISOString(),
    };

    await saveWebhooksToSettings(auth.tenantId, [...webhooks, newWebhook]);

    enqueueActivityLog({ action: "Crear", resource: "webhook", resourceId: newWebhook.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Webhook creado: ${newWebhook.url}` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json({ webhook: newWebhook }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: "Error al crear webhook", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = DeleteWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const webhooks = await getWebhooksFromSettings(auth.tenantId);
    const filtered = webhooks.filter((w) => w.id !== parsed.data.id);

    if (filtered.length === webhooks.length) {
      return NextResponse.json({ error: "Webhook no encontrado" }, { status: 404 });
    }

    await saveWebhooksToSettings(auth.tenantId, filtered);

    enqueueActivityLog({ action: "Eliminar", resource: "webhook", resourceId: parsed.data.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Webhook eliminado: ${parsed.data.id}` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Error al eliminar webhook", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
