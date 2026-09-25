/**
 * El formulario que carga la escuadría de un paquete del Libro.
 *
 * Lo que se fija acá es lo que ningún tipo atrapa:
 *  · se TIPEA en pulgadas y pies, SIEMPRE (Brandon, 2026-09-23: «en general el
 *    espesor y el ancho son en pulgadas y el largo en pies»), tenga o no
 *    escuadría el paquete — 2" × 8" × 5 pies = 5.08 × 20.32 cm · 1.52 m,
 *    exactamente lo que ya tiene guardado `SL-1` en el libro real de Blas;
 *  · sin selector de unidad: no hay nada que elegir, sólo tipear;
 *  · guardar SIN tocar un campo deja su cm/m ORIGINAL, no el de ida y vuelta
 *    por pulgadas (que mete redondeo) — medido en 197 paquetes reales de Blas;
 *  · el volumen declarado NO se pisa: se muestra el recalculado al lado y la
 *    diferencia;
 *  · sin las tres medidas no se puede guardar, y los 19 paquetes importados sin
 *    piezas piden las piezas antes de dejar guardar.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import CtpEscuadriaPaqueteModal, {
  type PaqueteAMedir,
} from "@/components/admin/forestal/CtpEscuadriaPaqueteModal";

afterEach(cleanup);

/** `d1d1`, corrida 25 del libro real: 1 pieza, 0.0730 m³ y ninguna medida. */
const SIN_MEDIDAS: PaqueteAMedir = {
  id: "pq-d1d1",
  codigo: "d1d1",
  ctpEntryId: "corrida-25",
  lineNo: 25,
  producto: "MADERA ASERRADA (PAQUETERIA LARGA)",
  especie: "Tornillo",
  cantidad: 1,
  volumenM3: 0.073,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
};

/** `SL-1`, corrida 28: las tres medidas cargadas y el volumen que cuadra. */
const CON_MEDIDAS: PaqueteAMedir = {
  ...SIN_MEDIDAS,
  id: "pq-sl1",
  codigo: "SL-1",
  ctpEntryId: "corrida-28",
  lineNo: 28,
  volumenM3: 0.0157,
  espesorCm: 5.08,
  anchoCm: 20.32,
  largoM: 1.52,
};

/** `55`, corrida 15: importado, sin medidas y con `cantidad = 0`. */
const SIN_PIEZAS: PaqueteAMedir = { ...SIN_MEDIDAS, id: "pq-55", codigo: "55", cantidad: 0 };

/**
 * Un paquete cuyas medidas NO son la conversión exacta de pulgadas/pies
 * redondos — como cuando el aserradero midió un poco distinto o el dato entró
 * por importación. `5.1 cm` se ACERCA a 2″ para tipear (diff 0.008″, dentro de
 * la tolerancia), pero 2″ exactos son 5.08 cm: si se recalculara al guardar,
 * el libro perdería esos 0.02 cm en silencio. Ídem ancho (20.3 → 8″ → 20.32) y
 * largo (1.51 → 5 pies → 1.52). Es el caso real del pedido de Brandon.
 */
const CON_MEDIDAS_REDONDEO: PaqueteAMedir = {
  ...SIN_MEDIDAS,
  id: "pq-redondeo",
  codigo: "RD-1",
  ctpEntryId: "corrida-30",
  lineNo: 30,
  volumenM3: 0.025,
  espesorCm: 5.1,
  anchoCm: 20.3,
  largoM: 1.51,
};

const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

function montar(paquete: PaqueteAMedir) {
  const onGuardar = vi.fn(async () => {});
  const onCerrar = vi.fn();
  render(<CtpEscuadriaPaqueteModal paquete={paquete} onCerrar={onCerrar} onGuardar={onGuardar} />);
  return { onGuardar, onCerrar };
}

const guardarBtn = () => screen.getByRole("button", { name: /guardar escuadría/i });

