/**
 * De quién es la madera (ADR-412).
 *
 * Lo que se prueba es que el libro no responda por nadie: una corrida que no
 * declaró dueño se queda sin declarar, y una que declara tiene que decir algo
 * que se sostenga.
 */

import { describe, expect, it } from "vitest";
import {
  esDuenoMadera,
  etiquetaCortaDeDueno,
  etiquetaDeDueno,
  revisarDueno,
} from "@/lib/forestal/dueno-de-la-madera";

describe("revisarDueno", () => {
  it("«de tercero» sin nombre no dice de quién es", () => {
    const r = revisarDueno({ dueno: "tercero", titularNombre: "  " });
    expect(r.valido).toBe(false);
    expect(r.problema).toContain("de quién");
  });

  it("«propia» con titular dice dos cosas a la vez", () => {
    const r = revisarDueno({ dueno: "propia", titularNombre: "CC.NN. San Luis" });
    expect(r.valido).toBe(false);
    expect(r.problema).toContain("San Luis");
  });

  it("«de tercero» con nombre se guarda limpio", () => {
    const r = revisarDueno({ dueno: "tercero", titularNombre: "  CC.NN. San Luis  " });
    expect(r.valido).toBe(true);
    expect(r.normalizado).toEqual({ dueno: "tercero", titularNombre: "CC.NN. San Luis" });
  });

  it("«propia» no arrastra ningún titular", () => {
    expect(revisarDueno({ dueno: "propia", titularNombre: "" }).normalizado).toEqual({
      dueno: "propia",
      titularNombre: null,
    });
  });

  it("no declarar es válido: una corrida vieja no eligió nada", () => {
    /* Y NO se la convierte en «propia»: responder por ella sería inventarle un
       dueño, que es justo lo que una fiscalización pregunta. */
    const r = revisarDueno({ dueno: null, titularNombre: null });
    expect(r.valido).toBe(true);
    expect(r.normalizado.dueno).toBeNull();
  });

  it("un nombre suelto sin elección no se tira a la basura", () => {
    const r = revisarDueno({ dueno: null, titularNombre: "Maderera del Oriente" });
    expect(r.valido).toBe(true);
    expect(r.normalizado.titularNombre).toBe("Maderera del Oriente");
  });
});

describe("cómo se lee", () => {
  it("de tercero se lee con el nombre", () => {
    expect(etiquetaDeDueno({ dueno: "tercero", titularNombre: "CC.NN. San Luis" })).toBe(
      "De tercero · CC.NN. San Luis",
    );
  });

  it("sin declarar no ocupa una línea para decir que no se sabe", () => {
    expect(etiquetaDeDueno({ dueno: null, titularNombre: null })).toBeNull();
    expect(etiquetaCortaDeDueno(null)).toBeNull();
  });

  it("propia se lee como del centro", () => {
    expect(etiquetaDeDueno({ dueno: "propia", titularNombre: null })).toBe("Del centro");
    expect(etiquetaCortaDeDueno("propia")).toBe("Del centro");
  });
});

describe("esDuenoMadera", () => {
  it("sólo acepta los dos valores del libro", () => {
    expect(esDuenoMadera("propia")).toBe(true);
    expect(esDuenoMadera("tercero")).toBe(true);
    expect(esDuenoMadera("maquila")).toBe(false);
    expect(esDuenoMadera(null)).toBe(false);
  });
});
