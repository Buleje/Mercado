import { describe, it, expect } from "vitest";
import {
  MOTIVO_NO_ENCONTRADA,
  asignarCorrelativos,
  planearEtiquetado,
  tieneCodigoPlanta,
} from "@/lib/forestal/etiquetado-trozas";
import { LABEL_BLOQUEO, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { trozasEtiquetables } from "@/lib/forestal/ctp-troza-etiquetas";

/**
 * ADR-436 — qué pasa con cada pieza al imprimir su etiqueta: se omite, se sella
 * con su código, se numera, o se sella con el del bosque porque el mes cerró.
 */

const troza = (id: string, extra: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id,
  woodEntryId: "we1",
  codificacion: `B-${id}`,
  especieComun: "Tornillo",
  volumenM3: 1.2,
  ...extra,
});

describe("planearEtiquetado", () => {
  it("omite lo que no está en el patio con el MISMO rótulo que la pantalla", () => {
    const piezas = [
      troza("a"),
      troza("b", { consumidaEnId: "c1" }),
      troza("c", { noRecepcionada: true }),
      troza("d", { retrozos: 2 }),
    ];
    const plan = planearEtiquetado(["a", "b", "c", "d", "zz"], piezas, { asignarCodigo: false });
    expect(plan.etiquetar).toEqual(["a"]);
    expect(plan.omitidas).toEqual([
      { id: "b", motivo: LABEL_BLOQUEO.ya_consumida },
      { id: "c", motivo: LABEL_BLOQUEO.no_recepcionada },
      { id: "d", motivo: LABEL_BLOQUEO.madre_retrozada },
      { id: "zz", motivo: MOTIVO_NO_ENCONTRADA },
    ]);
    // El servidor y el botón de imprimir no pueden discrepar sobre qué entra.
    expect(trozasEtiquetables(piezas).map((t) => t.id)).toEqual(plan.etiquetar);
  });

  it("sin asignarCodigo no numera nada, aunque falte el código de planta", () => {
    const plan = planearEtiquetado(["a"], [troza("a")], { asignarCodigo: false });
    expect(plan).toMatchObject({ etiquetar: ["a"], aNumerar: [], sinCodigoNuevo: [] });
  });

  it("numera sólo las que no tienen código, en el orden en que se eligieron", () => {
    const piezas = [troza("a", { codigoPlanta: "40" }), troza("b"), troza("c", { codigoPlanta: "  " })];
    const plan = planearEtiquetado(["c", "a", "b", "c"], piezas, { asignarCodigo: true });
    expect(plan.etiquetar).toEqual(["c", "a", "b"]); // deduplicado
    expect(plan.aNumerar).toEqual(["c", "b"]);
  });

  it("mes cerrado: se etiqueta con el código del bosque y se dice por qué", () => {
    const piezas = [troza("a"), troza("b")];
    const plan = planearEtiquetado(["a", "b"], piezas, {
      asignarCodigo: true,
      periodoCerrado: (t) => (t.id === "a" ? "mayo 2026" : null),
    });
    expect(plan.etiquetar).toEqual(["a", "b"]);
    expect(plan.aNumerar).toEqual(["b"]);
    expect(plan.sinCodigoNuevo).toHaveLength(1);
    expect(plan.sinCodigoNuevo[0].id).toBe("a");
    expect(plan.sinCodigoNuevo[0].motivo).toContain("mayo 2026");
  });

  it("una bloqueada en mes cerrado se omite, no se reporta como «sin código nuevo»", () => {
    const plan = planearEtiquetado(["a"], [troza("a", { descarte: true })], {
      asignarCodigo: true,
      periodoCerrado: () => "mayo 2026",
    });
    expect(plan.omitidas).toEqual([{ id: "a", motivo: LABEL_BLOQUEO.descarte }]);
    expect(plan.sinCodigoNuevo).toEqual([]);
  });
});

describe("asignarCorrelativos", () => {
  it("sigue desde MAX + 1 sin huecos", () => {
    expect(asignarCorrelativos(["x", "y"], 66)).toEqual([
      { id: "x", codigo: "66" },
      { id: "y", codigo: "67" },
    ]);
  });
  it("rechaza un punto de partida inválido en vez de pintar «NaN» en un palo", () => {
    expect(() => asignarCorrelativos(["x"], Number.NaN)).toThrow();
    expect(() => asignarCorrelativos(["x"], 0)).toThrow();
  });
});

describe("tieneCodigoPlanta", () => {
  it("vacío o espacios = sin código", () => {
    expect(tieneCodigoPlanta(null)).toBe(false);
    expect(tieneCodigoPlanta(" ")).toBe(false);
    expect(tieneCodigoPlanta("115-A")).toBe(true);
  });
});
