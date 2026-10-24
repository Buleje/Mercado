/**
 * Hoja «Para inspección» (Esenciales, 24-10): la hoja impresa lista EXACTAMENTE
 * lo que el QR deja ver — papeles directos, sin los de subcarpetas, y sin los
 * que el enlace no serviría por candado o permisos de quien lo crea.
 */

import { describe, expect, it } from "vitest";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";
import { contarHoja, estadoDeVencimiento, indiceParaInspeccion, resumenDeLaHoja } from "@/lib/documentos/inspeccion-indice";

const AHORA = Date.parse("2026-10-24T15:00:00Z");
const DIA = 86_400_000;
const iso = (dias: number) => new Date(AHORA + dias * DIA).toISOString();

const carpeta = (id: string, name: string, parentId: string | null = null, allowedRoles: string[] = []) => ({ id, name, parentId, allowedRoles });
const doc = (id: string, folderId: string, name: string, expiresAt: string | null, allowedRoles: string[] = [], deletedAt: string | null = null) => ({
  id, folderId, name, mimeType: "application/pdf", uploadedAt: iso(-100), expiresAt, allowedRoles, deletedAt,
});

const carpetas = [
  carpeta("raiz", "Empresa"),
  carpeta("lic", "Licencias", "raiz"),
  carpeta("sub", "2025", "lic"),
  carpeta("nomina", "Nómina", null, [ROL_CANDADO_DUENO]),
];
const docs = [
  doc("a", "lic", "Permiso B", iso(200)),
  doc("b", "lic", "Permiso A", iso(-3)),
  doc("c", "lic", "Contrato socio", iso(10), [ROL_CANDADO_DUENO]),
  doc("d", "lic", "Sin fecha", null),
  doc("e", "lic", "Borrado", iso(5), [], iso(-1)),
  doc("f", "sub", "Viejo", iso(-400)),
  doc("g", "nomina", "Planilla octubre", iso(30)),
];

describe("estadoDeVencimiento", () => {
  it("vencido / por vencer (≤30 días) / vigente / sin fecha", () => {
    expect(estadoDeVencimiento(iso(-1), AHORA)).toBe("vencido");
    expect(estadoDeVencimiento(iso(30), AHORA)).toBe("por-vencer");
    expect(estadoDeVencimiento(iso(31), AHORA)).toBe("vigente");
    expect(estadoDeVencimiento(null, AHORA)).toBe("sin-fecha");
    expect(estadoDeVencimiento("no es fecha", AHORA)).toBe("sin-fecha");
  });
});

describe("indiceParaInspeccion", () => {
  const elegidas = [carpetas[1], carpetas[3]];

  it("el dueño ve también lo que tiene candado; vencido primero, luego por nombre", () => {
    const [lic, nom] = indiceParaInspeccion({ elegidas, carpetas, docs, rol: "owner", ahora: AHORA });
    expect(lic.papeles.map((p) => p.nombre)).toEqual(["Permiso A", "Contrato socio", "Permiso B", "Sin fecha"]);
    expect(lic.ruta).toEqual(["Empresa"]);
    expect(lic.papeles[0].tipo).toBe("PDF");
    expect(lic.enSubcarpetas).toBe(1);
    expect(lic.ocultos).toBe(0);
    expect(nom.papeles).toHaveLength(1);
  });

  it("el encargado (manager) no saca papeles con candado: ni sueltos ni por la carpeta", () => {
    const [lic, nom] = indiceParaInspeccion({ elegidas, carpetas, docs, rol: "manager", ahora: AHORA });
    expect(lic.papeles.map((p) => p.id)).not.toContain("c");
    expect(lic.ocultos).toBe(1);
    expect(nom.papeles).toEqual([]);
    expect(nom.ocultos).toBe(1);
  });

  it("los borrados no cuentan y la cuenta cuadra con el resumen", () => {
    const hoja = indiceParaInspeccion({ elegidas: [carpetas[1]], carpetas, docs, rol: "owner", ahora: AHORA });
    expect(hoja[0].papeles.map((p) => p.id)).not.toContain("e");
    const n = contarHoja(hoja);
    expect(n).toEqual({ papeles: 4, vencidos: 1, porVencer: 1, vigentes: 1, sinFecha: 1 });
    expect(resumenDeLaHoja(n)).toBe("4 papeles · 1 vencido · 1 por vencer · 1 vigente · 1 sin fecha de vencimiento");
  });
});
