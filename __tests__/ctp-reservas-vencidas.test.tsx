/**
 * La fila de una reserva vencida en la campana de avisos: «Liberar» y «Extender».
 *
 * Se fija lo que viaja al API (la MISMA `liberar_apartado` del modal, y
 * `cambiar_apartado` con sólo el plazo) y que un rechazo del servidor no se
 * disfraza de «listo»: la fila queda, con el motivo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/* El rol de quien mira: por defecto admin; el test de permisos lo cambia. */
const R = vi.hoisted(() => ({ rol: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => R.rol }));

import CtpReservasVencidas from "@/components/admin/forestal/CtpReservasVencidas";
import type { ReservaVencida } from "@/lib/forestal/reservas-vencidas";
import { EVENTO_APARTADOS } from "@/lib/forestal/apartados-evento";

/** Miércoles 23/09/2026 al mediodía en Lima. */
const HOY = new Date("2026-09-23T12:00:00-05:00");

const juancho: ReservaVencida = {
  id: "ap-juancho",
  para: "Juancho",
  hasta: "2026-09-22",
  lineNo: 29,
  especie: "Cachimbo",
  producto: "MADERA ASERRADA (COMERCIAL)",
  paqueteCodigo: "SL-7",
  volumenM3: 1.25,
  diasVencida: 1,
};
const maderera: ReservaVencida = {
  ...juancho,
  id: "ap-b",
  para: "Maderera B",
  lineNo: 3,
  especie: "Tornillo",
  paqueteCodigo: null,
  volumenM3: null,
  hasta: "2026-09-19",
  diasVencida: 4,
};

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const falla = (message: string) => new Response(JSON.stringify({ message }), { status: 422 });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  R.rol = "admin";
  fetchMock = vi.fn().mockResolvedValue(ok());
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(reservas: ReservaVencida[] = [maderera, juancho]) {
  const onResuelta = vi.fn();
  const onVer = vi.fn();
  render(<CtpReservasVencidas reservas={reservas} onResuelta={onResuelta} onVer={onVer} ahora={HOY} />);
  return { onResuelta, onVer };
}

const cuerpo = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body));

describe("CtpReservasVencidas — una por fila, con el conteo", () => {
  it("dice cuántas son y cada una con su texto", () => {
    montar();
    expect(screen.getByText("2 reservas vencidas")).toBeInTheDocument();
    expect(
      screen.getByText("Reserva vencida: N° 29 Cachimbo para Juancho, venció el martes 22/09 (hace 1 día)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/N° 3 Tornillo para Maderera B, venció el sábado 19\/09 \(hace 4 días\)/)).toBeInTheDocument();
  });

  /* Revisión 23-09: el almacenero veía los botones y el servidor le respondía
     403 «Requires: admin, owner», en inglés. Ahora decide el MISMO array. */
  it.each(["almacenero", "cajero"])(
    "sin permiso no aparecen Liberar ni Extender (rol %s), y dice quién puede",
    (rol) => {
      R.rol = rol;
      montar([juancho]);
      expect(screen.getByText(/N° 29 Cachimbo para Juancho/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Liberar/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Extender/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Otra fecha" })).toBeNull();
      expect(screen.getByText(/lo hace el dueño o el administrador/)).toBeInTheDocument();
    },
  );

  it("con el rol todavía cargando no hay botones, pero tampoco afirma que falte permiso", () => {
    R.rol = null;
    montar([juancho]);
    expect(screen.queryByRole("button", { name: /Liberar/ })).toBeNull();
    expect(screen.queryByText(/lo hace el dueño o el administrador/)).toBeNull();
  });

  it.each(["admin", "owner", "manager"])("%s sí ve Liberar y Extender", (rol) => {
    R.rol = rol;
    montar([juancho]);
    expect(screen.getByRole("button", { name: "Liberar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extender al miércoles 30/09" })).toBeInTheDocument();
  });

  it("sin reservas no dibuja nada", () => {
    const { container } = render(<CtpReservasVencidas reservas={[]} onResuelta={vi.fn()} ahora={HOY} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CtpReservasVencidas — «Extender» a hoy + 7 en un clic", () => {
  it("manda `cambiar_apartado` con sólo el plazo y avisa qué quedó", async () => {
    const { onResuelta } = montar([juancho]);
    fireEvent.click(screen.getByRole("button", { name: "Extender al miércoles 30/09" }));

    await waitFor(() => expect(onResuelta).toHaveBeenCalledWith("ap-juancho"));
    expect(cuerpo()).toEqual({ action: "cambiar_apartado", apartadoId: "ap-juancho", hasta: "2026-09-30" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Reserva extendida: el paquete SL-7 sigue para Juancho hasta el miércoles 30/09.",
    );
  });

  it("«Otra fecha» deja elegir, y una fecha pasada apaga el botón", () => {
    montar([juancho]);
    fireEvent.click(screen.getByRole("button", { name: "Otra fecha" }));
    const campo = screen.getByLabelText(/Nueva fecha límite de la reserva de Juancho/);
    fireEvent.change(campo, { target: { value: "2026-10-05" } });
    expect(screen.getByRole("button", { name: "Extender al lunes 05/10" })).toBeEnabled();

    fireEvent.change(campo, { target: { value: "2026-09-20" } });
    expect(screen.getByRole("button", { name: "Extender" })).toBeDisabled();
    expect(screen.getByText("Elige una fecha de hoy en adelante.")).toBeInTheDocument();
  });
});

describe("CtpReservasVencidas — «Liberar»", () => {
  it("usa la misma `liberar_apartado` del modal, con el motivo para el historial", async () => {
    const { onResuelta } = montar([maderera]);
    fireEvent.click(screen.getByRole("button", { name: "Liberar" }));

    await waitFor(() => expect(onResuelta).toHaveBeenCalledWith("ap-b"));
    expect(cuerpo()).toEqual({
      action: "liberar_apartado",
      apartadoId: "ap-b",
      motivo: "Reserva vencida: liberada desde los avisos del libro.",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Reserva liberada: la corrida N° 3 de Maderera B vuelve a estar libre.",
    );
  });

  /* La tabla de Productos disponibles queda montada DETRÁS del modal: sin el
     aviso seguía mostrando la reserva liberada (medido en QA 23/09). */
  it("avisa a las pantallas montadas SÓLO cuando la escritura entró", async () => {
    const oyente = vi.fn();
    window.addEventListener(EVENTO_APARTADOS, oyente);
    try {
      const { onResuelta } = montar([maderera]);
      fireEvent.click(screen.getByRole("button", { name: "Liberar" }));
      await waitFor(() => expect(onResuelta).toHaveBeenCalled());
      expect(oyente).toHaveBeenCalledTimes(1);

      cleanup();
      fetchMock.mockResolvedValueOnce(falla("Esa reserva no existe."));
      montar([juancho]);
      fireEvent.click(screen.getByRole("button", { name: "Liberar" }));
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      expect(oyente).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(EVENTO_APARTADOS, oyente);
    }
  });

  it("si el servidor la rechaza, la fila queda con el motivo real y no se da por resuelta", async () => {
    fetchMock.mockResolvedValueOnce(falla("Esa reserva no existe."));
    const { onResuelta } = montar([maderera]);
    fireEvent.click(screen.getByRole("button", { name: "Liberar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo liberar: Esa reserva no existe."));
    expect(onResuelta).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
