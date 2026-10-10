/**
 * La guía nueva del Libro TH arranca con lo de la anterior del MISMO permiso
 * (FOR-2) y «Anotar una guía» busca la placa como el CTP (FOR-1). 09-10-2026.
 */
import { describe, expect, it, vi } from "vitest";

/* Una tabla de guías en memoria: `findMany` respeta tenant, plan, orden y la ventana. */
const h = vi.hoisted(() => ({ filas: [] as { tenantId: string; planId: string; gtfNumber: string; t: number; gtfDatos: unknown }[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestGtf: {
      findMany: async (q: { where: { tenantId: string; planId?: string }; skip?: number; take: number }) =>
        h.filas
          .filter((f) => f.tenantId === q.where.tenantId && (q.where.planId === undefined || f.planId === q.where.planId))
          .sort((a, b) => b.t - a.t)
          .slice(q.skip ?? 0, (q.skip ?? 0) + q.take)
          .map((f) => ({ gtfNumber: f.gtfNumber, gtfDatos: f.gtfDatos })),
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn(), invalidateByPrefix: vi.fn() }));

import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import {
  copiarDeGuiaAnterior,
  guiaAnteriorDelDespacho,
  listaEnFrase,
  loCopiadoDelDespacho,
  ultimaGuiaDelPermiso,
  type GuiaCortaPrevia,
} from "@/lib/forestal/loth-guia-anterior";
import { juntarLoDelSistema, rellenarGuiaCorta } from "@/lib/forestal/placa-historial";
import { datosInicialesLoth, identidadDelTitulo, rellenarGuiaLoth } from "@/lib/forestal/loth-guia-despacho";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";

const guia = (p: Partial<GuiaCortaPrevia> & { gtfNumber: string }): GuiaCortaPrevia => ({
  planId: "plan-a",
  status: "emitida",
  titularName: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI",
  origen: "CONSTITUCION, OXAPAMPA, PASCO",
  destino: "INVERSIONES AGROFORESTALES BLAS SAC",
  ...p,
});

describe("ultimaGuiaDelPermiso", () => {
  // Como llega de la lista: la más nueva primero.
  const lista = [
    guia({ gtfNumber: "019-001-0000003", planId: "plan-b", destino: "OTRO DESTINO" }),
    guia({ gtfNumber: "019-001-0000002", status: "anulada", destino: "DESTINO ANULADO" }),
    guia({ gtfNumber: "019-001-0000001" }),
    guia({ gtfNumber: "019-0000002", titularName: "CCNN SAN LUIS DE CHINCHIGUANI" }),
  ];

  it("toma la más nueva viva del MISMO permiso, no la de otro ni la anulada", () => {
    expect(ultimaGuiaDelPermiso(lista, "plan-a")?.gtfNumber).toBe("019-001-0000001");
    expect(ultimaGuiaDelPermiso(lista, "plan-b")?.gtfNumber).toBe("019-001-0000003");
  });

  it("sin permiso o sin guías del permiso: nada", () => {
    expect(ultimaGuiaDelPermiso(lista, null)).toBeNull();
    expect(ultimaGuiaDelPermiso(lista, "plan-c")).toBeNull();
  });

  it("salta la guía sin origen ni destino (la del formato corto sembrado) y la borrada", () => {
    const l = [guia({ gtfNumber: "A", origen: " ", destino: null }), guia({ gtfNumber: "B", deletedAt: "2026-10-01" }), guia({ gtfNumber: "C" })];
    expect(ultimaGuiaDelPermiso(l, "plan-a")?.gtfNumber).toBe("C");
  });

  it("si ninguna dice origen ni destino, la última que dice el titular", () => {
    const l = [guia({ gtfNumber: "A", origen: null, destino: null }), guia({ gtfNumber: "B", origen: null, destino: null, titularName: null })];
    expect(ultimaGuiaDelPermiso(l, "plan-a")?.gtfNumber).toBe("A");
  });
});

describe("copiarDeGuiaAnterior", () => {
  it("llena sólo lo vacío y dice qué llenó", () => {
    const r = copiarDeGuiaAnterior({ titularName: "Titular del plan", origen: "", destino: "  " }, guia({ gtfNumber: "1" }));
    expect(r.cambios).toEqual({ origen: "CONSTITUCION, OXAPAMPA, PASCO", destino: "INVERSIONES AGROFORESTALES BLAS SAC" });
    expect(listaEnFrase(r.copiados)).toBe("origen y destino");
  });

  it("llamarla otra vez sobre lo ya copiado da la misma línea (StrictMode)", () => {
    const previa = guia({ gtfNumber: "1" });
    const r = copiarDeGuiaAnterior({ titularName: "Titular del plan", origen: previa.origen ?? "", destino: previa.destino ?? "" }, previa);
    expect(r.cambios).toEqual({});
    expect(r.copiados).toEqual(["origen", "destino"]);
  });

  it("con todo escrito no toca nada", () => {
    const r = copiarDeGuiaAnterior({ titularName: "x", origen: "y", destino: "z" }, guia({ gtfNumber: "1" }));
    expect(r.cambios).toEqual({});
    expect(r.copiados).toEqual([]);
  });

  it("listaEnFrase arma la frase", () => {
    expect(listaEnFrase(["titular", "origen", "destino"])).toBe("titular, origen y destino");
    expect(listaEnFrase(["titular"])).toBe("titular");
  });
});

describe("guiaAnteriorDelDespacho", () => {
  const porPlan = { "plan-a": { gtfNumber: "019-001-0000001", datos: "A" } };
  it("la del mismo plan gana a la última del negocio", () => {
    expect(guiaAnteriorDelDespacho({ porPlan, general: "G", generalNumero: "019-001-0000009" }, "plan-a")).toEqual({ datos: "A", gtfNumber: "019-001-0000001", delPermiso: true });
  });
  it("plan sin guías: la del negocio, avisando que es de otro permiso", () => {
    expect(guiaAnteriorDelDespacho({ porPlan, general: "G", generalNumero: "019-001-0000009" }, "plan-b")).toEqual({ datos: "G", gtfNumber: "019-001-0000009", delPermiso: false });
    expect(guiaAnteriorDelDespacho({ porPlan: null, general: null }, "plan-b")).toBeNull();
  });
});

describe("rellenarGuiaLoth con la guía del MISMO permiso", () => {
  // Plan sin ubigeo ni parcela: la partida no sale del plan.
  const id = identidadDelTitulo({ plan: { planType: "DEMA", tituloHabilitante: "19-SEC/PER-FMC-2024-008", titularName: "Juan Pérez" }, caratula: null });
  const partida = { direccion: "PC 3 Quebrada Chinchihuani", departamento: "Pasco", provincia: "Oxapampa", distrito: "Constitución" };
  const anterior = { ...gtfDatosVacio(), traslado: { ...gtfDatosVacio().traslado, partida, puntoPartida: "PC 3 Quebrada Chinchihuani, Constitución" } };

  it("del mismo permiso hereda la partida si el plan no la dice", () => {
    const d = rellenarGuiaLoth(datosInicialesLoth(id, "2026-10-09"), { ultimaGuia: anterior, mismoPermiso: true, emision: "2026-10-09" });
    expect(d.traslado.partida.direccion).toBe("PC 3 Quebrada Chinchihuani");
  });

  it("de otro permiso, no (cada bosque sale de su parcela)", () => {
    const d = rellenarGuiaLoth(datosInicialesLoth(id, "2026-10-09"), { ultimaGuia: anterior, emision: "2026-10-09" });
    expect(d.traslado.partida.direccion).toBe("");
  });
});

describe("loCopiadoDelDespacho — la línea dice sólo lo que vino de verdad", () => {
  const id = identidadDelTitulo({ plan: { planType: "DEMA", tituloHabilitante: "19-SEC/PER-FMC-2024-008", titularName: "Juan Pérez" }, caratula: null });
  const base = datosInicialesLoth(id, "2026-10-09");
  const sinAnterior = rellenarGuiaLoth(base, { ultimaGuia: null, emision: "2026-10-09" });
  const vacia = gtfDatosVacio();

  it("anterior sin transporte: no dice «transporte»", () => {
    const anterior = { ...vacia, destinatario: { ...vacia.destinatario, nombre: "INVERSIONES AGROFORESTALES BLAS SAC", direccion: "Jr. Los Cedros 120" } };
    const copiados = loCopiadoDelDespacho(sinAnterior, rellenarGuiaLoth(base, { ultimaGuia: anterior, mismoPermiso: true, emision: "2026-10-09" }));
    expect(copiados).toContain("destinatario");
    expect(copiados).not.toContain("transporte");
  });

  it("con transporte, sí; sin guía anterior, nada", () => {
    const anterior = { ...vacia, transportista: { ...vacia.transportista, nombre: "TRANSPORTES UCAYALI SAC" }, vehiculo: { ...vacia.vehiculo, placa: "XBC742" } };
    expect(loCopiadoDelDespacho(sinAnterior, rellenarGuiaLoth(base, { ultimaGuia: anterior, mismoPermiso: true, emision: "2026-10-09" }))).toContain("transporte");
    expect(loCopiadoDelDespacho(sinAnterior, rellenarGuiaLoth(base, { ultimaGuia: null, emision: "2026-10-09" }))).toEqual([]);
  });
});

describe("ForestGtfDB — la guía de la que se hereda", () => {
  const conDatos = { destinatario: { nombre: "INVERSIONES AGROFORESTALES BLAS SAC" } };
  h.filas = [
    // plan-a: 70 guías nuevas, las 25 más nuevas en blanco.
    ...Array.from({ length: 70 }, (_, i) => ({ tenantId: "t1", planId: "plan-a", gtfNumber: `A-${i}`, t: 1000 - i, gtfDatos: i < 25 ? {} : conDatos })),
    // plan-b: una sola guía, más vieja que todas las de plan-a.
    { tenantId: "t1", planId: "plan-b", gtfNumber: "B-viejo", t: 1, gtfDatos: conDatos },
    { tenantId: "otro", planId: "plan-c", gtfNumber: "C-ajeno", t: 2000, gtfDatos: conDatos },
  ];

  it("un plan viejo no queda tapado por las guías de otro plan", async () => {
    const m = await ForestGtfDB.ultimasConDatosPorPlan("t1", ["plan-a", "plan-b", "plan-c"]);
    expect(m.get("plan-b")?.gtfNumber).toBe("B-viejo");
    expect(m.get("plan-a")?.gtfNumber).toBe("A-25");
    expect(m.has("plan-c")).toBe(false);
  });

  it("la del negocio salta las guías en blanco más allá de la primera ventana", async () => {
    expect((await ForestGtfDB.ultimaConDatos("t1"))?.gtfNumber).toBe("A-25");
  });
});

describe("rellenarGuiaCorta — «Buscar placa» de Anotar una guía", () => {
  const sistema = juntarLoDelSistema("T2H847", [
    { fuente: "guia_th", referencia: "019-001-0000001", fecha: "2026-10-07", placa: "T2H-847", conductor: "BAZAN ROSALES HERMINEZ RUBEN", conductorDni: "48831805", licencia: "Q48831805", tipo: "CAMION" },
    { fuente: "directorio", referencia: null, fecha: null, placa: "T2H847", transportista: "BAZAN ROSALES HERMINEZ RUBEN", transportistaDocTipo: "DNI", transportistaDoc: "48831805" },
  ]);

  it("trae transportista, documento, conductor y licencia; no nombra lo que la guía corta no guarda", () => {
    const r = rellenarGuiaCorta({ transportista: "", transportistaDoc: "", conductor: "", conductorLicencia: "" }, sistema);
    expect(r.cambios).toEqual({
      transportista: "BAZAN ROSALES HERMINEZ RUBEN",
      transportistaDoc: "48831805",
      conductor: "BAZAN ROSALES HERMINEZ RUBEN",
      conductorLicencia: "Q48831805",
    });
    expect(r.aplicados.map((a) => a.campo)).toEqual(["transportista", "transportistaDoc", "conductor", "licencia"]);
  });

  it("lo tipeado no se pisa, y la licencia no se pega a otro conductor", () => {
    const r = rellenarGuiaCorta({ transportista: "", transportistaDoc: "", conductor: "JULIO PAREDES", conductorLicencia: "" }, sistema);
    expect(r.cambios.conductor).toBeUndefined();
    expect(r.cambios.conductorLicencia).toBeUndefined();
    expect(r.cambios.transportista).toBe("BAZAN ROSALES HERMINEZ RUBEN");
  });
});
