/**
 * __tests__/ctp-recepcion-en-bloque.test.ts
 *
 * Recibir en bloque existe porque en el tenant real **21 de 24 guías** estaban
 * sin recepcionar y eso dejaba 153 de 160 trozas (181 m³) fuera del alcance del
 * cubicador. Pero recibir es declarar que alguien miró la pila, así que el
 * bloque no puede ser un «marcar todo y listo»: lo que se fija acá es qué NO
 * deja pasar y que la plata cierre al céntimo.
 */
import { describe, expect, it } from "vitest";

import {
  MARCA_VACIA,
  aplicarMismaFecha,
  guiaTildada,
  marcasIniciales,
  problemaDeFecha,
  tildadasParaRecibir,
  tildeDeGuia,
  problemasDelBloque,
  repartirCosto,
  resumenDelBloque,
  tocarMarca,
  type GuiaDelBloque,
  type Marcas,
} from "@/lib/forestal/recepcion-bloque";

const guia = (clave: string, over: Partial<GuiaDelBloque> = {}): GuiaDelBloque => ({
  clave,
  gtfNumber: `001-000${clave}`,
  volumenM3: 10,
  trozasM3: 10,
  trozasCount: 4,
  trozasDecididas: 0,
  lineas: [{ id: `${clave}-a`, volumeM3: 6 }, { id: `${clave}-b`, volumeM3: 4 }],
  ...over,
});
/* Marcar una guía la llena con su fecha de llegada (ADR-434): cada guía lleva la suya. */
const marcar = (clave: string, over: Partial<Marcas[string]> = {}): Marcas => ({
  [clave]: { ...MARCA_VACIA, marcada: true, fecha: "2026-09-15", ...over },
});

describe("la fecha en que bajó la madera", () => {
  it("es obligatoria y con formato", () => {
    expect(problemaDeFecha("")).toContain("Falta la fecha");
    expect(problemaDeFecha("15/09/2026")).toContain("Falta la fecha");
  });

  it("no puede ser de un día que todavía no llegó", () => {
    expect(problemaDeFecha("2026-09-20", "2026-09-15")).toContain("todavía no llegó");
  });

  it("hoy sirve, y ayer también", () => {
    expect(problemaDeFecha("2026-09-15", "2026-09-15")).toBeNull();
    expect(problemaDeFecha("2026-09-01", "2026-09-15")).toBeNull();
  });
});

describe("lo que el bloque no deja pasar", () => {
  it("una guía que no cuadra con sus piezas se puede recibir, pero no en silencio", () => {
    const g = guia("1", { volumenM3: 10, trozasM3: 6 });
    expect(problemasDelBloque([g], marcar("1"))[0]?.motivo).toContain("escribe qué pasó");
    expect(problemasDelBloque([g], marcar("1", { observacion: "vinieron 2 trozas menos" }))).toHaveLength(0);
  });

  it("un «ok» de dos letras no es una explicación", () => {
    const g = guia("1", { volumenM3: 10, trozasM3: 6 });
    expect(problemasDelBloque([g], marcar("1", { observacion: "ok" }))).toHaveLength(1);
  });

  it("el costo o es un número mayor que cero, o queda vacío", () => {
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "abc" }))[0]?.motivo).toContain("mayor que cero");
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "0" }))).toHaveLength(1);
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "" }))).toHaveLength(0);
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "1500.50" }))).toHaveLength(0);
  });

  it("cada guía marcada necesita SU fecha, y la revisa quien la conoce (ADR-434)", () => {
    expect(problemasDelBloque([guia("1")], marcar("1", { fecha: "" }))[0]?.motivo).toContain("Falta la fecha");
    const antesDeLaGuia = (_g: unknown, f: string) => (f < "2026-09-10" ? "antes de su guía" : null);
    expect(problemasDelBloque([guia("1")], marcar("1", { fecha: "2026-09-02" }), antesDeLaGuia)[0]?.motivo).toBe("antes de su guía");
    expect(problemasDelBloque([guia("1")], marcar("1", { fecha: "2026-09-12" }), antesDeLaGuia)).toHaveLength(0);
  });

  it("una guía sin marcar no se revisa: el tilde es la declaración", () => {
    const g = guia("1", { volumenM3: 10, trozasM3: 6 });
    expect(problemasDelBloque([g], {})).toHaveLength(0);
  });
});

