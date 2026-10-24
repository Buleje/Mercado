// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrigenRecepcion from "@/components/admin/ordenes-compra/recepciones/OrigenRecepcion";
import type { NuevaRecepcion } from "@/components/admin/ordenes-compra/recepciones/use-nueva-recepcion";

/**
 * Revisión 17-10: con 9 órdenes pendientes en main, «Recibir» decía «No hay
 * órdenes esperando mercadería» mientras la lista llegaba (y para siempre si
 * el pedido fallaba). El vacío sólo se dice cuando la lista ya llegó vacía.
 */
const estado = (p: Partial<NuevaRecepcion>) => ({
  origen: "orden", cambiarOrigen: vi.fn(), pendingOCs: [], estadoOCs: "listo", loadPendingOCs: vi.fn(),
  selectedOcId: "", applyOC: vi.fn(), motivo: "", setMotivo: vi.fn(), motivoOtro: "", setMotivoOtro: vi.fn(), ...p,
}) as unknown as NuevaRecepcion;

afterEach(cleanup);

describe("OrigenRecepcion · lista de órdenes por recibir", () => {
  it("mientras carga no dice que no hay órdenes", () => {
    render(<OrigenRecepcion n={estado({ estadoOCs: "cargando" })} />);
    expect(screen.queryByText(/No hay órdenes esperando/)).toBeNull();
    expect(screen.getByText(/Buscando las órdenes/)).toBeTruthy();
  });

  it("si el pedido falla, avisa y deja reintentar", () => {
    const loadPendingOCs = vi.fn();
    render(<OrigenRecepcion n={estado({ estadoOCs: "error", loadPendingOCs })} />);
    expect(screen.queryByText(/No hay órdenes esperando/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(loadPendingOCs).toHaveBeenCalledTimes(1);
  });

  it("lista que llegó vacía: ahí sí lo dice", () => {
    render(<OrigenRecepcion n={estado({ estadoOCs: "listo" })} />);
    expect(screen.getByText(/No hay órdenes esperando/)).toBeTruthy();
  });
});
