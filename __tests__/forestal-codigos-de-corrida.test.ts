/**
 * La libreta de códigos por corrida: pre-armar sin fabricar trazabilidad.
 *
 * Lo que se cuida acá es que los códigos queden ATADOS a su corrida. El
 * cubicador de «Producir sin lote» reusa el mismo espacio de `localStorage` en
 * cada jornada: sin esta libreta, la corrida de ayer se quedaría con los
 * códigos que se escribieron cubicando la de hoy — un origen inventado.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  codigosRecordados,
  olvidarCodigosDeCorrida,
  recordarCodigosDeCorrida,
} from "@/lib/forestal/codigos-de-corrida";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("active-tenant-slug", "inversiones-agroforestales-blas-sociedad-anonima");
});

describe("codigos-de-corrida", () => {
  it("cada corrida se queda con los suyos", () => {
    recordarCodigosDeCorrida("corrida-A", [{ codigo: "115-A" }, { codigo: "115-B" }]);
    recordarCodigosDeCorrida("corrida-B", [{ codigo: "233-A" }]);
    expect(codigosRecordados("corrida-A")).toEqual(["115-A", "115-B"]);
    expect(codigosRecordados("corrida-B")).toEqual(["233-A"]);
    expect(codigosRecordados("corrida-Z")).toEqual([]);
  });

  it("no anota nada cuando todas las piezas se cubicaron sin código", () => {
    recordarCodigosDeCorrida("corrida-A", [{ codigo: "-" }, { codigo: "" }, {}]);
    expect(codigosRecordados("corrida-A")).toEqual([]);
  });

  it("al vincular se olvidan: ya cumplieron", () => {
    recordarCodigosDeCorrida("corrida-A", [{ codigo: "115-A" }]);
    olvidarCodigosDeCorrida("corrida-A");
    expect(codigosRecordados("corrida-A")).toEqual([]);
  });

  it("la libreta es por tenant: otro negocio no ve estos códigos", () => {
    recordarCodigosDeCorrida("corrida-A", [{ codigo: "115-A" }]);
    localStorage.setItem("active-tenant-slug", "main");
    expect(codigosRecordados("corrida-A")).toEqual([]);
  });

  it("un localStorage con basura no rompe la pantalla", () => {
    localStorage.setItem("buleje-codigos-corrida-main", "no es json");
    localStorage.setItem("active-tenant-slug", "main");
    expect(codigosRecordados("corrida-A")).toEqual([]);
  });

  it("no crece sin fin: se sueltan las corridas más viejas", () => {
    for (let i = 0; i < 70; i += 1) recordarCodigosDeCorrida(`c-${i}`, [{ codigo: `cod-${i}` }]);
    const guardadas = Object.keys(
      JSON.parse(localStorage.getItem("buleje-codigos-corrida-inversiones-agroforestales-blas-sociedad-anonima") ?? "{}"),
    );
    expect(guardadas.length).toBeLessThanOrEqual(60);
    expect(codigosRecordados("c-69")).toEqual(["cod-69"]);
  });
});