describe("el costo repartido entre los asientos de la guía", () => {
  it("va por volumen y suma EXACTAMENTE lo que dice la factura", () => {
    const partes = repartirCosto(guia("1"), 1000);
    expect(partes).toEqual([
      { id: "1-a", costoTotal: 600 },
      { id: "1-b", costoTotal: 400 },
    ]);
    expect(partes.reduce((a, p) => a + p.costoTotal, 0)).toBe(1000);
  });

  it("el céntimo suelto de un tercio no se pierde: se lo lleva el último", () => {
    const g = guia("1", { lineas: [{ id: "a", volumeM3: 1 }, { id: "b", volumeM3: 1 }, { id: "c", volumeM3: 1 }] });
    const partes = repartirCosto(g, 100);
    expect(partes.reduce((a, p) => a + p.costoTotal, 0)).toBe(100);
  });

  it("sin costo no reparte nada", () => {
    expect(repartirCosto(guia("1"), 0)).toEqual([]);
  });
});

describe("el resumen que se ve antes de apretar", () => {
  it("cuenta sólo lo marcado", () => {
    const guias = [guia("1"), guia("2")];
    const r = resumenDelBloque(guias, marcar("1", { costoTotal: "500" }));
    expect(r.guias).toBe(1);
    expect(r.m3).toBe(10);
    expect(r.conCosto).toBe(1);
    expect(r.soles).toBe(500);
    expect(resumenDelBloque(guias, {}).guias).toBe(0);
  });
});

