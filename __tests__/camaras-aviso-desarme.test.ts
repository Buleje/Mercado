import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Desarmar una cámara (detección o micrófono apagados) avisa al dueño
 * (security 05-10, ADR-472): SIEMPRE en el panel (HIGH) y por WhatsApp si la
 * cámara tiene número; con el WhatsApp caído queda la del panel.
 */

const H = vi.hoisted(() => ({
  panel: [] as Record<string, unknown>[],
  whatsapp: [] as { telefono: string; texto: string }[],
  waFalla: false,
}));

vi.mock("@/lib/db/notification-center.db", () => ({
  NotificationCenterDB: {
    create: vi.fn(async (d: Record<string, unknown>) => {
      H.panel.push(d);
      return { id: "n1", created: true };
    }),
  },
}));
vi.mock("@/lib/camaras/avisar", () => ({
  enlaceAlPanelDeCamaras: () => "https://x/admin?tab=camaras",
  mandarWhatsAppDeCamara: vi.fn(async (_t: string, telefono: string, texto: string) => {
    if (H.waFalla) throw new Error("twilio caído");
    H.whatsapp.push({ telefono, texto });
    return true;
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { avisarDesarme, textoDelDesarme } from "@/lib/camaras/ezviz-control-aviso.server";

const quien = { usuario: "brandon", rol: "owner" };
const ahora = new Date("2026-10-05T19:05:00Z"); // 14:05 en Lima

beforeEach(() => {
  H.panel.length = 0;
  H.whatsapp.length = 0;
  H.waFalla = false;
});

describe("aviso de desarme", () => {
  it("texto con quién, qué y la hora de Lima", () => {
    const t = textoDelDesarme("deteccion", quien, "Entrada", ahora);
    expect(t.titulo).toBe("Apagaron la detección de «Entrada»");
    expect(t.cuerpo).toMatch(/^brandon \(dueño\) la apagó a las 14:05\./);
  });

  it("panel HIGH siempre + WhatsApp si la cámara tiene número", async () => {
    await avisarDesarme(
      "t1",
      quien,
      { id: "cam1", nombre: "Entrada", avisos: { whatsapp: "987654321", cuando: "noche" } },
      "microfono",
      ahora,
    );
    expect(H.panel).toHaveLength(1);
    expect(H.panel[0]).toMatchObject({
      tenantId: "t1",
      severity: "HIGH",
      entityId: "cam1",
      title: "Apagaron el micrófono de «Entrada»",
    });
    expect(H.whatsapp).toEqual([
      { telefono: "987654321", texto: expect.stringMatching(/micrófono/) },
    ]);
  });

  it("sin número o con «nunca»: sólo el panel; WhatsApp caído: el panel queda y no tira", async () => {
    await avisarDesarme(
      "t1",
      quien,
      { id: "c", nombre: "Patio", avisos: null },
      "deteccion",
      ahora,
    );
    await avisarDesarme(
      "t1",
      quien,
      { id: "c", nombre: "Patio", avisos: { whatsapp: "987654321", cuando: "nunca" } },
      "deteccion",
      ahora,
    );
    expect(H.whatsapp).toHaveLength(0);
    H.waFalla = true;
    await expect(
      avisarDesarme(
        "t1",
        quien,
        { id: "c", nombre: "Patio", avisos: { whatsapp: "987654321", cuando: "siempre" } },
        "deteccion",
        ahora,
      ),
    ).resolves.toBeUndefined();
    expect(H.panel).toHaveLength(3);
  });
});
