/**
 * Vigilar la pila (ADR-456 §4) con la base, la IA y el WhatsApp simulados.
 *
 * Lo que duele si falla: un WhatsApp de «falta madera» cada día que trabajó la
 * sierra, tres avisos por la misma ráfaga de fotos, o un aviso que no salió y
 * igual frena al siguiente tres horas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Camara, Captura } from "@/lib/camaras/camaras";

const H = vi.hoisted(() => ({
  respuesta: "" as string,
  iaLlamadas: 0,
  historial: [] as unknown[],
  asientos: [] as { section: string; entryDate: Date }[],
  libroFalla: false,
  turno: { ok: true, previo: null as string | null },
  salio: true,
  enviados: [] as { tenantId: string; numero: string; texto: string }[],
  liberados: 0,
  tenants: [] as string[],
  turnosComparar: {} as Record<string, string>,
  comparacionesLiberadas: 0,
}));

vi.mock("ai", () => ({
  generateText: async () => {
    H.iaLlamadas += 1;
    return { text: H.respuesta };
  },
}));
vi.mock("@/lib/ai/provider", () => ({ anthropicProvider: (m: string) => m }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: { canSpend: async () => true, recordSpend: async () => {} } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: {
    capturas: async (tenantId: string) => {
      H.tenants.push(tenantId);
      return H.historial;
    },
    list: async () => [camara],
    reservarAvisoPila: async () => H.turno,
    liberarAvisoPila: async () => {
      H.liberados += 1;
    },
    /* El turno de comparar, como lo deja el candado: el primero lo toma. */
    reservarComparacionPila: async (_t: string, camaraId: string, at: string) => {
      const previo = H.turnosComparar[camaraId] ?? null;
      if (previo && Math.abs(Date.parse(at) - Date.parse(previo)) < 30 * 60_000) return { ok: false, previo };
      H.turnosComparar[camaraId] = at;
      return { ok: true, previo };
    },
    liberarComparacionPila: async (_t: string, camaraId: string, at: string, previo: string | null) => {
      H.comparacionesLiberadas += 1;
      if (H.turnosComparar[camaraId] !== at) return;
      if (previo) H.turnosComparar[camaraId] = previo;
      else delete H.turnosComparar[camaraId];
    },
  },
}));
vi.mock("@/lib/db/forest-ctp.db", () => ({
  ForestCtpDB: {
    list: async (tenantId: string) => {
      H.tenants.push(tenantId);
      if (H.libroFalla) throw new Error("db caída");
      return { entries: H.asientos };
    },
  },
}));
vi.mock("@/lib/camaras/avisar", () => ({
  enlaceAlPanelDeCamaras: () => "https://panel/admin?tab=camaras",
  mandarWhatsAppDeCamara: async (tenantId: string, numero: string, texto: string) => {
    H.enviados.push({ tenantId, numero, texto });
    return H.salio;
  },
}));

const camara = {
  id: "cam-pila",
  nombre: "Patio",
  lugar: "Pila",
  token: "t".repeat(32),
  activa: true,
  creadaEn: "2026-09-01T00:00:00.000Z",
  vigilaPila: true,
  avisos: { whatsapp: "987654321", cuando: "siempre" },
} as Camara;

const cap = (id: string, at: string, evento: Captura["evento"] = "programada"): Captura => ({
  id,
  camaraId: "cam-pila",
  url: `https://x.supabase.co/${id}.webp`,
  evento,
  at,
});

import { vigilarPila } from "@/lib/camaras/pila";

/* 22:00 de Lima del 01/10: de noche, el patio sin nadie. */
const nueva = cap("nueva", "2026-10-02T03:00:00.000Z");

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  H.respuesta = JSON.stringify({ cambio: "bajo", confianza: "alta" });
  H.iaLlamadas = 0;
  H.historial = [nueva, cap("hace-10", "2026-10-02T02:50:00.000Z"), cap("hace-1h", "2026-10-02T02:00:00.000Z")];
  H.asientos = [];
  H.libroFalla = false;
  H.turno = { ok: true, previo: null };
  H.salio = true;
  H.enviados = [];
  H.liberados = 0;
  H.tenants = [];
  H.turnosComparar = {};
  H.comparacionesLiberadas = 0;
});

