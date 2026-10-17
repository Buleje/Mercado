/**
 * La cola del patio con IndexedDB de verdad (en memoria): lo viejo de una troza
 * o de un acta nunca llega al servidor DESPUÉS de lo nuevo (revisión 26-09).
 *
 *   · v1 de una medida quedó encolada (el fetch falló con el navegador
 *     «online»); el operario corrige a v2 → v2 va DETRÁS, y al sincronizar el
 *     servidor recibe v1 y luego v2. Antes, v2 entraba directo y el reintento
 *     de v1 la pisaba.
 *   · Un 200 con `rechazadas` de esa troza queda RECHAZADO con el motivo (antes
 *     se borraba como subido).
 *   · Si v1 no sube en una vuelta, v2 de la MISMA troza espera; la de otra
 *     troza, no.
 *   · El acta viaja entera: la versión nueva reemplaza a la pendiente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anotar, escribirDelPatio, listar, sincronizar } from "@/lib/forestal/patio-cola";
import { indexedDBEnMemoria } from "./helpers/indexeddb-en-memoria";

const URL_MEDIDAS = "/api/admin/forestal/trozas/medidas";
const URL_CONTEOS = "/api/admin/forestal/patio/conteos";

type Llamada = { url: string; body: Record<string, unknown> };
let llamadas: Llamada[];
let responder: (l: Llamada) => Response | Promise<Response>;
let reloj = Date.parse("2026-09-26T15:00:00.000Z");

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("indexedDB", indexedDBEnMemoria());
  llamadas = [];
  responder = () => json(200, { trozas: [], rechazadas: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const l = { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
      llamadas.push(l);
      return responder(l);
    }),
  );
  /* `createdAt` distinto por anotación: la cola sube en ese orden. */
  const original = Date.prototype.toISOString;
  vi.spyOn(Date.prototype, "toISOString").mockImplementation(function () {
    reloj += 1000;
    return original.call(new Date(reloj));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const medida = (id: string, d1: number) => ({ trozas: [{ id, oxD1Pulg: d1, oxD2Pulg: 22, oxLargoPies: 12 }] });
const d1Mandado = (l: Llamada) => (l.body.trozas as { oxD1Pulg: number }[])[0]!.oxD1Pulg;

describe("medidas: lo nuevo nunca queda debajo de lo viejo", () => {
  it("v1 encolada + v2 corregida con señal → v2 va DETRÁS y el servidor termina con v2", async () => {
    await anotar("medidas", medida("t1", 18), URL_MEDIDAS, "PATCH");

    const r = await escribirDelPatio({ section: "medidas", url: URL_MEDIDAS, metodo: "PATCH", payload: medida("t1", 19) });
    expect(r).toEqual({ estado: "encolada", detras: true });
    expect(llamadas).toHaveLength(0);

    const s = await sincronizar();
    expect(s).toMatchObject({ subidas: 2, rechazadas: 0, pendientes: 0 });
    expect(llamadas.map(d1Mandado)).toEqual([18, 19]);
  });

  it("sin nada pendiente de esa troza va directo, y descarta lo que el libro le había rechazado", async () => {
    await anotar("medidas", medida("t1", 18), URL_MEDIDAS, "PATCH");
    responder = () => json(200, { trozas: [], rechazadas: [{ id: "t1", motivo: "Figura como no llegada al patio." }] });
    await sincronizar();
    expect((await listar()).map((a) => a.estado)).toEqual(["rechazado"]);

    responder = () => json(200, { trozas: [{ id: "t1", oxD1Pulg: 19 }], rechazadas: [] });
    const r = await escribirDelPatio({ section: "medidas", url: URL_MEDIDAS, metodo: "PATCH", payload: medida("t1", 19) });
    expect(r.estado).toBe("ok");
    expect(r.cuerpo).toMatchObject({ trozas: [{ id: "t1", oxD1Pulg: 19 }] });
    // La v1 rechazada ya no está: «Reintentar» en la bandeja la subía encima de la v2.
    expect(await listar()).toEqual([]);
  });

  it("un 200 con rechazadas de ESA troza queda rechazado con el motivo, no se borra como subido", async () => {
    await anotar("medidas", medida("t1", 18), URL_MEDIDAS, "PATCH");
    responder = () => json(200, { trozas: [], rechazadas: [{ id: "t1", motivo: "Su guía está anulada o rechazada: no se mide." }] });
    const s = await sincronizar();
    expect(s).toMatchObject({ subidas: 0, rechazadas: 1, pendientes: 0 });
    const [a] = await listar();
    expect(a).toMatchObject({ estado: "rechazado", motivo: "Su guía está anulada o rechazada: no se mide." });
  });

  it("si v1 no sube en esta vuelta, v2 de la MISMA troza espera; la de otra troza sube", async () => {
    await anotar("medidas", medida("t1", 18), URL_MEDIDAS, "PATCH");
    await anotar("medidas", medida("t1", 19), URL_MEDIDAS, "PATCH");
    await anotar("medidas", medida("t2", 30), URL_MEDIDAS, "PATCH");
    responder = (l) => {
      if (d1Mandado(l) === 18) throw new TypeError("Failed to fetch");
      return json(200, { trozas: [], rechazadas: [] });
    };
    await sincronizar();
    expect(llamadas.map(d1Mandado)).toEqual([18, 30]);
    const quedan = await listar();
    expect(quedan.map((a) => [d1Mandado({ url: "", body: a.payload }), a.intentos])).toEqual([
      [18, 1],
      [19, 0],
    ]);

    responder = () => json(200, { trozas: [], rechazadas: [] });
    llamadas = [];
    await sincronizar();
    expect(llamadas.map(d1Mandado)).toEqual([18, 19]);
    expect(await listar()).toEqual([]);
  });

  it("sin señal queda en la bandeja diciendo qué troza y qué medidas", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const r = await escribirDelPatio({
      section: "medidas",
      url: URL_MEDIDAS,
      metodo: "PATCH",
      payload: medida("t9", 18),
      resumen: "Troza 58 · 18″ · 22″ · 12′",
    });
    expect(r).toEqual({ estado: "encolada" });
    expect(llamadas).toHaveLength(0);
    expect((await listar()).map((a) => a.resumen)).toEqual(["Troza 58 · 18″ · 22″ · 12′"]);
  });
});

describe("sincronizar: lo rechazado en la MISMA vuelta tampoco queda para pisar", () => {
  it("v1 rechazada (4xx) y v2 aceptada en la misma vuelta → v1 sale de la cola", async () => {
    await anotar("medidas", medida("t1", 180), URL_MEDIDAS, "PATCH");
    await anotar("medidas", medida("t1", 19), URL_MEDIDAS, "PATCH");
    responder = (l) =>
      d1Mandado(l) === 180 ? json(400, { error: "validation_error" }) : json(200, { trozas: [], rechazadas: [] });
    const s = await sincronizar();
    expect(s).toMatchObject({ subidas: 1, rechazadas: 1, pendientes: 0 });
    expect(llamadas.map(d1Mandado)).toEqual([180, 19]);
    // Si quedaba, «Reintentar» en la bandeja subía la v1 encima de la v2.
    expect(await listar()).toEqual([]);
  });
});

describe("acta: la nueva reemplaza a la pendiente", () => {
  const acta = (terminadoEn: string) => ({
    conteo: {
      v: 1,
      fecha: "2026-09-26",
      iniciadoEn: "2026-09-26T14:00:00.000Z",
      quien: "Juan",
      trozas: [],
      fotoEn: "2026-09-26T14:00:00.000Z",
      truncado: false,
      lecturas: [],
      terminadoEn,
    },
  });

  it("v1 encolada + v2 terminada después → se manda v2 directo y v1 sale de la cola", async () => {
    await anotar("conteo", acta("2026-09-26T14:30:00.000Z"), URL_CONTEOS);
    responder = () => json(200, { acta: {}, creada: false, obsoleta: false });
    const r = await escribirDelPatio({ section: "conteo", url: URL_CONTEOS, payload: acta("2026-09-26T14:45:00.000Z") });
    expect(r.estado).toBe("ok");
    expect(llamadas.map((l) => (l.body.conteo as { terminadoEn: string }).terminadoEn)).toEqual(["2026-09-26T14:45:00.000Z"]);
    expect(await listar()).toEqual([]);
  });
});