describe("se tipea en pulgadas y pies, se guarda en cm y m", () => {
  it("un paquete sin medidas arranca en pulg/pies, vacío", () => {
    montar(SIN_MEDIDAS);
    expect(campo("Espesor (pulg)").value).toBe("");
    expect(campo("Ancho (pulg)").value).toBe("");
    expect(campo("Largo (pies)").value).toBe("");
  });

  it("no hay selector de unidad: sólo el campo de número", () => {
    montar(SIN_MEDIDAS);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("2 × 8 pulg × 5 pies viaja al libro como 5.08 × 20.32 cm · 1.52 m", async () => {
    const { onGuardar } = montar(SIN_MEDIDAS);
    fireEvent.change(campo("Espesor (pulg)"), { target: { value: "2" } });
    fireEvent.change(campo("Ancho (pulg)"), { target: { value: "8" } });
    fireEvent.change(campo("Largo (pies)"), { target: { value: "5" } });
    fireEvent.click(guardarBtn());
    expect(onGuardar).toHaveBeenCalledWith({
      paqueteId: "pq-d1d1",
      ctpEntryId: "corrida-25",
      espesorCm: 5.08,
      anchoCm: 20.32,
      largoM: 1.52,
    });
  });

  it("un paquete que YA tiene medidas TAMBIÉN se abre en pulg y pies, no en cm y m", () => {
    montar(CON_MEDIDAS);
    expect(campo("Espesor (pulg)").value).toBe("2");
    expect(campo("Ancho (pulg)").value).toBe("8");
    expect(campo("Largo (pies)").value).toBe("5");
  });
});

describe("lo que no se toca, no se reescribe", () => {
  it("guardar sin tocar ningún campo manda el cm/m ORIGINAL, no el de ida y vuelta", () => {
    const { onGuardar } = montar(CON_MEDIDAS_REDONDEO);
    // Las tres se muestran acercadas a la medida redonda (2″ × 8″ × 5 pies):
    // eso es sólo para tipear cómodo, no lo que se va a guardar.
    expect(campo("Espesor (pulg)").value).toBe("2");
    expect(campo("Ancho (pulg)").value).toBe("8");
    expect(campo("Largo (pies)").value).toBe("5");
    fireEvent.click(guardarBtn());
    // Si se recalculara desde 2″/8″/5 pies exactos daría 5.08/20.32/1.52 —
    // distinto del original. El libro tiene que quedar con lo que ya tenía.
    expect(onGuardar).toHaveBeenCalledWith({
      paqueteId: "pq-redondeo",
      ctpEntryId: "corrida-30",
      espesorCm: 5.1,
      anchoCm: 20.3,
      largoM: 1.51,
    });
  });

  it("tocar UN campo sólo recalcula ése; los otros dos viajan con su cm/m original", () => {
    const { onGuardar } = montar(CON_MEDIDAS_REDONDEO);
    fireEvent.change(campo("Ancho (pulg)"), { target: { value: "10" } });
    fireEvent.click(guardarBtn());
    expect(onGuardar).toHaveBeenCalledWith({
      paqueteId: "pq-redondeo",
      ctpEntryId: "corrida-30",
      espesorCm: 5.1, // sin tocar: original exacto
      anchoCm: 25.4, // tocado: 10 pulg → 25.4 cm
      largoM: 1.51, // sin tocar: original exacto, no el recalculado 1.52
    });
  });
});

describe("el volumen se muestra, no se pisa", () => {
  it("con las tres medidas muestra lo declarado, lo recalculado y la diferencia", () => {
    montar(CON_MEDIDAS);
    expect(screen.getByText("Declara el asiento").parentElement?.textContent).toContain("0.0157");
    expect(screen.getByText("Dan sus medidas").parentElement?.textContent).toContain("0.0157");
    expect(screen.getByText(/Cuadra:/)).toBeTruthy();
  });

  it("cuando la cuenta no da, lo dice con los dos números a la vista", () => {
    montar({ ...CON_MEDIDAS, volumenM3: 0.157 });
    const dif = screen.getByText("Diferencia").parentElement?.textContent ?? "";
    expect(dif).toContain("0.1413");
    // El aviso viene del libro (`avisosDeCifra`), con la cuenta escrita.
    expect(screen.getByText(/10 veces más/)).toBeTruthy();
  });

  it("igual deja guardar: el libro registra lo que pasó, el aviso no bloquea", () => {
    montar({ ...CON_MEDIDAS, volumenM3: 0.157 });
    expect((guardarBtn() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("lo que no se puede guardar", () => {
  it("sin las tres medidas el botón está apagado", () => {
    montar(SIN_MEDIDAS);
    expect((guardarBtn() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(campo("Espesor (pulg)"), { target: { value: "2" } });
    fireEvent.change(campo("Ancho (pulg)"), { target: { value: "8" } });
    expect((guardarBtn() as HTMLButtonElement).disabled).toBe(true);
  });

  it("un paquete importado sin piezas las pide, y recién ahí guarda", () => {
    const { onGuardar } = montar(SIN_PIEZAS);
    fireEvent.change(campo("Espesor (pulg)"), { target: { value: "2" } });
    fireEvent.change(campo("Ancho (pulg)"), { target: { value: "8" } });
    fireEvent.change(campo("Largo (pies)"), { target: { value: "5" } });
    expect((guardarBtn() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(campo("Piezas del paquete"), { target: { value: "12" } });
    fireEvent.click(guardarBtn());
    expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ cantidad: 12 }));
  });

  it("al paquete que ya declaró piezas no se las vuelve a pedir", () => {
    montar(SIN_MEDIDAS);
    expect(screen.queryByLabelText("Piezas del paquete")).toBeNull();
  });
});

describe("el error del servidor se muestra, no se traga", () => {
  it("un rechazo del libro queda escrito en el formulario", async () => {
    const onGuardar = vi.fn(async () => {
      throw new Error("El período ya está cerrado.");
    });
    render(
      <CtpEscuadriaPaqueteModal paquete={CON_MEDIDAS} onCerrar={() => {}} onGuardar={onGuardar} />,
    );
    fireEvent.click(guardarBtn());
    expect(await screen.findByText(/El período ya está cerrado/)).toBeTruthy();
  });
});

describe("la celda de la tabla", () => {
  it("sin escuadría es una puerta, no un guion", async () => {
    const { CeldaEscuadria } = await import("@/components/admin/forestal/ctp-celda-escuadria");
    const onEditar = vi.fn();
    const { container } = render(
      <CeldaEscuadria
        paquete={{
          codigo: "d1d1",
          cantidad: 1,
          volumenM3: 0.073,
          espesorCm: null,
          anchoCm: null,
          largoM: null,
        }}
        onEditar={onEditar}
      />,
    );
    fireEvent.click(within(container).getByRole("button", { name: /cargar medidas/i }));
    expect(onEditar).toHaveBeenCalled();
  });

  it("con escuadría que no cuadra, la fila lo canta", async () => {
    const { CeldaEscuadria } = await import("@/components/admin/forestal/ctp-celda-escuadria");
    const { container } = render(
      <CeldaEscuadria
        paquete={{
          codigo: "SL-1",
          cantidad: 1,
          volumenM3: 0.157,
          espesorCm: 5.08,
          anchoCm: 20.32,
          largoM: 1.52,
        }}
        onEditar={() => {}}
      />,
    );
    expect(within(container).getByText("No cuadra")).toBeTruthy();
    expect(within(container).getByText("5.08 × 20.32 cm · 1.52 m")).toBeTruthy();
  });

  it("una fila sin paquete no ofrece medir nada", async () => {
    const { CeldaEscuadria } = await import("@/components/admin/forestal/ctp-celda-escuadria");
    const { container } = render(<CeldaEscuadria paquete={null} onEditar={() => {}} />);
    expect(within(container).queryByRole("button")).toBeNull();
  });
});
