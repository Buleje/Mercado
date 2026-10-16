import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CASILLEROS_GTF_2024, casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";

/** Los rótulos del panel salen de `casilleroGtf2024` (ADR-494): el número de la pantalla es el del papel. */
describe("rótulos de casilleros GTF en el panel (2024)", () => {
  const ESPERADO: Record<string, string> = {
    "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
    "8": "9", "9": "10", "10": "11a", "11": "11b", "12": "11c",
    "13": "12", "14": "13", "15": "13", "16": "14a", "17": "14b", "18": "14c", "19": "14d",
    "20": "15", "21": "16", "22": "21", "23": "23", "24": "23",
    "25": "24a", "26": "24b", "27": "24c", "28": "24d",
    "29": "25", "30": "26", "31": "27", "31p": "28", "32": "29", "33": "30", "34": "31",
    "35": "33", "36": "32", "38": "35",
  };
  it("cada clave interna 2015 da el número 2024 de la tabla", () => {
    for (const [clave, n] of Object.entries(ESPERADO)) expect(casilleroGtf2024(clave), clave).toBe(n);
  });
  it("todo número devuelto existe en la tabla del formato", () => {
    const numeros = new Set<string>(CASILLEROS_GTF_2024.map((c) => c.n));
    for (const clave of Object.keys(ESPERADO)) expect(numeros.has(casilleroGtf2024(clave) ?? "")).toBe(true);
  });
  it("los formularios GTF no rotulan con `casillero={N}` numérico (usan casilleroGtf2024)", () => {
    const archivos = [
      "CtpGuiaOficialForm", "CtpIngresoPartesForm", "LothGuiaDatos", "LothGuiaBloques", "LothGuiaTraslado",
      "LothGuiaDocumento", "ctp-guia-bloques-partes", "CtpGuiaDatosTab", "CtpListaProductosTab",
    ];
    for (const a of archivos) {
      const src = readFileSync(`components/admin/forestal/${a}.tsx`, "utf8");
      const sueltos = [...src.matchAll(/casillero=\{(\d+)\}/g)].map((m) => m[1]);
      // CtpListaProductosTab conserva el (12) LO-CTP de «Notas de la guía».
      expect(sueltos.filter((n) => !(a === "CtpListaProductosTab" && n === "12")), a).toEqual([]);
    }
  });
});
