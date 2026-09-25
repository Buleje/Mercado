/**
 * Revisión 23-09 (hallazgo 2): con «más nuevas primero», GUARDAR la cubicación
 * la mandaba en el orden de la tabla (dada vuelta). El Anexo 04 carga lo
 * guardado y numera en ese orden → salía al revés. Se guarda en el orden del
 * papel: el N° del Anexo es el N° de la pantalla.
 */
import { describe, expect, it } from "vitest";
import { masNuevasPrimero, numeroDeFila } from "@/lib/forestal/cubicador-bloques-especie";
import { piezasParaGuardar, piezasParaVincular } from "@/lib/forestal/cubicacion-para-guardar";
import { construirAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { recubicarPiezas, type PiezaCubicada } from "@/lib/forestal/cubicacion";

const pieza = (n: number, largo: number): PiezaCubicada => ({
  id: `p-${1000 + n}-${n}`,
  cantidad: 1,
  espesor: 2,
  ancho: 8,
  largo,
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
  especie: "Tornillo",
  codigo: `T${n}`,
  pieTablar: 0,
  m3: 0,
});

/* Dictadas 1..4 con largos 8, 9, 10, 12; la tabla las muestra al revés. */
const dictado = [pieza(0, 8), pieza(1, 9), pieza(2, 10), pieza(3, 12)];
const tabla = masNuevasPrimero(dictado);

describe("guardar con «más nuevas primero»", () => {
  it("las piezas viajan en el orden de dictado, no en el de la tabla", () => {
    expect(piezasParaGuardar(tabla, "recientes").map((p) => p.largo)).toEqual([8, 9, 10, 12]);
    expect(piezasParaVincular(tabla, "recientes").map((p) => p.largo)).toEqual([8, 9, 10, 12]);
  });

  it("el Anexo 04 armado con lo guardado numera cada pieza con el N° de la pantalla", () => {
    /* Como vuelve del servidor: sin PT ni m³ (se recubica al cargar, `Anexo04Origen`). */
    const guardadas = recubicarPiezas(
      piezasParaGuardar(tabla, "recientes").map(
        (p): PiezaCubicada => ({
          ...p,
          especie: p.especie ?? undefined,
          dueno: p.dueno ?? undefined,
          duenoParteId: p.duenoParteId ?? undefined,
          tipo: p.tipo ?? undefined,
          observacion: p.observacion ?? undefined,
          pieTablar: 0,
          m3: 0,
        }),
      ),
    );
    const anexo = construirAnexo04(guardadas, { unidadV: "pt", modo: "oficial" });
    const filas = anexo.hojas.flatMap((h) => h.bloques.flatMap((b) => b.filas));
    for (const [i, fila] of tabla.entries()) {
      const enAnexo = filas.find((f) => f.id === fila.id);
      expect(enAnexo?.n).toBe(numeroDeFila(i, tabla.length, "recientes"));
    }
  });

  it("guardar la tabla como se ve (lo de antes) numeraba el Anexo al revés", () => {
    const comoSeVe = recubicarPiezas(tabla.map((p) => ({ ...p })));
    const anexo = construirAnexo04(comoSeVe, { unidadV: "pt", modo: "oficial" });
    const filas = anexo.hojas.flatMap((h) => h.bloques.flatMap((b) => b.filas));
    /* La de arriba de la pantalla (N° 4) salía como N° 1 del Anexo. */
    expect(filas.find((f) => f.id === tabla[0]!.id)?.n).toBe(1);
    expect(numeroDeFila(0, tabla.length, "recientes")).toBe(4);
  });

  it("lo que se vincula al Libro no lleva el código interno de la troza", () => {
    expect(piezasParaVincular(tabla, "recientes").some((p) => "codigo" in p)).toBe(false);
  });

  it("en los otros órdenes guarda la tabla tal cual (lo de siempre)", () => {
    expect(piezasParaGuardar(dictado, "dictado").map((p) => p.id)).toEqual(
      dictado.map((p) => p.id),
    );
  });

  /* 2026-09-23 (hallazgo #2): la whitelist de guardar sólo dejaba pasar la
     medida — dueño, tipo forzado y observación se perdían al guardar, aunque
     el código NUNCA debe viajar (es interno del cubicado). */
  it("guarda dueno, duenoParteId, tipo y observacion; nunca el codigo", () => {
    const p: PiezaCubicada = {
      ...pieza(9, 8),
      dueno: "Juan Pérez",
      duenoParteId: "parte-123",
      tipo: "Comercial",
      observacion: "para López",
    };
    const [g] = piezasParaGuardar([p], "dictado");
    expect(g.dueno).toBe("Juan Pérez");
    expect(g.duenoParteId).toBe("parte-123");
    expect(g.tipo).toBe("Comercial");
    expect(g.observacion).toBe("para López");
    expect(g).not.toHaveProperty("codigo");
  });
});
