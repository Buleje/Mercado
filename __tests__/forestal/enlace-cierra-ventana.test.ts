import { describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import { abreEnOtraPestana, cerrarAlNavegar } from "@/components/admin/forestal/enlace-cierra-ventana";

const clic = (extra: Partial<MouseEvent> = {}) =>
  ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra }) as MouseEvent;

describe("enlace dentro de una ventana forestal", () => {
  it("el clic normal navega en esta pestaña: la ventana se cierra", () => {
    const cerrar = vi.fn();
    cerrarAlNavegar(cerrar)(clic());
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ctrl + clic", { ctrlKey: true }],
    ["cmd + clic", { metaKey: true }],
    ["shift + clic", { shiftKey: true }],
    ["alt + clic", { altKey: true }],
    ["clic con la rueda", { button: 1 }],
  ])("%s abre otra pestaña: la ventana se queda", (_n, extra) => {
    const cerrar = vi.fn();
    cerrarAlNavegar(cerrar)(clic(extra));
    expect(abreEnOtraPestana(clic(extra))).toBe(true);
    expect(cerrar).not.toHaveBeenCalled();
  });
});
