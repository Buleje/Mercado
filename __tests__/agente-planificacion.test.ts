/**
 * El plan de la empresa desde el chat del panel (dominio `planificacion`):
 * - contesta políticas, objetivos atrasados y licencias por vencer;
 * - respeta el rol con la MISMA regla de las rutas (`puedeVerSeccion`);
 * - socios e inversión no se le pasan nunca al asistente, ni al dueño.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ leer: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/plan-empresa.db", () => ({ PlanEmpresaDB: { leer: h.leer } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { planificacionAgent } from "@/lib/agents/domains/planificacion.agent";
import { SECCIONES_SENSIBLES, vacia } from "@/lib/planificacion/secciones";
import type { AgentTask } from "@/lib/agents/types";

const TENANT = "tenant-main";

const tarea = (payload: Record<string, unknown>): AgentTask => ({
  id: "t1",
  domain: "planificacion",
  action: "consultar",
  payload,
  priority: "normal",
  status: "running",
  tenantId: TENANT,
  createdAt: new Date().toISOString(),
  traceId: "trace",
});
const preguntar = (payload: Record<string, unknown>, actorRole: string | undefined) =>
  planificacionAgent.execute(tarea(payload), { tenantId: TENANT, traceId: "trace", actorRole });

const guardada = <T,>(datos: T) => ({ datos, version: 2, actualizado: "2026-10-01T00:00:00.000Z", autor: "qa" });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z")); // 10:00 en Lima
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  h.leer.mockReset();
  h.leer.mockImplementation(async (_t: string, secciones: string[]) => {
    const out: Record<string, unknown> = {};
    for (const s of secciones) {
      if (s === "politicas") {
        out[s] = guardada({
          ...vacia("politicas"),
          items: [
            { id: "p1", categoria: "Delivery", titulo: "Delivery", texto: "Gratis desde S/ 50.", vigenteDesde: "", revisar: "" },
            { id: "p2", categoria: "Cambios y devoluciones", titulo: "Devoluciones", texto: "7 días con boleta.", vigenteDesde: "", revisar: "" },
          ],
        });
      } else if (s === "objetivos") {
        const obj = (id: string, titulo: string, fin: string, estado: string) => ({
          id, titulo, area: "", plazo: "corto", inicio: "", fin, responsable: "", indicador: "", meta: "",
          avance: null, estado, estrategiaId: "", acciones: [], nota: "",
        });
        out[s] = guardada({ items: [obj("o1", "Abrir delivery", "2026-12-31", "en-curso"), obj("o2", "Cartel nuevo", "2026-09-30", "en-curso"), obj("o3", "RUC", "2026-08-01", "hecho")] });
      } else if (s === "licencias") {
        const lic = (id: string, nombre: string, vence: string) => ({ id, nombre, entidad: "Municipalidad", numero: "", emitida: "", vence, tramitada: true, nota: "", archivoUrl: "" });
        out[s] = guardada({ items: [lic("l1", "RUC", ""), lic("l2", "Licencia de funcionamiento", "2026-11-05"), lic("l3", "Certificado Defensa Civil", "2027-06-01")] });
      } else {
        out[s] = { datos: vacia(s as never), version: 0, actualizado: null, autor: null };
      }
    }
    return out;
  });
});

describe("el asistente del panel lee el plan", () => {
  it("«¿cuál es mi política de devoluciones?» → la política, filtrada por la palabra", async () => {
    const r = await preguntar({ tema: "politicas", buscar: "devoluciones" }, "admin");
    expect(r.success).toBe(true);
    const data = r.data as { politicas: { titulo: string; texto: string }[] };
    expect(data.politicas).toEqual([expect.objectContaining({ titulo: "Devoluciones", texto: "7 días con boleta." })]);
    expect(h.leer).toHaveBeenCalledWith(TENANT, ["politicas"]);
  });

  it("«¿qué objetivos tengo atrasados?» → el atrasado primero, con sus días", async () => {
    const r = await preguntar({ tema: "objetivos" }, "manager");
    const data = r.data as { resumen: { atrasados: number }; objetivos: { titulo: string; atrasado: boolean; diasDeAtraso: number }[] };
    expect(data.resumen.atrasados).toBe(1);
    expect(data.objetivos[0]).toMatchObject({ titulo: "Cartel nuevo", atrasado: true, diasDeAtraso: 16 });
    expect(data.objetivos.find((o) => o.titulo === "RUC")?.atrasado).toBe(false);
  });

  it("«¿qué licencia vence?» → la que vence en 20 días arriba", async () => {
    const r = await preguntar({ tema: "licencias" }, "admin");
    const data = r.data as { resumen: { porVencer30Dias: number }; licencias: { nombre: string; estado: string; diasParaVencer: number | null }[] };
    expect(data.resumen.porVencer30Dias).toBe(1);
    expect(data.licencias[0]).toMatchObject({ nombre: "Licencia de funcionamiento", estado: "por-vencer", diasParaVencer: 20 });
  });
});

describe("respeta el rol", () => {
  it("el cajero lee las políticas (las ve en su panel)", async () => {
    const r = await preguntar({ tema: "politicas" }, "cajero");
    expect(r.success).toBe(true);
  });

  it.each(["delivery", "proveedor", undefined])("rol %s → no lee nada del plan", async (rol) => {
    const r = await preguntar({ tema: "politicas" }, rol);
    expect(r.success).toBe(false);
    expect(h.leer).not.toHaveBeenCalled();
  });

  it.each(["socios", "inversion", "Inversión"])("«%s» no sale al asistente, ni para el dueño", async (tema) => {
    const r = await preguntar({ tema }, "admin");
    expect(JSON.stringify(r.data)).toContain("no se le pasan al asistente");
    expect(h.leer).not.toHaveBeenCalled();
  });

  it("ningún tema, con ningún rol, pide a la base socios o inversión", async () => {
    for (const rol of ["admin", "owner", "tienda_owner", "manager", "cajero"]) {
      for (const tema of ["politicas", "objetivos", "licencias", "empresa", "foda", "organizacion"]) {
        await preguntar({ tema }, rol);
      }
    }
    const pedidas = h.leer.mock.calls.flatMap(([, secciones]) => secciones as string[]);
    expect(pedidas.length).toBeGreaterThan(0);
    expect(pedidas.filter((s) => SECCIONES_SENSIBLES.has(s as never))).toEqual([]);
  });
});
