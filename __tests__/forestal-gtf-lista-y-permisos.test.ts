/**
 * Vista GTF del Libro TH (Brandon 08-10):
 *   · al importar, el «N° de Lista de Trozas» de la ficha de SERFOR queda en
 *     `gtfDatos.guia.listaTrozasNro` y se lee para «Datos» y el resumen;
 *   · con guías de 2+ permisos, la barra avisa «van N permisos → N oficios»
 *     antes de salir del libro.
 * Las fichas son las anonimizadas de Blas (mismo JSON que el importador).
 */
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { listaTrozasDeLaGuia } from "@/lib/forestal/gtf-resumen-interno-datos";
import { avisoDePermisos, permisosDeLasGuias } from "@/lib/forestal/tramites-permiso";

const FICHAS = fichasJson as unknown as Record<string, GtfSerfor>;

describe("N° de Lista de Trozas al importar", () => {
  it.each([
    ["1-10-0473187", "000006"],
    ["1-10-0474633", "10-000011"],
    ["1-19-0300920", "L-19-0300920"],
    ["110-19-0472267", "16,17"],
  ])("la ficha %s guarda la lista %s y se lee de vuelta", (registro, lista) => {
    const datos = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHAS[registro], true))) as unknown;
    expect(listaTrozasDeLaGuia(datos)).toBe(lista);
  });

  it("sin ficha ni casilleros no hay N°", () => {
    expect(listaTrozasDeLaGuia(null)).toBeNull();
    expect(listaTrozasDeLaGuia({})).toBeNull();
  });
});

describe("van N permisos → N oficios", () => {
  const g = (n: string, permiso: string | null) => ({ gtfNumber: n, status: "emitida", tituloHabilitante: permiso });

  it("un solo permiso (aunque escrito distinto) no avisa", () => {
    expect(avisoDePermisos(permisosDeLasGuias([g("1", "19-SEC/REG-PLT-2025-096"), g("2", "19 sec reg plt 2025 96")]))).toBeNull();
  });

  it("dos permisos avisan antes de salir", () => {
    expect(avisoDePermisos(permisosDeLasGuias([g("1", "19-SEC/REG-PLT-2025-096"), g("2", "17-CPO/C-J-045-26"), g("3", null)]))).toBe(
      "Van 2 permisos → 2 oficios: la Relación arma uno por permiso.",
    );
  });
});
