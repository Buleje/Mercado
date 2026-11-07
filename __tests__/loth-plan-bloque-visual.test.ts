import { describe, expect, it } from "vitest";
import {
  TONOS_DE_BLOQUE,
  conteoDeEstados,
  estadoDelBloque,
  idDeBloque,
  insigniaDelBloque,
  pct,
  tonoDelBloque,
  tramosDeEspecie,
  tramosDelBloque,
} from "@/components/admin/forestal/loth-plan-bloque-visual";

const total = (usadoM3: number, pendienteM3: number) => ({
  autorizadoM3: 50,
  usadoM3,
  pendienteM3,
  quedaM3: 0,
  quedaSiSeRegistranM3: 0,
  disponibleM3: 0,
  seExcedeM3: 0,
});

describe("insigniaDelBloque", () => {
  it("se queda con el número del nombre", () => {
    expect(insigniaDelBloque("Bloque 2")).toBe("2");
    expect(insigniaDelBloque("  Zona 12 ")).toBe("12");
    expect(insigniaDelBloque("Parcela 20345")).toBe("345");
  });
  it("sin número, las iniciales sin las palabras de relleno", () => {
    expect(insigniaDelBloque("Zona Norte")).toBe("N");
    expect(insigniaDelBloque("Parcela Alta Baja")).toBe("AB");
    expect(insigniaDelBloque("Bloque A")).toBe("A");
    expect(insigniaDelBloque("Área de la quebrada")).toBe("Q");
  });
  it("si sólo hay relleno, las dos primeras letras; vacío = «?»", () => {
    expect(insigniaDelBloque("zona")).toBe("ZO");
    expect(insigniaDelBloque("   ")).toBe("?");
  });
});

describe("tonoDelBloque", () => {
  it("da vuelta al llegar al final, también con índices negativos", () => {
    expect(tonoDelBloque(0)).toBe(TONOS_DE_BLOQUE[0]);
    expect(tonoDelBloque(TONOS_DE_BLOQUE.length)).toBe(TONOS_DE_BLOQUE[0]);
    expect(tonoDelBloque(-1)).toBe(TONOS_DE_BLOQUE[TONOS_DE_BLOQUE.length - 1]);
  });
  it("ningún tono es rojo ni coral (ésos dicen «se pasa» y «preliminar») ni un hex", () => {
    for (const t of TONOS_DE_BLOQUE) {
      expect(t).not.toMatch(/error|warning|#/);
    }
  });
});

describe("estadoDelBloque y conteoDeEstados", () => {
  it("se pasa manda sobre todo; después preliminar, cuadra y sin uso", () => {
    expect(estadoDelBloque({ excede: true, total: total(10, 5) })).toBe("se_pasa");
    expect(estadoDelBloque({ excede: false, total: total(10, 5) })).toBe("preliminar");
    expect(estadoDelBloque({ excede: false, total: total(10, 0) })).toBe("cuadra");
    expect(estadoDelBloque({ excede: false, total: total(0, 0) })).toBe("sin_uso");
    /* Menos de medio litro no es uso. */
    expect(estadoDelBloque({ excede: false, total: total(0.0004, 0.0004) })).toBe("sin_uso");
  });
  it("cuenta en el orden de lo urgente y sólo los que hay", () => {
    const bloques = [
      { excede: false, total: total(0, 0) },
      { excede: true, total: total(30, 8) },
      { excede: false, total: total(0, 12) },
      { excede: false, total: total(0, 0) },
    ];
    expect(conteoDeEstados(bloques)).toEqual([
      { estado: "se_pasa", n: 1 },
      { estado: "preliminar", n: 1 },
      { estado: "sin_uso", n: 2 },
    ]);
    expect(conteoDeEstados([])).toEqual([]);
  });
});

describe("tramosDeEspecie", () => {
  it("autorizado = usado + preliminar + libre cuando no se pasa", () => {
    const t = tramosDeEspecie({ autorizadoM3: 30, usadoM3: 10, pendienteM3: 5, excede: false });
    expect(t).toEqual({ usado: 10, preliminar: 5, libre: 15, pasa: 0, escala: 30, tope: 1 });
  });
  it("lo que se pasa va DESPUÉS del tope y alarga la barra", () => {
    const t = tramosDeEspecie({ autorizadoM3: 30, usadoM3: 0, pendienteM3: 38.5, excede: true });
    expect(t.usado).toBe(0);
    expect(t.preliminar).toBe(30);
    expect(t.libre).toBe(0);
    expect(t.pasa).toBe(8.5);
    expect(t.escala).toBe(38.5);
    expect(t.tope).toBeCloseTo(30 / 38.5, 6);
  });
  it("especie que no es del bloque (autorizado 0): todo es exceso y el tope cae al inicio", () => {
    const t = tramosDeEspecie({ autorizadoM3: 0, usadoM3: 2, pendienteM3: 1, excede: true });
    expect(t).toMatchObject({ usado: 0, preliminar: 0, libre: 0, pasa: 3, escala: 3, tope: 0 });
  });
  it("sin `excede` del servidor no hay tramo rojo (la tolerancia es suya)", () => {
    const t = tramosDeEspecie({ autorizadoM3: 30, usadoM3: 30.0002, pendienteM3: 0, excede: false });
    expect(t.pasa).toBe(0);
    expect(t.usado).toBe(30);
    expect(t.escala).toBe(30);
  });
  it("una barra vacía no divide por cero", () => {
    expect(tramosDeEspecie({ autorizadoM3: 0, usadoM3: 0, pendienteM3: 0, excede: false })).toMatchObject({ escala: 0, tope: 1 });
  });
});

describe("tramosDelBloque", () => {
  it("suma por especie: lo libre de una no tapa lo que se pasa otra", () => {
    const t = tramosDelBloque([
      { autorizadoM3: 30, usadoM3: 0, pendienteM3: 38.5, excede: true },
      { autorizadoM3: 20, usadoM3: 0, pendienteM3: 7.2, excede: false },
    ]);
    expect(t.usado).toBe(0);
    expect(t.preliminar).toBe(37.2);
    expect(t.libre).toBe(12.8);
    expect(t.pasa).toBe(8.5);
    expect(t.escala).toBe(58.5);
    expect(t.tope).toBeCloseTo(50 / 58.5, 6);
  });
});

describe("pct e idDeBloque", () => {
  it("pct se queda entre 0 y 100", () => {
    expect(pct(15, 30)).toBe(50);
    expect(pct(45, 30)).toBe(100);
    expect(pct(-1, 30)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });
  it("idDeBloque sin tildes ni espacios", () => {
    expect(idDeBloque("Bloque 2")).toBe("bloque-del-plan-bloque-2");
    expect(idDeBloque(" Zona Ñuñu Área ")).toBe("bloque-del-plan-zona-nunu-area");
    expect(idDeBloque("—")).toBe("bloque-del-plan-sin-nombre");
  });
});
