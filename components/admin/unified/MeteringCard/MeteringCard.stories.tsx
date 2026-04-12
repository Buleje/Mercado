/**
 * Stories — MeteringCard
 *
 * 3 estados: healthy (verde), warning (amarillo), critical (rojo).
 * Usa el componente cliente directamente para evitar el fetch del RSC.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { MeteringCardClient } from "./MeteringCard.client";
import type { MeteringSnapshot } from "./types";
import { METERED_EVENTS } from "@/lib/billing/metering";

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
          "Tarjeta de uso facturable para el dashboard de admin. Muestra métricas del plan con semáforo visual, barras de progreso y sparklines de 7 días.",
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
      description: { story: "Plan Pro con uso bien por debajo del 70% en todas las métricas. Sin alertas." },
    },
  },
};

// ─── Historia 2: Advertencia (amarillo) ──────────────────────────────────────

export const Advertencia: Story = {
  name: "Advertencia — cerca del límite",
  args: {
    snapshot: makeSnapshot({
      plan: "starter",
      usage: {
        "order.created":  780,  // 78% de 1000
        "ai.call":        420,  // 84% de 500
        "ai.recommend":   1_450, // 72% de 2000
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

// ─── Historia 3: Crítico (rojo) ───────────────────────────────────────────────

export const Critico: Story = {
  name: "Critico — límite alcanzado",
  args: {
    snapshot: makeSnapshot({
      plan: "free",
      usage: {
        "order.created":  98,   // 98% de 100 → rojo
        "ai.call":        49,   // 98% de 50  → rojo
        "ai.recommend":   185,  // 92% de 200 → rojo
        "ai.insight":     80,
        "sms.sent":       48,   // 96% de 50  → rojo
        "whatsapp.sent":  480,  // 96% de 500 → rojo
        "sunat.emitted":  0,
        "storage.blob":   920,  // 92% de 1000 → rojo
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
      description: { story: "Plan Gratis con múltiples métricas en rojo (>90%). Badge 'Límite alcanzado' y botón 'Mejorar plan' visibles." },
    },
  },
};
