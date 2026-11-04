import { describe, it, expect } from "vitest";
import {
  MODULOS, VENTANA_DIAS, claveDeEntidad, consejosDeRubro, moduloDe, rubroDeNegocio,
} from "@/lib/superadmin/adopcion-modulos";

/**
 * Adopción de funciones — Tramo 2 (2026-11-04). Reglas puras: alias de
 * ActivityLog.entity → módulo, rubro del negocio y consejos «le falta X» por
 * rubro. Las entidades de abajo son las REALES de Blas (consulta del 04-11).
 */

const ENTIDADES_DE_BLAS_30D = [
  "camara", "Asistencia", "admin", "ForestLoteAserrio", "ForestLothEntry", "ForestCtpEntry",
  "[L29733] NotificationLog", "WoodEntry", "System", "Colaborador", "ForestCtpImport",
  "ForestCtpLibro", "ForestContrato", "AgendaActividad", "pos_ticket", "ForestAnexo04",
  "adelanto", "ForestGtf", "ForestCtpRespaldo", "ForestLothGtfPreliminar", "ForestParty",
  "Puesto", "ForestPlan", "[L29733] Sale", "ForestGtfTalonario", "WoodEntryTroza",
  "ForestGuiaGuardada", "ForestVehiculo",
];

function clavesDe(entidades: string[]): Set<string> {
  const out = new Set<string>();
  for (const e of entidades) {
    const k = claveDeEntidad(e);
    if (k) out.add(k);
  }
  return out;
}

describe("claveDeEntidad (alias → clave)", () => {
  it("mapea los módulos del aserradero sin importar mayúsculas", () => {
    expect(claveDeEntidad("ForestCtpEntry")).toBe("libro-ctp");
    expect(claveDeEntidad("WoodEntry")).toBe("libro-ctp");
    expect(claveDeEntidad("ForestLoteAserrio")).toBe("libro-ctp");
    expect(claveDeEntidad("forestctpimport")).toBe("libro-ctp");
    expect(claveDeEntidad("ForestLothEntry")).toBe("lo-th");
    expect(claveDeEntidad("ForestGtf")).toBe("guias");
    expect(claveDeEntidad("ForestGuiaGuardada")).toBe("guias");
    expect(claveDeEntidad("Asistencia")).toBe("rrhh");
    expect(claveDeEntidad("Colaborador")).toBe("rrhh");
    expect(claveDeEntidad("camara")).toBe("camaras");
    expect(claveDeEntidad("AgendaActividad")).toBe("agenda");
  });

  it("mantiene los módulos de siempre, con y sin el prefijo [L29733]", () => {
    expect(claveDeEntidad("[L29733] Sale")).toBe("ventas");
    expect(claveDeEntidad("[L29733] order")).toBe("pedidos");
    expect(claveDeEntidad("[L29733] Customer")).toBe("clientes");
    expect(claveDeEntidad("[L29733] Fiado")).toBe("fiado");
    expect(claveDeEntidad("  Cupón ")).toBe("cupones");
    expect(claveDeEntidad("adelanto")).toBe("adelantos");
    expect(claveDeEntidad("WhatsAppConversation")).toBe("whatsapp");
  });

  it("deja afuera el ruido de sistema y lo que no es módulo", () => {
    for (const ruido of ["admin", "System", "[L29733] NotificationLog", "ForestCtpRespaldo", "Tenant", "usage.meter", "", "   "]) {
      expect(claveDeEntidad(ruido)).toBeNull();
    }
    expect(claveDeEntidad(null)).toBeNull();
    expect(claveDeEntidad(undefined)).toBeNull();
  });

  it("no repite un alias en dos módulos ni una clave", () => {
    const aliases = MODULOS.flatMap((m) => m.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
    const claves = MODULOS.map((m) => m.key);
    expect(new Set(claves).size).toBe(claves.length);
    expect(aliases.every((a) => a === a.trim().toLowerCase())).toBe(true);
  });
});

describe("rubroDeNegocio", () => {
  it("es Aserradero si usa algún módulo forestal", () => {
    expect(rubroDeNegocio(["productos", "libro-ctp"])).toBe("aserradero");
    expect(rubroDeNegocio(["lo-th"])).toBe("aserradero");
    expect(rubroDeNegocio(new Set(["guias"]))).toBe("aserradero");
  });

  it("es Bodega si solo usa módulos generales o nada", () => {
    expect(rubroDeNegocio([])).toBe("bodega");
    expect(rubroDeNegocio(["productos", "ventas", "rrhh", "camaras", "agenda"])).toBe("bodega");
  });

  it("la ficha madereria también cuenta, pero industry=bodega no le quita lo forestal", () => {
    expect(rubroDeNegocio([], "madereria")).toBe("aserradero");
    expect(rubroDeNegocio(["libro-ctp"], "bodega")).toBe("aserradero");
    expect(rubroDeNegocio([], "restaurante")).toBe("bodega");
  });
});

describe("consejosDeRubro (le falta X, solo de su rubro)", () => {
  it("Blas (entidades reales a 30 días) tiene ≥6 módulos y ningún consejo de Cupones/Marketplace", () => {
    const usados = clavesDe(ENTIDADES_DE_BLAS_30D);
    expect(usados.size).toBeGreaterThanOrEqual(6);
    for (const k of ["libro-ctp", "lo-th", "guias", "rrhh", "camaras", "agenda", "adelantos", "ventas"]) {
      expect(usados.has(k)).toBe(true);
    }
    const rubro = rubroDeNegocio(usados, "bodega");
    expect(rubro).toBe("aserradero");
    const falta = consejosDeRubro(rubro, usados).map((m) => m.label);
    expect(falta).not.toContain("Cupones");
    expect(falta).not.toContain("Marketplace");
    expect(falta).not.toContain("Fiado");
    expect(falta).not.toContain("Delivery");
    expect(falta).toEqual(["WhatsApp"]);
  });

  it("a una bodega no le sugiere módulos forestales y sí Cupones/Marketplace", () => {
    const falta = consejosDeRubro("bodega", new Set(["productos", "ventas"])).map((m) => m.label);
    expect(falta).toEqual(expect.arrayContaining(["Fiado", "Cupones", "Marketplace", "Delivery", "WhatsApp"]));
    for (const forestal of ["Libro CTP", "Libro LO-TH", "Guías (GTF)"]) expect(falta).not.toContain(forestal);
  });

  it("a un aserradero que solo usa el Libro CTP le sugiere LO-TH y guías", () => {
    const falta = consejosDeRubro("aserradero", new Set(["libro-ctp"])).map((m) => m.label);
    expect(falta).toEqual(expect.arrayContaining(["Libro LO-TH", "Guías (GTF)", "Personal y asistencia"]));
    expect(falta).not.toContain("Libro CTP");
  });

  it("un negocio que usa todo lo de su rubro no tiene consejos", () => {
    const todoAserradero = new Set(MODULOS.filter((m) => m.para.includes("aserradero")).map((m) => m.key));
    expect(consejosDeRubro("aserradero", todoAserradero)).toEqual([]);
  });

  it("la ventana es de 30 días y cada clave tiene su definición", () => {
    expect(VENTANA_DIAS).toBe(30);
    expect(moduloDe("libro-ctp")?.forestal).toBe(true);
    expect(moduloDe("cupones")?.para).toEqual(["bodega"]);
    expect(moduloDe("no-existe")).toBeUndefined();
  });
});
