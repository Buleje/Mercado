/**
 * Cámaras «al lado» (2026-10-09): el aviso «apareció alguien» ofrece «Marcar
 * asistencia», y la hoja del día sólo saca foto al LLEGAR alguien (pasar a un
 * estado de presencia), no al tipear la hora ni al pasar de Presente a Tardanza.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const warning = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => warning(...a), error: vi.fn() } }));
vi.mock("@/lib/forestal/pitido", () => ({ pitidoAviso: vi.fn(), prepararPitido: vi.fn() }));

import { useAvisoPersonas } from "@/components/admin/forestal/camaras/use-aviso-personas";
import { tocaFoto } from "@/components/admin/rrhh/asistencia/use-fotos-asistencia";

const aparicion = { camaraId: "cam1", nombre: "Portón", personas: 1, at: 1_000 } as Parameters<
  ReturnType<typeof useAvisoPersonas>["avisar"]
>[0];

describe("aviso de personas con «Marcar asistencia»", () => {
  beforeEach(() => warning.mockClear());

  it("la acción principal es marcar asistencia y «Ver» queda de secundaria", () => {
    const ver = vi.fn();
    const asistencia = vi.fn();
    const { result } = renderHook(() => useAvisoPersonas(ver, asistencia));
    act(() => result.current.avisar(aparicion));
    const opciones = warning.mock.calls[0][1] as { action: { label: string; onClick: () => void }; cancel?: { label: string } };
    expect(opciones.action.label).toBe("Marcar asistencia");
    expect(opciones.cancel?.label).toBe("Ver");
    opciones.action.onClick();
    expect(asistencia).toHaveBeenCalledTimes(1);
  });

  it("sin asistencia (Modo TV) queda como antes: sólo «Ver»", () => {
    const { result } = renderHook(() => useAvisoPersonas(vi.fn()));
    act(() => result.current.avisar(aparicion));
    const opciones = warning.mock.calls[0][1] as { action: { label: string }; cancel?: unknown };
    expect(opciones.action.label).toBe("Ver");
    expect(opciones.cancel).toBeUndefined();
  });
});

describe("cuándo la marca saca foto", () => {
  it.each([
    [null, "PRESENTE", true],
    ["FALTA", "TARDANZA", true],
    [null, "MEDIO_DIA", true],
    ["PRESENTE", "PRESENTE", false], // tipeó la hora o la nota
    ["PRESENTE", "TARDANZA", false], // ya estaba: no es otra llegada
    [null, "FALTA", false],
    ["PRESENTE", null, false], // desmarcar
  ] as const)("%s → %s = %s", (antes, despues, esperado) => {
    expect(tocaFoto(antes, despues)).toBe(esperado);
  });
});
