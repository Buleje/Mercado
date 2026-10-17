/**
 * Alcance de Facturas y boletas (F36) y campos frecuentes de la emisión (F40):
 * lo que viaja a la base, los chips, las vistas guardadas y las sugerencias
 * que nunca se ponen solas.
 */
import { describe, expect, it } from "vitest";
import {
  aParams, chipsDe, esAlcanceInicial, estadosDeParam, FILTROS_INICIALES, nombreDeVista, normalizarFiltros,
  type FiltrosComprobantes,
} from "@/components/admin/einvoice/filtros-comprobantes";
import { clientesFrecuentes, nombreAnteriorDistinto } from "@/components/admin/einvoice/clientes-frecuentes";
import { huellaDe } from "@/components/admin/einvoice/use-vistas-guardadas";
import type { EDocument } from "@/components/admin/einvoice/tipos";

const f = (p: Partial<FiltrosComprobantes>): FiltrosComprobantes => ({ ...FILTROS_INICIALES, ...p });

describe("aParams: el mismo alcance para tabla, cifras y Excel", () => {
  it("«pendiente» pide pending y retrying; nota de crédito viaja como nota_credito", () => {
    const p = aParams(f({ estados: ["pendiente", "rechazado"], tipos: ["nota-credito"], origen: "pedido" }), 200);
    expect(p.get("estado")).toBe("pending,retrying,rejected");
    expect(p.get("tipo")).toBe("nota_credito");
    expect(p.get("origen")).toBe("pedido");
    expect(p.get("limite")).toBe("200");
  });

  it("«Todo» no manda fechas; «Este mes» sí", () => {
    expect(aParams(f({ periodo: "todo" }), 1).has("desde")).toBe(false);
    expect(aParams(f({ periodo: "mes" }), 1).get("desde")).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("la búsqueda se recorta a 80 y sin espacios a los lados", () => {
    expect(aParams(f({ q: `  ${"x".repeat(100)}  ` }), 1).get("q")).toHaveLength(80);
    expect(aParams(f({ q: "   " }), 1).has("q")).toBe(false);
  });
});

describe("chips y «Restablecer alcance»", () => {
  it("el alcance de fábrica no tiene chips", () => {
    expect(chipsDe(FILTROS_INICIALES)).toEqual([]);
    expect(esAlcanceInicial(FILTROS_INICIALES)).toBe(true);
  });

  it("cada filtro puesto es un chip y su «×» quita sólo ese", () => {
    const alcance = f({ q: "ucayali", tipos: ["factura", "boleta"], estados: ["rechazado"], periodo: "7d" });
    const chips = chipsDe(alcance);
    expect(chips.map((c) => c.clave)).toEqual(["periodo", "q", "tipo:factura", "tipo:boleta", "estado:rechazado"]);
    const sinFactura = chips.find((c) => c.clave === "tipo:factura")!.quitar(alcance);
    expect(sinFactura.tipos).toEqual(["boleta"]);
    expect(sinFactura.q).toBe("ucayali");
    expect(chips.find((c) => c.clave === "periodo")!.quitar(alcance).periodo).toBe(FILTROS_INICIALES.periodo);
  });

  it("el nombre de una vista dice sus filtros y su período", () => {
    expect(nombreDeVista(f({ estados: ["rechazado"] }))).toBe("Rechazado · Este mes");
  });
});

describe("vistas guardadas: lo leído del navegador no se confía", () => {
  it("descarta tipos, estados y períodos inventados", () => {
    const v = normalizarFiltros({ q: 5, periodo: "siglo", tipos: ["factura", "cheque"], estados: ["emitido", "anulado"], origen: "x" });
    expect(v).toEqual({ q: "", periodo: "mes", tipos: ["factura"], estados: ["anulado"], origen: "" });
    expect(normalizarFiltros(null)).toBeNull();
  });

  it("dos alcances iguales tienen la misma huella; otro período, otra", () => {
    expect(huellaDe(f({ estados: ["rechazado"] }))).toBe(huellaDe(f({ estados: ["rechazado"] })));
    expect(huellaDe(f({ estados: ["rechazado"] }))).not.toBe(huellaDe(f({ estados: ["rechazado"], periodo: "7d" })));
  });

  it("?estado= de la Conciliación sólo acepta estados filtrables", () => {
    expect(estadosDeParam("aceptado,pendiente,inventado")).toEqual(["aceptado", "pendiente"]);
    expect(estadosDeParam(null)).toEqual([]);
  });
});

const doc = (p: Partial<EDocument>): EDocument => ({
  id: "x", serie: "F001", number: "1", date: "", type: "factura", status: "aceptado", clientName: "Ferretería Ucayali SAC",
  clientRUC: "20123456789", subtotal: 100, igv: 18, total: 118, items: 1, sunatResponse: "", ...p,
});

describe("clientes frecuentes (F40): se sugieren, nunca se copian solos", () => {
  const docs = [
    doc({ id: "1" }),
    doc({ id: "2" }),
    doc({ id: "3", clientName: "Maderera Shipibo EIRL", clientRUC: "20600000001" }),
    doc({ id: "4", type: "boleta", clientName: "Ana Torres", clientRUC: "45678912" }),
  ];

  it("para factura sólo sugiere RUC de 11 y ordena por frecuencia", () => {
    const s = clientesFrecuentes(docs, { tipo: "factura", nombre: "", documento: "" });
    expect(s.map((c) => c.documento)).toEqual(["20123456789", "20600000001"]);
    expect(s[0]?.veces).toBe(2);
  });

  it("filtra por lo escrito (nombre sin tildes o el inicio del número)", () => {
    expect(clientesFrecuentes(docs, { tipo: "factura", nombre: "ferreteria", documento: "" }).map((c) => c.nombre)).toEqual(["Ferretería Ucayali SAC"]);
    expect(clientesFrecuentes(docs, { tipo: "factura", nombre: "", documento: "206" }).map((c) => c.documento)).toEqual(["20600000001"]);
  });

  it("no sugiere lo que ya está puesto tal cual", () => {
    expect(clientesFrecuentes(docs, { tipo: "factura", nombre: "Ferretería Ucayali SAC", documento: "20123456789" })).toEqual([]);
  });

  it("avisa si el RUC salió antes con otro nombre; mismo nombre, sin aviso", () => {
    expect(nombreAnteriorDistinto(docs, { tipo: "factura", nombre: "Otra empresa", documento: "20123456789" })).toBe("Ferretería Ucayali SAC");
    expect(nombreAnteriorDistinto(docs, { tipo: "factura", nombre: "ferreteria ucayali sac", documento: "20123456789" })).toBeNull();
    expect(nombreAnteriorDistinto(docs, { tipo: "factura", nombre: "Otra", documento: "2012" })).toBeNull();
  });
});
