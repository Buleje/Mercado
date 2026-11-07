/**
 * La ráfaga (ADR-456 §4, hallazgo de la revisión adversarial del 01-10): una
 * alarma de Hikvision manda 3-4 fotos en segundos. Cada una corre su análisis
 * en paralelo (`after()` de cada POST) y ninguna ve todavía la `pila` guardada
 * de la otra. Sin un turno tomado ANTES de llamar al modelo, las tres pagaban
 * una comparación de dos imágenes. Corre `procesarCapturaNueva` de verdad; la
 * base es un arreglo en memoria y el turno se toma como lo deja el candado
 * (el primero que llega lo toma, en un solo paso).
 */
import { expect, it, vi } from "vitest";
import type { Camara, Captura } from "@/lib/camaras/camaras";

const H = vi.hoisted(() => ({
  store: [] as Captura[],
  comparaciones: 0,
  whatsapps: 0,
  turnoAviso: false,
  turnosComparar: {} as Record<string, string>,
  errores: [] as unknown[],
}));
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => H.errores.push(a), error: (...a: unknown[]) => H.errores.push(a), info: () => {}, debug: () => {} },
}));
vi.mock("ai", () => ({
  generateText: async () => {
    H.comparaciones += 1;
    await espera(120); // dos imágenes al modelo: segundos en la vida real
    return { text: JSON.stringify({ cambio: "bajo", confianza: "alta" }) };
  },
}));
vi.mock("@/lib/ai/provider", () => ({ anthropicProvider: (m: string) => m }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: { canSpend: async () => true, recordSpend: async () => {} } }));
vi.mock("@/lib/ai/camara-vision", () => ({
  MODELOS_CAMARA: ["m1"],
  extraerJson: (t: string) => JSON.parse(t),
  leerFotoDeCamara: async () => {
    await espera(150);
    return { descripcion: "pila", hayPersona: false, hayVehiculo: false, personas: 0, placa: null, confianza: "alta", motivo: null, chalecos: [], actividad: "ninguna" };
  },
}));
vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: { list: async () => ({ entries: [] }) } }));
vi.mock("@/lib/db/forest-gtf.db", () => ({ ForestGtfDB: { list: async () => [] } }));
vi.mock("@/lib/db/forest-flete.db", () => ({ ForestFleteDB: { listar: async () => [] } }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { listarVehiculos: async () => [] } }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({ ColaboradoresDB: { listar: async () => [] } }));
vi.mock("@/lib/db/rrhh-asistencia.db", () => ({ AsistenciaDB: { delPeriodo: async () => [] } }));
vi.mock("@/lib/camaras/avisar", () => ({
  enlaceAlPanelDeCamaras: () => "x",
  avisarSiCorresponde: async () => {},
  mandarWhatsAppDeCamara: async () => {
    H.whatsapps += 1;
    return true;
  },
}));
vi.mock("@/lib/db/camaras.db", async () => {
  const { aplicarAnalisis, puedeCompararPila } = await import("@/lib/camaras/cruces");
  return {
    CamarasDB: {
      capturas: async (_t: string, o: { camaraId?: string }) =>
        H.store.filter((c) => !o.camaraId || c.camaraId === o.camaraId).map((c) => ({ ...c })),
      list: async () => [camara],
      chalecos: async () => ({}),
      guardarAnalisis: async (_t: string, id: string, a: Parameters<typeof aplicarAnalisis>[2]) => {
        const next = aplicarAnalisis(H.store, id, a);
        if (next) H.store = next;
        return Boolean(next);
      },
      /* Leer y anotar en el mismo paso, como dentro del advisory lock. */
      reservarComparacionPila: async (_t: string, camaraId: string, at: string) => {
        await espera(5);
        const previo = H.turnosComparar[camaraId] ?? null;
        if (!puedeCompararPila(previo, at)) return { ok: false, previo };
        H.turnosComparar[camaraId] = at;
        return { ok: true, previo };
      },
      liberarComparacionPila: async () => {},
      reservarAvisoPila: async () => {
        if (H.turnoAviso) return { ok: false, previo: "x" };
        H.turnoAviso = true;
        return { ok: true, previo: null };
      },
      liberarAvisoPila: async () => {},
    },
  };
});

const camara = {
  id: "cam",
  nombre: "Patio",
  lugar: "",
  token: "t".repeat(32),
  activa: true,
  creadaEn: "2026-09-01T00:00:00.000Z",
  vigilaPila: true,
  avisos: { whatsapp: "987654321", cuando: "siempre" },
} as Camara;
const cap = (id: string, at: string): Captura => ({ id, camaraId: "cam", url: `https://x/${id}.webp`, evento: "persona", at });

import { procesarCapturaNueva } from "@/lib/camaras/cruces.server";

it("ráfaga de 3 fotos de noche en segundos → UNA comparación, UN WhatsApp, UNA pila guardada", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  /* 21:00 la anterior; la ráfaga a las 22:00 de Lima. */
  H.store = [cap("vieja", "2026-10-02T02:00:00.000Z")];
  const corridas: Promise<void>[] = [];
  for (const [i, at] of ["2026-10-02T03:00:00.000Z", "2026-10-02T03:00:03.000Z", "2026-10-02T03:00:06.000Z"].entries()) {
    const c = cap(`r${i}`, at);
    H.store = [c, ...H.store]; // registrarCaptura: entra antes del after()
    corridas.push(procesarCapturaNueva("t", camara, c)); // el after() de cada POST
    await espera(30); // la siguiente foto llega mientras la IA de la anterior mira
  }
  await Promise.all(corridas);
  expect(H.errores).toEqual([]);
  expect(H.comparaciones).toBe(1);
  expect(H.whatsapps).toBe(1);
  expect(H.store.filter((c) => c.pila).map((c) => c.id)).toEqual(["r0"]);
  vi.unstubAllEnvs();
});
