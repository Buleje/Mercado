/**
 * Un modal hecho a mano abierto sobre un `AdminModal` (Radix) que sigue abierto
 * abajo (revisión 23-09): sin capa de Radix quedaba sin clics y sin foco.
 * `EncimaDeRadix` lo apila como capa de Radix.
 */
import { act, render } from "@testing-library/react";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";
import AdminModal from "@/components/admin/shared/AdminModal";
import EncimaDeRadix from "@/components/admin/shared/encima-de-radix";
import CtpEditarLineaModal from "@/components/admin/forestal/CtpEditarLineaModal";

const linea = {
  id: "c1", lineNo: 1, fecha: "2026-09-22T00:00:00.000Z", observations: null, presentacion: null,
  materiaPrimaRef: null, speciesCommon: "Tornillo", speciesScientific: null, productType: "MADERA ASERRADA",
  duenoMadera: null, titularNombre: null, unit: "m3", quantity: 1, volumeInputM3: 2, atadaPorque: null,
  permisos: [], gtfOrigen: [],
};

async function montar(conCapa: boolean) {
  const editor = <CtpEditarLineaModal linea={linea as never} onCerrar={() => {}} onListo={() => {}} />;
  render(
    <AdminModal open onClose={() => {}} title="Registrar producción">
      <button type="button">adentro</button>
      {conCapa ? <EncimaDeRadix titulo="Editar corrida">{editor}</EncimaDeRadix> : createPortal(editor, document.body)}
    </AdminModal>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  /* Con una capa arriba, Radix marca la de abajo `aria-hidden` y su nombre
     accesible deja de calcularse: se la busca por su texto. */
  const radix = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) =>
    d.textContent?.includes("Registrar producción"),
  )!;
  const caja = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d !== radix && !radix.contains(d))!;
  const campo = caja.querySelector<HTMLElement>("input, select, textarea")!;
  await act(async () => {
    campo.focus();
    await new Promise((r) => setTimeout(r, 20));
  });
  return { radix, caja };
}

describe("modal a mano sobre un modal de Radix", () => {
  it("sin capa, Radix le roba el foco (el bug que se arregla)", async () => {
    const { radix, caja } = await montar(false);
    expect(caja.contains(document.activeElement)).toBe(false);
    expect(radix.contains(document.activeElement)).toBe(true);
  });

  it("con EncimaDeRadix, el foco se queda en el modal de arriba y recibe clics", async () => {
    const { caja } = await montar(true);
    expect(caja.contains(document.activeElement)).toBe(true);
    /* La capa le devuelve los clics que Radix apagó en el body. */
    const capa = caja.closest<HTMLElement>('[role="none"]');
    expect(capa?.style.pointerEvents).toBe("auto");
  });
});
