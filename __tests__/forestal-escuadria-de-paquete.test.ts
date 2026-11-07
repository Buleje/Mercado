/**
 * La escuadría de un paquete: cargarla, y que cuadre con el volumen declarado.
 *
 * Los casos son los del libro REAL de `inversiones-agroforestales-blas-sociedad-
 * anonima` medidos el 2026-09-15 (33 paquetes):
 *
 *   - 27 sin escuadría (`espesorCm`/`anchoCm`/`largoM` en `null`).
 *   - 19 de esos 27, además, sin piezas (`cantidad = 0`: códigos 55…73).
 *   - 6 completos, los `SL-1`…`SL-6` de «Producir sin lote» (corrida N.º 28).
 *   - Códigos: 19 son sólo un número, y van de `2026-032` (parece un permiso) a
 *     `SL-6`.
 */

import { describe, it, expect } from "vitest";
import {
  ESCUADRIA_EN_BLANCO,
  aEscuadriaDelLibro,
  aEscuadriaTipeada,
  cuadreDeEscuadria,
  escuadriaCompleta,
  fmtEscuadria,
} from "@/lib/forestal/escuadria-del-paquete";
import {
  AYUDA_FORMA_CODIGO,
  codigoCanonicoDePaquete,
  codigoTieneForma,
  sugerirCodigoPaquete,
} from "@/lib/forestal/produccion-paquetes";
import { TOLERANCIA_MEDIDA } from "@/lib/forestal/produccion-cifras-imposibles";

/** `SL-1` del libro real: 2" × 8" × 5 pies, 1 pieza, 0.0157 m³ declarados. */
const SL1 = {
  codigo: "SL-1",
  cantidad: 1,
  volumenM3: 0.0157,
  espesorCm: 5.08,
  anchoCm: 20.32,
  largoM: 1.52,
};

/** `d1d15`, corrida 26: 141 piezas, 0.0010 m³ y ninguna medida. */
const SIN_MEDIDAS = {
  codigo: "d1d15",
  cantidad: 141,
  volumenM3: 0.001,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
};

/** `55`, corrida 15: importado, sin medidas Y sin piezas. */
const SIN_PIEZAS = {
  codigo: "55",
  cantidad: 0,
  volumenM3: 0.002,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
};

describe("se carga en pulgadas y pies, se guarda en cm y m", () => {
  it("2 pulg × 8 pulg × 5 pies da exactamente lo que el libro tiene en SL-1", () => {
    expect(
      aEscuadriaDelLibro({
        ...ESCUADRIA_EN_BLANCO,
        espesor: "2",
        ancho: "8",
        largo: "5",
      }),
    ).toEqual({ espesorCm: 5.08, anchoCm: 20.32, largoM: 1.52 });
  });

  it("acepta la coma decimal — en la plaza se escribe «2,5»", () => {
    const m = aEscuadriaDelLibro({
      ...ESCUADRIA_EN_BLANCO,
      espesor: "2,5",
      ancho: "6",
      largo: "8",
    });
    expect(m.espesorCm).toBe(6.35);
    expect(m.largoM).toBe(2.44);
  });

  it("media escuadría no es escuadría: lo que falta queda en null", () => {
    const m = aEscuadriaDelLibro({ ...ESCUADRIA_EN_BLANCO, espesor: "2", ancho: "", largo: "5" });
    expect(m).toEqual({ espesorCm: 5.08, anchoCm: null, largoM: 1.52 });
    expect(escuadriaCompleta(m)).toBe(false);
  });

  it("un paquete que YA tiene medidas se abre en cm y m, no reconvertido a pies", () => {
    /* 1.52 m ÷ 0.3048 = 4.99 pies: mostrar «4.99» a quien midió 5 es enseñarle a
       desconfiar de la pantalla. */
    expect(aEscuadriaTipeada(SL1)).toEqual({
      espesor: "5.08",
      ancho: "20.32",
      largo: "1.52",
      uEspesor: "cm",
      uAncho: "cm",
      uLargo: "m",
    });
  });

  it("lo tipeado en cm vuelve igual: la ida y la vuelta no mueven el número", () => {
    expect(aEscuadriaDelLibro(aEscuadriaTipeada(SL1))).toEqual({
      espesorCm: 5.08,
      anchoCm: 20.32,
      largoM: 1.52,
    });
  });

  it("escribe la escuadría como se lee en una celda", () => {
    expect(fmtEscuadria(SL1)).toBe("5.08 × 20.32 cm · 1.52 m");
    expect(fmtEscuadria(SIN_MEDIDAS)).toBe("—");
  });
});

