/**
 * Stories — MeteringCard
 *
 * 3 estados: healthy (verde), warning (amarillo), critical (rojo).
 * Usa el componente cliente directamente para evitar el fetch del RSC.
 *
 * NOTA (Chromatic compat): METERED_EVENTS se hardcodea aqui en vez de importar
 * `@/lib/billing/metering` porque ese modulo tiene `import "server-only"` +
 * prisma client, que no buildea en el sandbox de Storybook. El array aqui
 * tiene que mantenerse en sync si cambia `METERED_EVENTS` en lib/billing.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { MeteringCardClient } from "./MeteringCard.client";
import type { MeteringSnapshot } from "./types";

// Inline copy de METERED_EVENTS para evitar arrastrar prisma/server-only.
const METERED_EVENTS = [
  "order.created",
  "ai.call",
  "ai.recommend",
  "ai.insight",
  "sms.sent",
  "whatsapp.sent",
  "sunat.emitted",
  "storage.blob",
] as const;

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<MeteringSnapshot> = {}): MeteringSnapshot {
  const baseSparklines = Object.fromEntries(
    METERED_EVENTS.map((e) => [e, [12, 18, 14, 22, 19, 25, 30]]),
  ) as MeteringSnapshot["sparklines"];

  return {
    tenantId: "tenant_demo",
    plan: "starter",
    period: {
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-05-01T00:00:00.000Z",
    },
    usage: Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
    quotas: Object.fromEntries(
      METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }]),
    ) as MeteringSnapshot["quotas"],
    estimatedCostUsd: 0,
    sparklines: baseSparklines,
    ...overrides,
  };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof MeteringCardClient> = {
  title: "Admin/Billing/MeteringCard",
  component: MeteringCardClient,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Tarjeta de uso facturable para el dashboard de admin. Muestra metricas del plan con semaforo visual, barras de progreso y sparklines de 7 dias.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    onUpgrade: { action: "upgrade clicked" },
  },
};

export default meta;
type Story = StoryObj<typeof MeteringCardClient>;

// ─── Historia 1: Saludable (todo verde) ───────────────────────────────────────

export const Saludable: Story = {
  name: "Saludable — todo en verde",
  args: {
    snapshot: makeSnapshot({
      plan: "pro",
      usage: {
        "order.created":  320,
        "ai.call":        150,
        "ai.recommend":   890,
        "ai.insight":     210,
        "sms.sent":       45,
        "whatsapp.sent":  1200,
        "sunat.emitted":  88,
        "storage.blob":   3_400,
      },
      quotas: Object.fromEntries(
        METERED_EVENTS.map((e) => [e, { limit: 10_000, alertAt: 0.9 }]),
      ) as MeteringSnapshot["quotas"],
      estimatedCostUsd: 24.30,
    }),
  },
  parameters: {
    docs: {
      description: { story: "Plan Pro con uso bien por debajo del 70% en todas las metricas. Sin alertas." },
    },
  },
};

// ─── Historia 2: Advertencia (amarillo) ──────────────────────────────────────

export const Advertencia: Story = {
  name: "Advertencia — cerca del limite",
  args: {
    snapshot: makeSnapshot({
      plan: "starter",
      usage: {
        "order.created":  780,
        "ai.call":        420,
        "ai.recommend":   1_450,
        "ai.insight":     650,
        "sms.sent":       120,
        "whatsapp.sent":  3_200,
        "sunat.emitted":  210,
        "storage.blob":   6_800,
      },
      quotas: {
        "order.created":  { limit: 1_000,  alertAt: 0.8 },
        "ai.call":        { limit: 500,    alertAt: 0.8 },
        "ai.recommend":   { limit: 2_000,  alertAt: 0.9 },
        "ai.insight":     { limit: 1_000,  alertAt: 0.9 },
        "sms.sent":       { limit: 500,    alertAt: 0.8 },
        "whatsapp.sent":  { limit: 5_000,  alertAt: 0.8 },
        "sunat.emitted":  { limit: 500,    alertAt: 0.9 },
        "storage.blob":   { limit: 10_000, alertAt: 0.8 },
      },
      estimatedCostUsd: 68.50,
    }),
  },
  parameters: {
    docs: {
      description: { story: "Plan Starter con 'order.created' y 'ai.call' en zona amarilla (70-90%). Se muestran las advertencias." },
    },
  },
};

// ─── Historia 3: Critico (rojo) ───────────────────────────────────────────────

export const Critico: Story = {
  name: "Critico — limite alcanzado",
  args: {
    snapshot: makeSnapshot({
      plan: "free",
      usage: {
        "order.created":  98,
        "ai.call":        49,
        "ai.recommend":   185,
        "ai.insight":     80,
        "sms.sent":       48,
        "whatsapp.sent":  480,
        "sunat.emitted":  0,
        "storage.blob":   920,
      },
      quotas: {
        "order.created":  { limit: 100,   alertAt: 0.8 },
        "ai.call":        { limit: 50,    alertAt: 0.8 },
        "ai.recommend":   { limit: 200,   alertAt: 0.8 },
        "ai.insight":     { limit: 100,   alertAt: 0.8 },
        "sms.sent":       { limit: 50,    alertAt: 0.8 },
        "whatsapp.sent":  { limit: 500,   alertAt: 0.8 },
        "sunat.emitted":  { limit: 0,     alertAt: 1.0 },
        "storage.blob":   { limit: 1_000, alertAt: 0.8 },
      },
      estimatedCostUsd: 4.20,
    }),
  },
  parameters: {
    docs: {
      description: { story: "Plan Gratis con multiples metricas en rojo (>90%). Badge 'Limite alcanzado' y boton 'Mejorar plan' visibles." },
    },
  },
};
