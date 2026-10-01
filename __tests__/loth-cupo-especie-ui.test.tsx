/**
 * Tests — tabla «Cupo por especie» y aviso de cupo al talar (30-09).
 *
 * - La especie excedida va arriba y el veredicto se LEE (texto), no sólo color.
 * - El aviso pide casilla + motivo; los dos llegan a quien lo monta.
 * - La tanda: un 422 T9 abre el campo de motivo, y el motivo viaja a la ruta.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import LothCupoEspecies from "@/components/admin/forestal/LothCupoEspecies";
import LothAvisoCupo from "@/components/admin/forestal/LothAvisoCupo";
import { medidasVacias } from "@/lib/forestal/loth-forma-medicion";
import { payloadDeFila, queCorregir, resultadoDeRespuesta, type FilaTala } from "@/lib/forestal/loth-tala-tanda";

const ENTRADA = {
  censo: [
    { treeCode: "85-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 2.9 },
    { treeCode: "86-TOR", speciesCommon: "Tornillo", volumenEstimadoM3: 3.3 },
    { treeCode: "111", speciesCommon: "Copaiba", volumenEstimadoM3: 126.9 },
    { treeCode: "501", speciesCommon: "Catahua", volumenEstimadoM3: 60 },
  ],
  talas: [
    { treeCode: "85-TOR", speciesCommon: "Tornillo", volumeM3: 3.564 },
    { treeCode: "86-TOR", speciesCommon: "Tornillo", volumeM3: 5.973 },
    { treeCode: "111", speciesCommon: "Copaiba", volumeM3: 10.37 },
  ],
};

describe("LothCupoEspecies", () => {
  it("Tornillo excedido arriba, con el exceso escrito", () => {
    const { container } = render(<LothCupoEspecies entrada={ENTRADA} />);
    const filas = container.querySelectorAll("tbody tr");
    expect(filas).toHaveLength(3);
    const primera = filas[0] as HTMLElement;
    expect(primera.dataset.veredicto).toBe("excedido");
    expect(within(primera).getByText("Tornillo")).toBeTruthy();
    expect(within(primera).getByText("2 / 2")).toBeTruthy();
    expect(within(primera).getByText("Excedido +3.337 m³")).toBeTruthy();
    expect(within(primera).getByText("153.8 %")).toBeTruthy();
    expect(within(primera).getByRole("meter").getAttribute("aria-valuenow")).toBe("154");
    expect(container.textContent).toContain("1 excedida");
  });

  it("vacío: una frase", () => {
    const { container } = render(<LothCupoEspecies filas={[]} />);
    expect(container.textContent).toContain("Sin censo ni especies autorizadas");
  });
});

describe("LothAvisoCupo", () => {
  it("contra el CENSO: aviso sin casilla, motivo opcional", () => {
    const r = render(
      <LothAvisoCupo mensaje="Con este árbol, Tornillo llega a 154 % de lo censado." obligatorio={false} confirmado={false} onConfirmado={vi.fn()} motivo="" onMotivo={vi.fn()} />,
    );
    expect(r.queryByRole("checkbox")).toBeNull();
    expect(r.container.textContent).toContain("Pasa lo censado de la especie.");
    expect(r.container.textContent).toContain("Se registra igual");
  });

  it("contra lo AUTORIZADO: muestra el número y entrega casilla y motivo", () => {
    const onConfirmado = vi.fn();
    const onMotivo = vi.fn();
    const r = render(
      <LothAvisoCupo
        mensaje="Con este árbol, Tornillo llega a 119 % de lo autorizado en el plan (9.537 de 8.000 m³)."
        obligatorio
        confirmado={false}
        onConfirmado={onConfirmado}
        motivo=""
        onMotivo={onMotivo}
      />,
    );
    expect(r.container.textContent).toContain("Tornillo llega a 119 % de lo autorizado");
    fireEvent.click(r.getByRole("checkbox"));
    expect(onConfirmado).toHaveBeenCalledWith(true);
    fireEvent.change(r.getByLabelText("Motivo de la tala por encima del cupo de la especie"), { target: { value: "censo bajo" } });
    expect(onMotivo).toHaveBeenCalledWith("censo bajo");
  });
});

describe("tanda — T9", () => {
  it("un 422 T9 pide el motivo, y el motivo viaja como motivoSobreCupo", () => {
    const r = resultadoDeRespuesta(422, { error: "T9_CUPO_ESPECIE", message: "Con este árbol, Tornillo llega a 154 %…" });
    expect(queCorregir(r)).toBe("cupo");
    const fila = {
      id: "a",
      arbol: { treeCode: "86-TOR", speciesCommon: "Tornillo", speciesScientific: null, cites: false },
      medidas: medidasVacias(),
      fecha: null,
      motosierrista: null,
      motosierristaId: null,
      hora: null,
      gps: null,
      fotoUrl: null,
      justificacionDmc: "",
      motivoCupo: " el censo subestimó la altura ",
      nota: "",
      resultado: r,
    } as unknown as FilaTala;
    const p = payloadDeFila(
      fila,
      { diamMayorM: 1, diamMenorM: 1, longitudM: 10, volumenM3: 5.973 } as never,
      { fecha: "2026-09-30", motosierrista: "", motosierristaId: null, hora: "", modo: null },
      "cruzadas" as never,
      { planId: "p1", caratulaId: null },
    );
    expect(p.motivoSobreCupo).toBe("el censo subestimó la altura");
  });
});
