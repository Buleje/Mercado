/**
 * El formulario que carga la escuadría de un paquete del Libro.
 *
 * Lo que se fija acá es lo que ningún tipo atrapa:
 *  · se TIPEA en pulgadas y pies (así es el cubicador) y lo que viaja al libro
 *    son cm y m — 2" × 8" × 5 pies = 5.08 × 20.32 cm · 1.52 m, exactamente lo
 *    que ya tiene guardado `SL-1` en el libro real de Blas;
 *  · un paquete que YA tiene medidas se abre en cm y m, sin reconvertir;
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

const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const unidad = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

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
    expect(campo("Espesor").value).toBe("");
    expect(unidad("Unidad de espesor").value).toBe("pulg");
    expect(unidad("Unidad de largo").value).toBe("pies");
  });

  it("2 × 8 pulg × 5 pies viaja al libro como 5.08 × 20.32 cm · 1.52 m", async () => {
    const { onGuardar } = montar(SIN_MEDIDAS);
    fireEvent.change(campo("Espesor"), { target: { value: "2" } });
    fireEvent.change(campo("Ancho"), { target: { value: "8" } });
    fireEvent.change(campo("Largo"), { target: { value: "5" } });
    fireEvent.click(guardarBtn());
    expect(onGuardar).toHaveBeenCalledWith({
      paqueteId: "pq-d1d1",
      ctpEntryId: "corrida-25",
      espesorCm: 5.08,
      anchoCm: 20.32,
      largoM: 1.52,
    });
  });

  it("un paquete que YA tiene medidas se abre en cm y m, sin reconvertir a pies", () => {
    montar(CON_MEDIDAS);
    expect(campo("Espesor").value).toBe("5.08");
    expect(campo("Largo").value).toBe("1.52");
    expect(unidad("Unidad de largo").value).toBe("m");
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
    fireEvent.change(campo("Espesor"), { target: { value: "2" } });
    fireEvent.change(campo("Ancho"), { target: { value: "8" } });
    expect((guardarBtn() as HTMLButtonElement).disabled).toBe(true);
  });

  it("un paquete importado sin piezas las pide, y recién ahí guarda", () => {
    const { onGuardar } = montar(SIN_PIEZAS);
    fireEvent.change(campo("Espesor"), { target: { value: "2" } });
    fireEvent.change(campo("Ancho"), { target: { value: "8" } });
    fireEvent.change(campo("Largo"), { target: { value: "5" } });
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