describe("vigilarPila", () => {
  it("bajó DE NOCHE y el libro no tiene despacho ni producción → WhatsApp y avisada", async () => {
    const r = await vigilarPila("t-blas", camara, nueva);
    expect(r).toEqual({ comparadaCon: "hace-1h", cambio: "bajo", confianza: "alta", despachoDelDia: false, produccionDelDia: false, avisada: true });
    expect(H.enviados).toHaveLength(1);
    expect(H.enviados[0]).toMatchObject({ tenantId: "t-blas", numero: "987654321" });
    expect(H.tenants.every((t) => t === "t-blas")).toBe(true);
  });

  it("día con producción anotada: la sierra explica que baje, sin WhatsApp", async () => {
    H.asientos = [{ section: "produccion", entryDate: new Date("2026-10-01T00:00:00.000Z") }];
    const r = await vigilarPila("t-blas", camara, nueva);
    expect(r).toMatchObject({ cambio: "bajo", despachoDelDia: false, avisada: false });
    expect(H.enviados).toHaveLength(0);
  });

  it("día con despacho: despachoDelDia true y sin aviso", async () => {
    H.asientos = [{ section: "despacho", entryDate: new Date("2026-10-01T12:00:00.000Z") }];
    expect(await vigilarPila("t-blas", camara, nueva)).toMatchObject({ despachoDelDia: true, avisada: false });
    expect(H.enviados).toHaveLength(0);
  });

  it("sin foto anterior de ≥30 min no compara (ni gasta IA)", async () => {
    H.historial = [nueva, cap("hace-10", "2026-10-02T02:50:00.000Z")];
    expect(await vigilarPila("t-blas", camara, nueva)).toBeNull();
    expect(H.iaLlamadas).toBe(0);
  });

  it("una subida a mano no se compara", async () => {
    expect(await vigilarPila("t-blas", camara, cap("m", "2026-10-01T15:00:00.000Z", "manual"))).toBeNull();
    expect(H.iaLlamadas).toBe(0);
  });

  it("«bajó» con confianza baja se guarda pero no mira el libro ni avisa", async () => {
    H.respuesta = JSON.stringify({ cambio: "bajo", confianza: "baja" });
    expect(await vigilarPila("t-blas", camara, nueva)).toEqual({ comparadaCon: "hace-1h", cambio: "bajo", confianza: "baja" });
    expect(H.enviados).toHaveLength(0);
  });

  it("turno tomado por otra foto de la misma ráfaga → no manda un segundo WhatsApp", async () => {
    H.turno = { ok: false, previo: "2026-10-01T14:59:00.000Z" };
    expect(await vigilarPila("t-blas", camara, nueva)).toMatchObject({ avisada: false });
    expect(H.enviados).toHaveLength(0);
  });

  it("si el WhatsApp no salió, devuelve el turno: no frena al siguiente 3 h", async () => {
    H.salio = false;
    expect(await vigilarPila("t-blas", camara, nueva)).toMatchObject({ avisada: false });
    expect(H.liberados).toBe(1);
  });

  it("sin poder leer el libro no acusa: despachoDelDia null y sin aviso", async () => {
    H.libroFalla = true;
    expect(await vigilarPila("t-blas", camara, nueva)).toMatchObject({ despachoDelDia: null, produccionDelDia: null, avisada: false });
    expect(H.enviados).toHaveLength(0);
  });

  it("el texto del aviso dice que fue de noche", async () => {
    await vigilarPila("t-blas", camara, nueva);
    expect(H.enviados[0].texto).toContain("De noche");
  });

  it("bajó DE DÍA: se guarda (el resumen la cuenta) pero no se avisa — la sierra se anota días después", async () => {
    const deDia = cap("dia", "2026-10-01T16:00:00.000Z"); // 11:00 de Lima
    H.historial = [deDia, cap("dia-1h", "2026-10-01T15:00:00.000Z")];
    expect(await vigilarPila("t-blas", camara, deDia)).toEqual({
      comparadaCon: "dia-1h",
      cambio: "bajo",
      confianza: "alta",
      despachoDelDia: false,
      produccionDelDia: false,
      avisada: false,
    });
    expect(H.enviados).toHaveLength(0);
  });

  it("anterior de las 18:30 y nueva de las 19:30: media hora de día en el medio, sin aviso", async () => {
    const recien = cap("1930", "2026-10-02T00:30:00.000Z");
    H.historial = [recien, cap("1830", "2026-10-01T23:30:00.000Z")];
    expect(await vigilarPila("t-blas", camara, recien)).toMatchObject({ cambio: "bajo", avisada: false });
    expect(H.enviados).toHaveLength(0);
  });

  it("otra foto ya tomó el turno de comparar → no llama al modelo", async () => {
    H.turnosComparar["cam-pila"] = "2026-10-02T02:59:57.000Z";
    expect(await vigilarPila("t-blas", camara, nueva)).toBeNull();
    expect(H.iaLlamadas).toBe(0);
  });

  it("la comparación que no se pudo hacer devuelve el turno: la próxima foto compara", async () => {
    H.respuesta = "no entiendo";
    expect(await vigilarPila("t-blas", camara, nueva)).toBeNull();
    expect(H.comparacionesLiberadas).toBe(1);
    expect(H.turnosComparar["cam-pila"]).toBeUndefined();
  });

  it("cámara que no vigila la pila: nada", async () => {
    expect(await vigilarPila("t-blas", { ...camara, vigilaPila: false }, nueva)).toBeNull();
    expect(H.iaLlamadas).toBe(0);
  });

  it("sin IA configurada: null, sin romper", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await vigilarPila("t-blas", camara, nueva)).toBeNull();
  });
});
