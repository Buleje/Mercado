/**
 * La fila de «paquetes sin medidas» en la campana de avisos: «Poner medidas».
 *
 * Se fija lo que viaja al API (la MISMA `corregir_medidas_paquete` del editor de
 * escuadría de Productos disponibles), que el editor es el existente y abre con
 * las medidas que el paquete ya tiene, que un rechazo del servidor no se disfraza
 * de «listo», y quién ve el botón (mismo array del PATCH).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const R = vi.hoisted(() => ({ rol: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => R.rol }));

import CtpPaquetesSinMedidas from "@/components/admin/forestal/CtpPaquetesSinMedidas";
import { EVENTO_ESCUADRIAS } from "@/lib/forestal/escuadria-guardar";
import type { PaqueteSinMedidas } from "@/lib/forestal/paquetes-sin-medidas";

/** Miércoles 30/09/2026 al mediodía en Lima. */
const HOY = new Date("2026-09-30T12:00:00-05:00");

const sl7: PaqueteSinMedidas = {
  id: "pq-sl7",
  codigo: "SL-7",
  ctpEntryId: "c29",
  lineNo: 29,
  fecha: "2026-09-22",
  especie: "Cachimbo",
  producto: "MADERA ASERRADA (COMERCIAL)",
  cantidad: 12,
  volumenM3: 1.25,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
  periodoCerrado: false,
  faltan: ["espesor", "ancho", "largo"],
};
const sl8: PaqueteSinMedidas = {
  ...sl7,
  id: "pq-sl8",
  codigo: "SL-8",
  espesorCm: 5.08,
  anchoCm: 20.32,
  faltan: ["largo"],
};
const viejo: PaqueteSinMedidas = {
  ...sl7,
  id: "pq-55",
  codigo: "55",
  ctpEntryId: "c12",
  lineNo: 12,
  fecha: "2025-10-14",
  cantidad: 0,
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

function montar(paquetes: PaqueteSinMedidas[] = [sl7, sl8, viejo], total = paquetes.length) {
  return render(<CtpPaquetesSinMedidas paquetes={paquetes} total={total} ahora={HOY} />);
}
const cuerpo = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body));
const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe("CtpPaquetesSinMedidas — qué falta, por corrida", () => {
  it("dice cuántos son, agrupa por corrida con N.º y fecha, y nombra la medida que falta", () => {
    montar();
    expect(screen.getByText("3 paquetes sin medidas")).toBeInTheDocument();
    expect(screen.getByText("Corrida N.º 29 · martes 22/09")).toBeInTheDocument();
    /* Otro año: sin el año, «martes 14/10» no dice de cuál. */
    expect(screen.getByText("Corrida N.º 12 · martes 14/10/2025")).toBeInTheDocument();
    expect(screen.getAllByText("Faltan las tres medidas")).toHaveLength(2); // SL-7 y el «55» de 2025
    expect(screen.getByText("Falta el largo")).toBeInTheDocument();
    /* Los dos de la corrida 29 van bajo UN rótulo. */
    expect(screen.getAllByText(/Corrida N\.º 29/)).toHaveLength(1);
  });

  it("con el total mayor que lo listado, dice que está recortada", () => {
    montar([sl7], 240);
    expect(screen.getByText("240 paquetes sin medidas")).toBeInTheDocument();
    expect(screen.getByText(/Se muestran 1 de 240/)).toBeInTheDocument();
  });

  it("sin paquetes no dibuja nada", () => {
    const { container } = render(<CtpPaquetesSinMedidas paquetes={[]} total={0} ahora={HOY} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CtpPaquetesSinMedidas — quién ve «Poner medidas»", () => {
  it.each(["almacenero", "cajero"])("sin permiso no hay botón (rol %s), y dice quién puede", (rol) => {
    R.rol = rol;
    montar([sl7]);
    expect(screen.getByText("SL-7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Poner medidas/ })).toBeNull();
    expect(screen.getByText(/lo hace el dueño o el administrador/)).toBeInTheDocument();
  });

  it("con el rol todavía cargando no hay botón, pero tampoco afirma que falte permiso", () => {
    R.rol = null;
    montar([sl7]);
    expect(screen.queryByRole("button", { name: /Poner medidas/ })).toBeNull();
    expect(screen.queryByText(/lo hace el dueño o el administrador/)).toBeNull();
  });

  it.each(["admin", "owner", "manager"])("%s sí lo ve", (rol) => {
    R.rol = rol;
    montar([sl7]);
    expect(screen.getByRole("button", { name: "Poner medidas al paquete SL-7" })).toBeInTheDocument();
  });

  it("un paquete de un mes cerrado no ofrece un botón que el servidor rechazaría", () => {
    montar([{ ...sl7, periodoCerrado: true }, sl8]);
    expect(screen.queryByRole("button", { name: "Poner medidas al paquete SL-7" })).toBeNull();
    expect(screen.getByText(/Mes cerrado: reábrelo para medirlo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner medidas al paquete SL-8" })).toBeInTheDocument();
  });
});

describe("CtpPaquetesSinMedidas — «Poner medidas» abre el editor de escuadría que ya existe", () => {
  it("abre el editor de ESE paquete, con las medidas que ya tiene y las piezas si faltan", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Poner medidas al paquete SL-8" }));
    const dialogo = screen.getByRole("dialog", { name: /Escuadría del paquete SL-8/ });
    expect(within(dialogo).getByText(/Corrida N\.º 29/)).toBeInTheDocument();
    expect(campo("Espesor (pulg)").value).toBe("2");
    expect(campo("Ancho (pulg)").value).toBe("8");
    expect(campo("Largo (pies)").value).toBe("");
  });

  it("guarda por `corregir_medidas_paquete`, avisa a las pantallas montadas y deja el «listo»", async () => {
    const oyente = vi.fn();
    window.addEventListener(EVENTO_ESCUADRIAS, oyente);
    try {
      montar();
      fireEvent.click(screen.getByRole("button", { name: "Poner medidas al paquete SL-7" }));
      fireEvent.change(campo("Espesor (pulg)"), { target: { value: "2" } });
      fireEvent.change(campo("Ancho (pulg)"), { target: { value: "8" } });
      fireEvent.change(campo("Largo (pies)"), { target: { value: "5" } });
      fireEvent.click(screen.getByRole("button", { name: /guardar escuadría/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(cuerpo()).toEqual({
        id: "c29",
        action: "corregir_medidas_paquete",
        paqueteId: "pq-sl7",
        espesorCm: 5.08,
        anchoCm: 20.32,
        largoM: 1.52,
      });
      expect(oyente).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("Medidas puestas: el paquete SL-7 ya tiene su escuadría.");
    } finally {
      window.removeEventListener(EVENTO_ESCUADRIAS, oyente);
    }
  });

  it("si el servidor la rechaza, el editor sigue abierto con el motivo y no hay «listo»", async () => {
    const oyente = vi.fn();
    window.addEventListener(EVENTO_ESCUADRIAS, oyente);
    try {
      fetchMock.mockResolvedValueOnce(falla("El período setiembre 2026 está cerrado."));
      montar([sl7]);
      fireEvent.click(screen.getByRole("button", { name: "Poner medidas al paquete SL-7" }));
      fireEvent.change(campo("Espesor (pulg)"), { target: { value: "2" } });
      fireEvent.change(campo("Ancho (pulg)"), { target: { value: "8" } });
      fireEvent.change(campo("Largo (pies)"), { target: { value: "5" } });
      fireEvent.click(screen.getByRole("button", { name: /guardar escuadría/i }));

      await waitFor(() => expect(screen.getByText(/No se pudo guardar la escuadría: El período setiembre 2026 está cerrado\./)).toBeInTheDocument());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByRole("status")).toBeNull();
      expect(oyente).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(EVENTO_ESCUADRIAS, oyente);
    }
  });
});