describe("el cuadre contra el volumen declarado", () => {
  it("paquete sin medidas: no hay nada que comparar, y lo dice", () => {
    const c = cuadreDeEscuadria(SIN_MEDIDAS);
    expect(c.estado).toBe("sin-medidas");
    expect(c.calculadoM3).toBeNull();
    expect(c.diferenciaM3).toBeNull();
    expect(c.texto).toContain("Sin escuadría");
  });

  it("paquete con las tres: el volumen sale de las medidas y cuadra", () => {
    const c = cuadreDeEscuadria(SL1);
    expect(c.estado).toBe("cuadra");
    /* 0.0508 × 0.2032 × 1.52 × 1 = 0.015689… → 0.0157, el declarado. */
    expect(c.calculadoM3).toBe(0.0157);
    expect(c.diferenciaM3).toBe(0);
    expect(c.aviso).toBeNull();
  });

  it("SL-6 del libro real (15 piezas de 6×6 de 0.46 m) también cuadra", () => {
    const c = cuadreDeEscuadria({
      codigo: "SL-6",
      cantidad: 15,
      volumenM3: 0.1592,
      espesorCm: 15.24,
      anchoCm: 15.24,
      largoM: 0.46,
    });
    expect(c.estado).toBe("cuadra");
  });

  it("volumen que NO cuadra con sus medidas: se señala y se escribe la cuenta", () => {
    /* La coma corrida: las mismas medidas de SL-1 con 0.157 m³ declarados. */
    const c = cuadreDeEscuadria({ ...SL1, volumenM3: 0.157 });
    expect(c.estado).toBe("no-cuadra");
    expect(c.calculadoM3).toBe(0.0157);
    expect(c.diferenciaM3).toBe(0.1413);
    expect(c.aviso?.motivo).toBe("medida-no-cuadra");
    expect(c.aviso?.tono).toBe("error");
    // La cuenta escrita, no «valor sospechoso».
    expect(c.texto).toContain("0.0157");
    expect(c.texto).toContain("0.1570");
  });

  it("usa la MISMA tolerancia del libro (10 %), no una propia", () => {
    const justoDentro = cuadreDeEscuadria({
      ...SL1,
      volumenM3: Number((0.0157 * (1 + TOLERANCIA_MEDIDA - 0.01)).toFixed(4)),
    });
    const justoAfuera = cuadreDeEscuadria({
      ...SL1,
      volumenM3: Number((0.0157 * (1 + TOLERANCIA_MEDIDA + 0.05)).toFixed(4)),
    });
    expect(justoDentro.estado).toBe("cuadra");
    expect(justoAfuera.estado).toBe("no-cuadra");
  });

  it("con medidas pero sin piezas no inventa un volumen", () => {
    const c = cuadreDeEscuadria({ ...SIN_PIEZAS, espesorCm: 5.08, anchoCm: 20.32, largoM: 1.52 });
    expect(c.estado).toBe("sin-piezas");
    expect(c.calculadoM3).toBeNull();
  });

  it("los 19 importados (sin medidas y sin piezas) salen como «sin medidas»", () => {
    /* Primero lo que falta cargar, no lo segundo: la escuadría es la puerta. */
    expect(cuadreDeEscuadria(SIN_PIEZAS).estado).toBe("sin-medidas");
  });

  it("medidas cargadas sobre un paquete sin volumen declarado", () => {
    const c = cuadreDeEscuadria({ ...SL1, volumenM3: 0 });
    expect(c.estado).toBe("sin-volumen");
    expect(c.calculadoM3).toBe(0.0157);
  });
});

