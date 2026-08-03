import { describe, expect, it } from "vitest";
import {
  atribucionDeDespacho,
  faltaAtribuir,
  TOLERANCIA_ATRIBUCION,
} from "@/lib/forestal/atribucion-despacho";

/**
 * Lo que se protege acá es una regla de compliance, no una preferencia de UI:
 * la atribución parcial está PERMITIDA (invariante I4) y el faltante tiene que
 * ser visible. Si alguien "endurece" esto para exigir el 100%, empuja a inventar
 * un origen — el fraude que el libro previene.
 */
describe("atribucionDeDespacho", () => {
  it("sin cantidad declarada no opina: falta el dato de arriba, no el origen", () => {
    expect(atribucionDeDespacho(null, 5).estado).toBe("sin-cantidad");
    expect(atribucionDeDespacho(0, 0).estado).toBe("sin-cantidad");
  });

  it("todo atribuido = completa, y no muestra alarma", () => {
    const e = atribucionDeDespacho(10, 10);
    expect(e.estado).toBe("completa");
    expect(faltaAtribuir(e)).toBe(false);
  });

  it("nada atribuido se dice distinto de a medias", () => {
    const nada = atribucionDeDespacho(10, 0, "m³");
    expect(nada.estado).toBe("sin-atribucion");
    expect(faltaAtribuir(nada) && nada.aviso).toBe("sin origen declarado (10.0000 m³)");

    const medias = atribucionDeDespacho(10, 6, "m³");
    expect(medias.estado).toBe("parcial");
    expect(faltaAtribuir(medias) && medias.aviso).toBe("4.0000 m³ sin origen");
  });

  it("respeta la unidad del despacho: no todo sale en m³", () => {
    const e = atribucionDeDespacho(500, 200, "pt");
    expect(faltaAtribuir(e) && e.aviso).toBe("300.0000 pt sin origen");
  });

  /**
   * Sobre-atribuir lo impide el backend (invariante I4). Si igual llegara, la
   * pantalla NO debe gritar: un negativo mostrado como "faltan −3" es peor que
   * nada. Se trata como completa y el guard del servidor hace su trabajo.
   */
  it("no inventa un faltante negativo si viniera sobre-atribuido", () => {
    expect(atribucionDeDespacho(10, 12).estado).toBe("completa");
  });

  it("perdona el redondeo de SERFOR pero no una diferencia real", () => {
    expect(atribucionDeDespacho(10, 10 - TOLERANCIA_ATRIBUCION).estado).toBe("completa");
    expect(atribucionDeDespacho(10, 9.998).estado).toBe("parcial");
  });

  it("no inventa faltante por el error de coma flotante", () => {
    expect(atribucionDeDespacho(0.3, 0.1 + 0.2).estado).toBe("completa");
  });
});
