import { describe, expect, it } from "vitest";
import { fichaDeTroza, pendienteDeRecepcion } from "@/lib/forestal/patio-vista";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "t1",
  woodEntryId: "w1",
  codificacion: "13/A (0000041)",
  codigoPlanta: "118",
  especieComun: "Tornillo",
  volumenM3: 1.842,
  consumidaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  trozaOrigenId: null,
  ...over,
});

describe("fichaDeTroza", () => {
  it("una pieza disponible contesta que se puede mandar a la sierra", () => {
    const f = fichaDeTroza(troza());
    expect(f.tono).toBe("libre");
    expect(f.detalle).toBeNull();
  });

  it("manda el código de PLANTA, que es por el que se pregunta en el patio", () => {
    const f = fichaDeTroza(troza({ codigoPlanta: "118", codificacion: "13/A (0000041)" }));
    expect(f.codigo).toBe("118");
    expect(f.codigoAlterno).toBe("13/A (0000041)");
  });

  it("sin código de planta cae al del bosque, y no repite el mismo dos veces", () => {
    const f = fichaDeTroza(troza({ codigoPlanta: null }));
    expect(f.codigo).toBe("13/A (0000041)");
    expect(f.codigoAlterno).toBeNull();
  });

  it("la que no llegó tiene tono PROPIO: mandar a buscarla es perder el viaje", () => {
    const f = fichaDeTroza(troza({ noRecepcionada: true }));
    expect(f.tono).toBe("ausente");
    expect(f.detalle).toMatch(/nunca bajó del camión/i);
  });

  it("'no llegó' gana sobre cualquier otro bloqueo", () => {
    // Una pieza marcada como no recibida Y consumida es un dato incoherente; en
    // el patio lo que importa es que NO está en la pila.
    const f = fichaDeTroza(troza({ noRecepcionada: true, consumidaEnId: "corrida-1" }));
    expect(f.tono).toBe("ausente");
  });

  it("reusa el motivo de bloqueo del picker, no inventa uno propio", () => {
    const f = fichaDeTroza(troza({ consumidaEnId: "corrida-1" }));
    expect(f.tono).toBe("bloqueada");
    expect(f.detalle).toBe("Ya entró a otra corrida");
  });

  it("la madre retrozada avisa que van los pedazos, no ella", () => {
    const f = fichaDeTroza(troza({ retrozos: 3 }));
    expect(f.tono).toBe("bloqueada");
    expect(f.detalle).toMatch(/pedazos/i);
  });

  it("el descarte del retrozado no es producto", () => {
    const f = fichaDeTroza(troza({ descarte: true }));
    expect(f.tono).toBe("bloqueada");
  });
});

describe("pendienteDeRecepcion", () => {
  const pieza = (over: Record<string, unknown> = {}) => ({
    codigoPlanta: "118",
    noRecepcionada: false,
    trozaOrigenId: null,
    ...over,
  });

  it("una guía con todas marcadas está completa", () => {
    const p = pendienteDeRecepcion([pieza(), pieza({ codigoPlanta: "119" })]);
    expect(p.completa).toBe(true);
    expect(p.faltan).toBe(0);
  });

  it("cuenta las que faltan marcar", () => {
    const p = pendienteDeRecepcion([pieza(), pieza({ codigoPlanta: null }), pieza({ codigoPlanta: "  " })]);
    expect(p.faltan).toBe(2);
    expect(p.conCodigo).toBe(1);
    expect(p.completa).toBe(false);
  });

  it("a la que no llegó no se le exige código: no está en la pila para marcarla", () => {
    const p = pendienteDeRecepcion([pieza(), pieza({ codigoPlanta: null, noRecepcionada: true })]);
    expect(p.noLlegaron).toBe(1);
    expect(p.faltan).toBe(0);
    expect(p.completa).toBe(true);
  });

  it("distingue 'sin empezar' de 'a medias'", () => {
    expect(pendienteDeRecepcion([pieza({ codigoPlanta: null }), pieza({ codigoPlanta: null })]).sinEmpezar).toBe(true);
    expect(pendienteDeRecepcion([pieza(), pieza({ codigoPlanta: null })]).sinEmpezar).toBe(false);
  });

  it("los retrozos no se reciben aparte de su madre", () => {
    const p = pendienteDeRecepcion([pieza(), pieza({ codigoPlanta: null, trozaOrigenId: "t1" })]);
    expect(p.total).toBe(1);
    expect(p.completa).toBe(true);
  });

  it("una guía sin piezas cargadas no está 'completa': no hay nada que recibir", () => {
    const p = pendienteDeRecepcion([]);
    expect(p.completa).toBe(false);
    expect(p.sinEmpezar).toBe(false);
  });
});
