import { describe, expect, it } from "vitest";
import { anexoGuardadoDelPermiso, firmaDePiezas } from "@/lib/forestal/anexo-del-permiso-guardado";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";

const pz = (id: string, cantidad: number, espesor = 2, ancho = 8, largo = 10): PiezaCubicada =>
  ({ id, cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" }) as PiezaCubicada;
const anexo = (id: string, piezas: PiezaCubicada[], extra: Partial<AnexoEmitido> = {}): AnexoEmitido =>
  ({ id, numero: "1", gtf: "19-001-0000001", piezas, ...extra }) as AnexoEmitido;

describe("firmaDePiezas", () => {
  it("suma filas partidas y no depende del orden", () => {
    expect(firmaDePiezas([pz("a", 3), pz("b", 2, 2, 10), pz("c", 4)])).toBe(firmaDePiezas([pz("x", 2, 2, 10), pz("y", 7)]));
  });
  it("distingue una pieza de más o una medida distinta", () => {
    expect(firmaDePiezas([pz("a", 7)])).not.toBe(firmaDePiezas([pz("a", 8)]));
    expect(firmaDePiezas([pz("a", 7)])).not.toBe(firmaDePiezas([pz("a", 7, 2, 6)]));
  });
});

describe("la especie es parte del papel", () => {
  it("mismas medidas de otra madera no son el mismo anexo; la especie del lote cuenta como la de la pieza", () => {
    const tornillo = [{ ...pz("t1", 5), especie: "Tornillo" }];
    const cumala = [{ ...pz("c1", 5), especie: "Cumala" }];
    expect(anexoGuardadoDelPermiso(tornillo, [anexo("a-cumala", cumala)])).toBeNull();
    expect(anexoGuardadoDelPermiso(tornillo, [anexo("a-global", [pz("x", 5)], { especieGlobal: "TORNILLO" })])?.id).toBe("a-global");
  });
});

describe("anexoGuardadoDelPermiso", () => {
  const permiso = [pz("p1", 5), pz("p2", 4, 2, 10)];
  it("sin anexos o con otro contenido: null", () => {
    expect(anexoGuardadoDelPermiso(permiso, [])).toBeNull();
    expect(anexoGuardadoDelPermiso(permiso, [anexo("a", [pz("z", 9)])])).toBeNull();
    expect(anexoGuardadoDelPermiso([], [anexo("a", permiso)])).toBeNull();
  });
  it("encuentra el anexo con las mismas medidas", () => {
    expect(anexoGuardadoDelPermiso(permiso, [anexo("a", [pz("z", 9)]), anexo("b", permiso)])?.id).toBe("b");
  });
  it("prefiere el que ya está en el libro, luego el no reemplazado", () => {
    const lista = [
      anexo("nuevo", permiso),
      anexo("viejo-reemplazado", permiso, { reemplazadoPor: "nuevo" }),
      anexo("en-libro", permiso, { despachoIds: ["d1"] }),
    ];
    expect(anexoGuardadoDelPermiso(permiso, lista)?.id).toBe("en-libro");
    expect(anexoGuardadoDelPermiso(permiso, lista.slice(0, 2))?.id).toBe("nuevo");
  });
});