describe("elegir en la tabla y recibir con la misma fecha (2026-09-26)", () => {
  const sinRecibir = {
    clave: "A",
    status: "validado",
    lineas: [
      { id: "a1", status: "validado", fechaRecepcion: null },
      { id: "a2", status: "rechazado", fechaRecepcion: null },
    ],
    trozasCount: 3,
    trozasDecididas: 0,
  };
  const recibida = {
    clave: "B",
    status: "validado",
    lineas: [{ id: "b1", status: "validado", fechaRecepcion: "2026-09-10" }],
    trozasCount: 2,
    trozasDecididas: 2,
  };
  const pendienteRecibida = {
    clave: "C",
    status: "pendiente",
    lineas: [{ id: "c1", status: "pendiente", fechaRecepcion: "2026-09-10" }],
    trozasCount: 0,
    trozasDecididas: 0,
  };

  it("una validada a mano y sin recibir SE PUEDE tildar (antes el tilde era sólo de pendientes)", () => {
    expect(tildeDeGuia(sinRecibir)).toEqual({ ids: ["a1"], recepcionable: true, motivo: null });
  });

  it("una ya recibida y validada tiene el tilde apagado y dice por qué", () => {
    expect(tildeDeGuia(recibida)).toEqual({ ids: [], recepcionable: false, motivo: "ya está recibida y validada" });
    expect(tildeDeGuia({ ...recibida, status: "rechazado" }).motivo).toBe("está rechazada");
  });

  it("una pendiente de validar ya recibida se tilda para validar, pero no entra a recibir", () => {
    const t = tildeDeGuia(pendienteRecibida);
    expect(t.ids).toEqual(["c1"]);
    expect(t.recepcionable).toBe(false);
    expect(tildadasParaRecibir([sinRecibir, pendienteRecibida], ["a1", "c1"]).map((g) => g.clave)).toEqual(["A"]);
  });

  it("tildada = todos los asientos de su tilde están elegidos", () => {
    expect(guiaTildada(sinRecibir, ["a1"])).toBe(true);
    expect(guiaTildada(sinRecibir, [])).toBe(false);
    expect(guiaTildada(recibida, ["b1"])).toBe(false);
  });

  it("el bloque abierto desde la tabla arranca marcado, cada guía con SU propuesta", () => {
    const m = marcasIniciales(["A", "D"], (c) => (c === "A" ? "2026-09-02" : null));
    expect(m.A).toMatchObject({ marcada: true, fecha: "2026-09-02" });
    expect(m.D).toMatchObject({ marcada: true, fecha: "" });
  });

  it("«misma fecha para todas» pisa sólo las marcadas y no toca lo demás de la fila", () => {
    const marcas: Marcas = {
      A: { ...MARCA_VACIA, marcada: true, fecha: "2026-09-02", observacion: "vino mojada" },
      B: { ...MARCA_VACIA, marcada: false, fecha: "" },
      C: { ...MARCA_VACIA, marcada: true, fecha: "2026-09-05", aceptaVencida: true, motivoVencida: "lluvia" },
    };
    const r = aplicarMismaFecha(marcas, "2026-09-20", () => null);
    expect(r.A).toMatchObject({ fecha: "2026-09-20", observacion: "vino mojada" });
    expect(r.B.fecha).toBe("");
    expect(r.C).toMatchObject({ fecha: "2026-09-20", aceptaVencida: true, motivoVencida: "lluvia" });
    expect(marcas.A.fecha).toBe("2026-09-02");
  });

  /* Revisión 26-09: vaciar el campo dejaba la fecha común en todas las filas,
     y volver a ponerla pisaba las que se corrigieron a mano. */
  const propuestaDe = (c: string) => ({ A: "2026-09-02", B: "2026-09-04" })[c] ?? null;

  it("vaciar el campo común devuelve a cada guía SU propuesta (no deja la común)", () => {
    const comun = aplicarMismaFecha(marcasIniciales(["A", "B"], propuestaDe), "2026-09-20", propuestaDe);
    expect(comun.A.fecha).toBe("2026-09-20");
    const r = aplicarMismaFecha(comun, "", propuestaDe);
    expect(r.A.fecha).toBe("2026-09-02");
    expect(r.B.fecha).toBe("2026-09-04");
  });

  it("una fecha a medio tipear no pisa nada", () => {
    const marcas: Marcas = { A: { ...MARCA_VACIA, marcada: true, fecha: "2026-09-02" } };
    expect(aplicarMismaFecha(marcas, "2026-09", propuestaDe)).toBe(marcas);
  });

  it("la fila corregida a mano no la pisa la fecha común, ni al ponerla ni al vaciarla", () => {
    let m = aplicarMismaFecha(marcasIniciales(["A", "B"], propuestaDe), "2026-09-20", propuestaDe);
    m = tocarMarca(m, "A", { fecha: "2026-09-07" }, "2026-09-20"); // corregida en su fila
    expect(m.A).toMatchObject({ fecha: "2026-09-07", fechaAMano: true });

    const otra = aplicarMismaFecha(m, "2026-09-21", propuestaDe);
    expect(otra.A.fecha).toBe("2026-09-07"); // respetada
    expect(otra.B.fecha).toBe("2026-09-21");

    const vacia = aplicarMismaFecha(otra, "", propuestaDe);
    expect(vacia.A.fecha).toBe("2026-09-07"); // tampoco vuelve a la propuesta
    expect(vacia.B.fecha).toBe("2026-09-04");
  });

  it("marcar una guía DESPUÉS de poner la fecha común la trae con la común (salvo que ya se corrigió a mano)", () => {
    const vacia: Marcas = {};
    const m = tocarMarca(vacia, "A", { marcada: true, fecha: "2026-09-02" }, "2026-09-20");
    expect(m.A).toMatchObject({ marcada: true, fecha: "2026-09-20" });
    expect(m.A.fechaAMano).toBeFalsy(); // el tilde no es una corrección a mano

    const aMano = tocarMarca({ A: { ...MARCA_VACIA, fecha: "2026-09-07", fechaAMano: true } }, "A", { marcada: true }, "2026-09-20");
    expect(aMano.A.fecha).toBe("2026-09-07");
  });

  it("tocar la observación o el costo no marca la fecha como corregida", () => {
    const m = tocarMarca(marcar("A"), "A", { observacion: "vino mojada" }, "");
    expect(m.A.fechaAMano).toBeFalsy();
  });

  it("la fecha común futura se aplica, pero el bloque la frena guía por guía", () => {
    const g = guia("A");
    const r = aplicarMismaFecha(marcar("A"), "2999-01-01", () => null);
    expect(problemasDelBloque([g], r).map((p) => p.motivo)).toEqual([
      "La recepción no puede ser de un día que todavía no llegó.",
    ]);
  });
});
