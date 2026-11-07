import { describe, expect, it } from "vitest";
import { anexosConfiables, cuandoVence, diaDeVencimiento, salidasPorRegistrar, textoDeSalida, type DespachoVivo } from "@/lib/forestal/salidas-por-registrar";
import { alertasDeSalidas } from "@/components/notifications/alertas-de-salidas";
import { clasificarAnexos, type AnexoParaDespacho } from "@/lib/forestal/anexo-a-despacho";

const anexo = (o: Partial<AnexoParaDespacho> & { id: string }): AnexoParaDespacho => ({
  numero: "1", gtf: "019-001-0000123", fecha: "2026-10-27", createdAt: "2026-10-27T10:00:00.000Z", totalM3: 1, piezas: [], ...o,
});
const sin: DespachoVivo[] = [];
const vivo = (id: string, gtfNumber: string | null = "019-001-0000123"): DespachoVivo => ({ id, gtfNumber });

/** Lo que cuenta la pastilla (`contarPendientes`): bandejaConfiable + clasificarAnexos. */
const pastilla = (anexos: AnexoParaDespacho[], vivos: DespachoVivo[]) => {
  const { lista, vigentes } = anexosConfiables(anexos, vivos);
  return clasificarAnexos(lista, vigentes).pendientes.length;
};

describe("salidasPorRegistrar", () => {
  it("martes: 2 hábiles = vence el jueves; en plazo antes y el mismo día", () => {
    // 2026-10-27 es martes
    const [s] = salidasPorRegistrar([anexo({ id: "a" })], sin, "2026-10-27");
    expect(s).toMatchObject({ anexoId: "a", venceEl: "2026-10-29", fueraDePlazo: false });
    expect(salidasPorRegistrar([anexo({ id: "a" })], sin, "2026-10-29")[0].fueraDePlazo).toBe(false);
  });
  it("fuera de plazo al día siguiente del vencimiento", () => {
    expect(salidasPorRegistrar([anexo({ id: "a" })], sin, "2026-10-30")[0].fueraDePlazo).toBe(true);
  });
  it("viernes: el fin de semana no cuenta (vence el martes)", () => {
    // 2026-10-23 es viernes
    expect(salidasPorRegistrar([anexo({ id: "a", fecha: "2026-10-23" })], sin, "2026-10-23")[0].venceEl).toBe("2026-10-27");
  });
  it("ya registrada (despacho vivo) no sale; anulada sí", () => {
    const a = anexo({ id: "a", despachoIds: ["d1"] });
    expect(salidasPorRegistrar([a], [vivo("d1")], "2026-10-27")).toEqual([]);
    expect(salidasPorRegistrar([a], sin, "2026-10-27")).toHaveLength(1);
    expect(salidasPorRegistrar([anexo({ id: "b", ctpEntryId: "d2" })], [vivo("d2")], "2026-10-27")).toEqual([]);
  });
  it("sin GTF no sale; reemplazado por uno que existe no sale", () => {
    expect(salidasPorRegistrar([anexo({ id: "a", gtf: "  " })], sin, "2026-10-27")).toEqual([]);
    const l = salidasPorRegistrar([anexo({ id: "a", gtf: "019-001-0000001", reemplazadoPor: "b" }), anexo({ id: "b", gtf: "019-001-0000002" })], sin, "2026-10-27");
    expect(l.map((x) => x.anexoId)).toEqual(["b"]);
  });
  it("ordena por el que antes vence", () => {
    const l = salidasPorRegistrar([
      anexo({ id: "nuevo", fecha: "2026-10-27", gtf: "019-001-0000001" }),
      anexo({ id: "viejo", fecha: "2026-10-20", gtf: "019-001-0000002" }),
    ], sin, "2026-10-27");
    expect(l.map((x) => x.anexoId)).toEqual(["viejo", "nuevo"]);
  });
});

describe("paridad con la pastilla (clasificarAnexos + bandejaConfiable)", () => {
  const casos: [string, AnexoParaDespacho[], DespachoVivo[]][] = [
    ["ctpEntryId vivo con OTRO N° de GTF", [anexo({ id: "a", ctpEntryId: "d1" })], [vivo("d1", "019-001-0000999")]],
    ["ctpEntryId vivo con la MISMA GTF", [anexo({ id: "a", ctpEntryId: "d1" })], [vivo("d1")]],
    ["reemplazadoPor huérfano", [anexo({ id: "a", reemplazadoPor: "no-existe" })], sin],
    ["GTF duplicada (vale el más reciente)", [anexo({ id: "a" }), anexo({ id: "b", createdAt: "2026-10-28T10:00:00.000Z" })], sin],
    ["GTF duplicada con una ya registrada", [anexo({ id: "a", despachoIds: ["d1"] }), anexo({ id: "b" })], [vivo("d1")]],
    ["GTF distintas", [anexo({ id: "a", gtf: "019-001-0000001" }), anexo({ id: "b", gtf: "019-001-0000002" })], sin],
  ];
  it.each(casos)("%s", (_n, anexos, vivos) => {
    expect(salidasPorRegistrar(anexos, vivos, "2026-10-27").length).toBe(pastilla(anexos, vivos));
  });
  it("el huérfano y el de otra GTF SÍ cuentan como pendientes", () => {
    expect(salidasPorRegistrar([anexo({ id: "a", reemplazadoPor: "no-existe" })], sin, "2026-10-27")).toHaveLength(1);
    expect(salidasPorRegistrar([anexo({ id: "a", ctpEntryId: "d1" })], [vivo("d1", "019-001-0000999")], "2026-10-27")).toHaveLength(1);
  });
});

describe("textos", () => {
  it("día de vencimiento en UTC", () => {
    expect(diaDeVencimiento("2026-10-29")).toBe("jueves 29-10");
  });
  it("campana: en plazo, vence hoy y fuera de plazo", () => {
    const a = alertasDeSalidas({ hoy: "2026-10-27", salidas: salidasPorRegistrar([anexo({ id: "a" })], sin, "2026-10-27") });
    expect(a[0]).toMatchObject({ categoria: "campo", severity: "warning", title: "Registrar hoy la salida de la GTF 019-001-0000123", description: "Vence el jueves 29-10." });
    const f = salidasPorRegistrar([anexo({ id: "a" })], sin, "2026-10-30")[0];
    expect(textoDeSalida(f, "2026-10-30").title).toMatch(/^Fuera de plazo/);
    expect(alertasDeSalidas({ hoy: "2026-10-30", salidas: [f] })[0].severity).toBe("critical");
    expect(cuandoVence(f, "2026-10-30")).toBe("la primera venció el jueves 29-10");
  });
  it("sin datos no hay alertas", () => {
    expect(alertasDeSalidas(null)).toEqual([]);
  });
});