describe("un código con forma", () => {
  it("los 6 SL- del libro real tienen forma; los otros 27 no", () => {
    for (const c of ["SL-1", "SL-6", "PQ-014", "PQ-2609-001", "X-9"]) {
      expect(codigoTieneForma(c), c).toBe(true);
    }
    /* Códigos REALES de Blas: números pelados (19), iniciales pegadas a un
       dígito, y uno que parece un N.º de permiso. */
    for (const c of [
      "55",
      "73",
      "Roly2",
      "DRW",
      "FG2",
      "S1525",
      "d1d15",
      "2026-032",
      "S1525-15-2026",
    ]) {
      expect(codigoTieneForma(c), c).toBe(false);
    }
  });

  it("el canónico es PQ-AAMM-NNN y dice cuándo sin abrir el libro", () => {
    expect(codigoCanonicoDePaquete(new Date("2026-09-15T12:00:00Z"), 1)).toBe("PQ-2609-001");
    expect(codigoCanonicoDePaquete(new Date("2026-09-15T12:00:00Z"), 42)).toBe("PQ-2609-042");
    expect(codigoTieneForma(codigoCanonicoDePaquete(new Date(), 1))).toBe(true);
  });

  it("la ayuda nombra el formato, para que la pantalla no lo repita a mano", () => {
    expect(AYUDA_FORMA_CODIGO).toContain("PQ-AAMM-NNN");
  });
});

describe("el código que se sugiere al crear un paquete", () => {
  const hoy = new Date("2026-09-15T12:00:00Z");
  /** Los 33 códigos del libro real, los más nuevos primero. */
  const BLAS = [
    "SL-6",
    "SL-5",
    "SL-4",
    "SL-3",
    "SL-2",
    "SL-1",
    "2026-032",
    "d1d15",
    "d1d1",
    "S1525-15-2026",
    "S1525",
    "FG2",
    "DRW",
    "Roly2",
    "73",
    "72",
    "71",
    "70",
    "69",
    "68",
    "67",
    "66",
    "65",
    "64",
    "63",
    "62",
    "61",
    "60",
    "59",
    "58",
    "57",
    "56",
    "55",
  ];

  it("NO propone el siguiente número pelado, aunque sea la serie más usada", () => {
    /* La serie «» (55…73) son 19 de 33 códigos: antes ganaba y proponía «74». */
    const sugerido = sugerirCodigoPaquete(BLAS, { hoy });
    expect(sugerido).not.toBe("74");
    expect(codigoTieneForma(sugerido)).toBe(true);
  });

  it("continúa la serie con forma que la planta ya usa (SL-1…SL-6 → SL-7)", () => {
    expect(sugerirCodigoPaquete(BLAS, { hoy })).toBe("SL-7");
  });

  it("sin ninguna serie con forma, siembra el canónico del mes", () => {
    expect(sugerirCodigoPaquete(["73", "72", "71", "Roly2", "2026-032"], { hoy })).toBe(
      "PQ-2609-001",
    );
  });

  it("no renumera lo viejo: los códigos existentes vuelven intactos", () => {
    /* La sugerencia sólo produce el PRÓXIMO; nada de lo cargado se toca. */
    const copia = [...BLAS];
    sugerirCodigoPaquete(BLAS, { hoy });
    expect(BLAS).toEqual(copia);
  });

  it("esquiva el que ya está tomado por el borrador de la pantalla", () => {
    expect(sugerirCodigoPaquete(BLAS, { hoy, ocupados: ["SL-7", "sl-8"] })).toBe("SL-9");
  });
});
