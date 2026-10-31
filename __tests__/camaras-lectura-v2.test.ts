/**
 * Lectura v2 de la foto (ADR-456): chalecos, actividad y la regla de no
 * reconocer caras. Sin `ANTHROPIC_API_KEY` en el entorno, el modelo no se
 * puede llamar de verdad: acá se prueba lo que hace NUESTRO código con la
 * respuesta (y qué le pide al modelo), con `generateText` simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  respuestas: [] as Array<() => string>,
  llamadas: [] as { modelo: string; system: string }[],
  gastos: [] as number[],
}));

vi.mock("ai", () => ({
  generateText: async (opts: { model: string; system: string }) => {
    H.llamadas.push({ modelo: opts.model, system: opts.system });
    const r = H.respuestas.shift();
    if (!r) throw new Error("sin respuesta");
    return { text: r() };
  },
}));
vi.mock("@/lib/ai/provider", () => ({ anthropicProvider: (m: string) => m }));
vi.mock("@/lib/ai/cost-control", () => ({
  aiCostGuard: {
    canSpend: async () => true,
    recordSpend: async (_b: string, usd: number) => {
      H.gastos.push(usd);
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));

import { lecturaDesdeRespuesta, leerFotoDeCamara, MODELOS_CAMARA, normalizarPlaca } from "@/lib/ai/camara-vision";
import { compararPlacas } from "@/lib/camaras/cruces";

beforeEach(() => {
  H.respuestas = [];
  H.llamadas = [];
  H.gastos = [];
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
});
afterEach(() => vi.unstubAllEnvs());

const json = (o: Record<string, unknown>) => () => "```json\n" + JSON.stringify(o) + "\n```";

describe("lecturaDesdeRespuesta", () => {
  it("lee chalecos (normalizados) y la actividad", () => {
    const l = lecturaDesdeRespuesta(
      JSON.stringify({ descripcion: "Dos trabajadores cargando", hayPersona: true, personas: 2, chalecos: ["03", 12, "AB"], actividad: "Carga", confianza: "alta" }),
    );
    expect(l).toMatchObject({ chalecos: ["3", "12"], actividad: "carga", personas: 2 });
  });

  it("con confianza baja no hay placa ni chalecos: un «3» de noche le pone nombre a otro", () => {
    const l = lecturaDesdeRespuesta(JSON.stringify({ placa: "ABC-123", chalecos: ["3"], actividad: "descarga", confianza: "baja" }));
    expect(l).toMatchObject({ placa: null, chalecos: [], actividad: "descarga", confianza: "baja" });
  });

  it("una actividad fuera de la lista es null, no una categoría nueva", () => {
    expect(lecturaDesdeRespuesta(JSON.stringify({ actividad: "fumando", confianza: "alta" }))?.actividad).toBeNull();
    expect(lecturaDesdeRespuesta(JSON.stringify({ actividad: "aserrío", confianza: "alta" }))?.actividad).toBe("aserrio");
  });

  it("lectura vieja sin los campos nuevos: chalecos [] y actividad null", () => {
    expect(lecturaDesdeRespuesta(JSON.stringify({ descripcion: "x", confianza: "media" }))).toMatchObject({ chalecos: [], actividad: null });
  });

  it("texto que no es JSON → null", () => {
    expect(lecturaDesdeRespuesta("no veo nada")).toBeNull();
  });
});

describe("leerFotoDeCamara", () => {
  it("prueba primero claude-sonnet-5-5 y cae al siguiente si el modelo falla", async () => {
    expect(MODELOS_CAMARA).toEqual(["claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"]);
    H.respuestas = [
      () => {
        throw new Error("model not found");
      },
      json({ descripcion: "Camión entrando", hayVehiculo: true, placa: "abc123", confianza: "alta", actividad: "transito", chalecos: [] }),
    ];
    const l = await leerFotoDeCamara("t1", "https://x.supabase.co/foto.webp");
    expect(H.llamadas.map((c) => c.modelo)).toEqual(["claude-sonnet-5-5", "claude-sonnet-5"]);
    expect(l).toMatchObject({ placa: "ABC-123", actividad: "transito", modelo: "claude-sonnet-5" });
  });

  it("el prompt prohíbe identificar personas y rasgos faciales, y pide sólo el número impreso", async () => {
    H.respuestas = [json({ confianza: "baja" })];
    await leerFotoDeCamara("t1", "https://x.supabase.co/foto.webp");
    const system = H.llamadas[0].system;
    expect(system).toMatch(/nunca identifiques a nadie/i);
    expect(system).toMatch(/rasgos\s+faciales/i);
    expect(system).toMatch(/chaleco o casco/);
    for (const a of ["carga", "descarga", "aserrio", "apilado", "transito", "ninguna"]) expect(system).toContain(`"${a}"`);
  });

  it("anota el gasto de cada llamada que respondió (antes el tope nunca bajaba)", async () => {
    H.respuestas = [() => "ilegible", json({ confianza: "media" })];
    await leerFotoDeCamara("t1", "https://x.supabase.co/foto.webp");
    expect(H.gastos).toEqual([0.01, 0.01]);
  });

  it("sin clave de IA no llama a nadie y lo dice", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const l = await leerFotoDeCamara("t1", "https://x.supabase.co/foto.webp");
    expect(l).toMatchObject({ motivo: "sin_ia_configurada", chalecos: [], actividad: null });
    expect(H.llamadas).toHaveLength(0);
  });
});

describe("placa con una letra donde va un dígito (8↔B, 0↔O…)", () => {
  it("«W2D-B35» ya no se descarta: se guarda COMO SE LEYÓ y cruza con W2D-835 como «parecida», nunca exacta", () => {
    expect(normalizarPlaca("W2D-B35")).toBe("W2D-B35");
    expect(normalizarPlaca("abc-1z3")).toBe("ABC-1Z3");
    expect(normalizarPlaca("A1B-23S")).toBe("A1B-23S");
    expect(compararPlacas(normalizarPlaca("W2D-B35"), "W2D-835")).toBe("parecida");
    expect(compararPlacas(normalizarPlaca("W2D-B35"), "W2D835")).not.toBe("exacta");
  });

  it("una sola letra en los dígitos: dos ya es una palabra, no una placa", () => {
    expect(normalizarPlaca("W2D-BS5")).toBeNull();
    expect(normalizarPlaca("BORROSO")).toBeNull(); // «BORR-OSO» con tres
    expect(normalizarPlaca("no se lee")).toBeNull();
    expect(normalizarPlaca("ABC-1X3")).toBeNull(); // X no se confunde con un dígito
  });

  it("sin falsos positivos: una letra en los dígitos + otra diferencia real = otro camión", () => {
    expect(compararPlacas(normalizarPlaca("W2O-B35"), "W2D-835")).toBeNull(); // O/D y B/8: dos
    expect(compararPlacas(normalizarPlaca("W2D-B36"), "W2D-835")).toBeNull(); // B/8 y 6≠5
  });

  it("de la respuesta del modelo al cruce: la lectura guarda «W2D-B35»", () => {
    expect(lecturaDesdeRespuesta(JSON.stringify({ placa: "W2D-B35", confianza: "media" }))?.placa).toBe("W2D-B35");
  });
});
