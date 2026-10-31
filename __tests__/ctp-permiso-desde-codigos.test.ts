/**
 * __tests__/ctp-permiso-desde-codigos.test.ts
 *
 * 6 de las 14 corridas reales del libro de Blas se registraron **sin permiso**,
 * aunque en ese patio cada código de troza lleva a una sola guía y a un solo
 * título habilitante (24 guías, 3 permisos, 0 códigos ambiguos). Lo que se
 * escribe al cubicar alcanza para proponerlo.
 *
 * Lo que se cuida: proponer cuando hay UNO, callarse cuando no hay dato y NO
 * elegir cuando hay varios — dos permisos en una corrida es información, no un
 * empate a resolver por sorteo.
 */
import { describe, expect, it } from "vitest";

import { permisoDesdeLosCodigos, type TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";

const troza = (codigo: string, permiso: string | null, guia: string | null = "010-001-0000005"): TrozaParaCodigo => ({
  id: `t-${codigo}`,
  codigo,
  especie: "Tornillo",
  m3: 2.4,
  guia,
  permiso,
  d1Cm: null,
  d2Cm: null,
  largoM: null,
});

const PATIO = [
  troza("115-A", "10-HUA-PUE/PER-FMP-2026-007"),
  troza("115-B", "10-HUA-PUE/PER-FMP-2026-007"),
  troza("300-C", "19-SEC/REG-PLT-2018-020", "010-001-0000009"),
  troza("400-D", null),
];

describe("permisoDesdeLosCodigos", () => {
  it("propone el permiso cuando todos los códigos vienen del mismo", () => {
    const r = permisoDesdeLosCodigos(["115-A", "115-B"], PATIO);
    expect(r).toMatchObject({ estado: "uno", permiso: "10-HUA-PUE/PER-FMP-2026-007" });
    expect(r.estado === "uno" && r.guias).toEqual(["010-001-0000005"]);
  });

  it("con códigos de dos permisos no elige: los muestra", () => {
    const r = permisoDesdeLosCodigos(["115-A", "300-C"], PATIO);
    expect(r.estado).toBe("varios");
    expect(r.estado === "varios" && r.permisos).toHaveLength(2);
  });

  it("una troza sin permiso cargado no inventa uno", () => {
    expect(permisoDesdeLosCodigos(["400-D"], PATIO)).toEqual({ estado: "sin-dato" });
  });

  it("un código que no está en el patio no propone nada", () => {
    expect(permisoDesdeLosCodigos(["999-Z"], PATIO)).toEqual({ estado: "sin-dato" });
  });

  it("«-» no es un código: 49 de las 160 trozas reales lo tienen como codificación", () => {
    expect(permisoDesdeLosCodigos(["-", "  "], PATIO)).toEqual({ estado: "sin-dato" });
    expect(permisoDesdeLosCodigos([], PATIO)).toEqual({ estado: "sin-dato" });
  });

  it("el mismo código repetido cuenta una vez", () => {
    const r = permisoDesdeLosCodigos(["115-A", "115-A", " 115-A "], PATIO);
    expect(r.estado === "uno" && r.codigos).toEqual(["115-A"]);
  });
});
