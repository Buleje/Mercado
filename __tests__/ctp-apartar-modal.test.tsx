/**
 * Apartar madera — lo que tiene que ser cierto sí o sí.
 *
 * El agujero que esto tapa está medido en el libro real de Blas: 9 de 14
 * corridas salieron del stock por «marcar como usado», sin guía y sin cliente.
 * Apartar es el estado que faltaba entre tildar los paquetes y emitir la GTF,
 * así que las tres cosas que no pueden fallar son:
 *
 *   1. Que diga la verdad de lo que se aparta (plural incluido: «1 paquete»).
 *   2. Que NUNCA reporte «listo» si una fila rebotó — y que diga cuál y por qué.
 *   3. Que una reserva vencida se vea como lo que es: stock congelado por error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/* El rol de quien abre el modal: admin salvo en el test de permisos. */
const R = vi.hoisted(() => ({ rol: "admin" as string | null }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => R.rol }));

import CtpApartarModal from "@/components/admin/forestal/CtpApartarModal";
import { CeldaApartado, plazoDeApartado } from "@/components/admin/forestal/ctp-celda-apartado";

/** 15/09/2026 a las 12:00 UTC = 07:00 en Lima: el mismo día, sin off-by-one. */
const HOY = new Date("2026-09-15T12:00:00.000Z");

const fila = (n: number, conPaquete = true) => ({
  ctpEntryId: `corrida-${n}`,
  paqueteId: conPaquete ? `pq-${n}` : null,
  etiqueta: conPaquete ? `PQ-2609-00${n}` : `Corrida N° ${n}`,
  volumenM3: 4.16,
  piezas: 80,
});

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const falla = (message: string) => new Response(JSON.stringify({ message }), { status: 409 });

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

function abrir(props: Partial<React.ComponentProps<typeof CtpApartarModal>> = {}) {
  const onCerrar = vi.fn();
  const onListo = vi.fn();
  render(
    <CtpApartarModal
      abierto
      onCerrar={onCerrar}
      filas={[fila(1)]}
      onListo={onListo}
      ahora={HOY}
      {...props}
    />,
  );
  return { onCerrar, onListo };
}

const campoPara = () => screen.getByLabelText(/Para quién/i);
const botonApartar = () => screen.getByRole("button", { name: /^Apartar/i });

describe("CtpApartarModal — dice qué se aparta", () => {
  it("una sola fila se lee «1 paquete», nunca «1 paquetes»", () => {
    abrir();
    expect(screen.getByText(/1 paquete · 4\.160 m³ · 80 piezas/)).toBeInTheDocument();
  });

  it("tres filas suman volumen y piezas de verdad", () => {
    abrir({ filas: [fila(1), fila(2), fila(3)] });
    // 3 × 4.16 = 12.48 m³ y 3 × 80 = 240 piezas.
    expect(screen.getByText(/3 paquetes · 12\.480 m³ · 240 piezas/)).toBeInTheDocument();
  });

  it("una corrida sin paquete no se llama «paquete»", () => {
    abrir({ filas: [fila(7, false)] });
    expect(screen.getByText(/^1 corrida · /)).toBeInTheDocument();
  });
});

describe("CtpApartarModal — para quién y hasta cuándo", () => {
  it("sin destinatario no se puede apartar", () => {
    abrir();
    expect(botonApartar()).toBeDisabled();
    fireEvent.change(campoPara(), { target: { value: "Maderera Ucayali" } });
    expect(botonApartar()).not.toBeDisabled();
  });

  it("el atajo «1 semana» pone la fecha siete días después de hoy", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /1 semana/i }));
    expect(screen.getByLabelText(/Hasta/i)).toHaveValue("2026-09-22");
    expect(screen.getByText(/Vence el martes 22\/09/)).toBeInTheDocument();
  });

  it("una fecha pasada se rechaza con el motivo y bloquea el guardado", () => {
    abrir();
    fireEvent.change(campoPara(), { target: { value: "Maderera Ucayali" } });
    fireEvent.change(screen.getByLabelText(/Hasta/i), { target: { value: "2026-09-10" } });
    expect(screen.getByText(/Esa fecha ya pasó/)).toBeInTheDocument();
    expect(botonApartar()).toBeDisabled();
  });

  it("manda al API lo que se escribió, una llamada por fila", async () => {
    const { onCerrar, onListo } = abrir({ filas: [fila(1), fila(2)] });
    fireEvent.change(campoPara(), { target: { value: "  Maderera Ucayali  " } });
    fireEvent.click(screen.getByRole("button", { name: /3 días/i }));
    fireEvent.click(botonApartar());

    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Un solo argumento: el resumen que la tabla muestra arriba.
    expect(onListo).toHaveBeenCalledWith(
      "2 paquetes apartados para Maderera Ucayali, hasta el viernes 18/09.",
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/forestal/ctp");
    // PATCH: las dos acciones viven en el handler PATCH del route, con `marcar_usado`.
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      action: "apartar_producto",
      ctpEntryId: "corrida-1",
      paqueteId: "pq-1",
      para: "Maderera Ucayali",
      hasta: "2026-09-18",
      nota: null,
    });
  });
});

describe("CtpApartarModal — 2 de 3 no es «listo»", () => {
  it("nombra la fila que rebotó, no se cierra y NO reporta éxito", async () => {
    fetchMock
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(falla("PQ-2609-002 ya está apartado para Maderera Shambo."))
      .mockResolvedValueOnce(ok());
    const { onCerrar, onListo } = abrir({ filas: [fila(1), fila(2), fila(3)] });
    fireEvent.change(campoPara(), { target: { value: "Maderera Ucayali" } });
    fireEvent.click(botonApartar());

    await waitFor(() => expect(screen.getByText(/1 fila quedó sin apartar/)).toBeInTheDocument());
    expect(screen.getByText(/ya está apartado para Maderera Shambo/)).toBeInTheDocument();
    expect(screen.getByText(/Se apartaron 2 de 3; 1 quedó afuera/)).toBeInTheDocument();
    // Falló una: ni se cierra ni se canta «listo» mientras se ve el detalle.
    expect(onListo).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();

    // Al cerrar sí hay que avisar: 2 filas YA cambiaron y la tabla no puede
    // quedarse con la foto vieja. El mensaje dice 2 de 3, no «listo».
    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/i }));
    expect(onListo).toHaveBeenCalledWith(
      "Se apartaron 2 de 3 para Maderera Ucayali; el resto quedó como estaba.",
    );
    expect(onCerrar).toHaveBeenCalled();
  });

  it("si NINGUNA entra, al cerrar no se avisa nada", async () => {
    fetchMock.mockResolvedValue(falla("La corrida está anulada."));
    const { onCerrar, onListo } = abrir({ filas: [fila(1)] });
    fireEvent.change(campoPara(), { target: { value: "Maderera Ucayali" } });
    fireEvent.click(botonApartar());

    await waitFor(() =>
      expect(screen.getByText(/No se apartó ninguna de las 1/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/i }));
    expect(onListo).not.toHaveBeenCalled();
    expect(onCerrar).toHaveBeenCalled();
  });
});

describe("CtpApartarModal — los destinatarios ya usados se ofrecen", () => {
  it("«Maderera Ucayali» y «MADERERA UCAYALI» no se escriben dos veces: el campo trae la lista", () => {
    abrir({ destinatariosConocidos: ["Maderera Ucayali S.A.C.", "Aserradero El Roble"] });
    expect(campoPara()).toHaveAttribute("list", "apartar-destinatarios");
    expect(screen.getByText(/Elige uno de la lista para no duplicar/)).toBeInTheDocument();
    const opciones = document.querySelectorAll("#apartar-destinatarios option");
    expect([...opciones].map((o) => o.getAttribute("value"))).toEqual([
      "Maderera Ucayali S.A.C.",
      "Aserradero El Roble",
    ]);
  });

  it("sin lista, el campo sigue siendo texto libre y lo dice", () => {
    abrir();
    expect(campoPara()).not.toHaveAttribute("list");
    expect(
      screen.getByText(/todavía no está enlazado al directorio de clientes/),
    ).toBeInTheDocument();
  });
});

describe("CtpApartarModal — un apartado vivo se puede cambiar o liberar", () => {
  const apartadoActual = {
    id: "ap-1",
    para: "Maderera Shambo",
    hasta: "2026-09-12",
    nota: "adelantó el 50 %",
    creadoAt: "2026-09-08",
  };

  it("dice quién la tiene, desde cuándo, y que el plazo ya venció", () => {
    abrir({ apartadoActual });
    expect(screen.getByText(/Maderera Shambo/)).toBeInTheDocument();
    expect(screen.getByText(/desde el martes 08\/09/)).toBeInTheDocument();
    expect(screen.getByText(/venció hace 3 días/)).toBeInTheDocument();
  });

  it("liberar manda el motivo y recién ahí cierra", async () => {
    const { onCerrar, onListo } = abrir({ apartadoActual });
    fireEvent.change(screen.getByLabelText(/Motivo de la liberación/i), {
      target: { value: "el cliente no vino" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Liberar apartado/i }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(onListo).toHaveBeenCalledWith(
      "Apartado liberado: la madera de Maderera Shambo vuelve a estar libre.",
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      action: "liberar_apartado",
      apartadoId: "ap-1",
      motivo: "el cliente no vino",
    });
  });

  /* Hasta el 2026-09-23 esto mandaba `apartar_producto` otra vez y el servidor
     contestaba 422 «ya está apartada»: editar una reserva nunca funcionó. */
  it("«Guardar cambios» cambia la MISMA reserva, no intenta apartar la fila de nuevo", async () => {
    const { onCerrar, onListo } = abrir({ apartadoActual });
    fireEvent.change(screen.getByLabelText(/Hasta/i), { target: { value: "2026-09-22" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      action: "cambiar_apartado",
      apartadoId: "ap-1",
      para: "Maderera Shambo",
      hasta: "2026-09-22",
      nota: "adelantó el 50 %",
    });
    expect(onListo).toHaveBeenCalledWith(
      "Apartado actualizado: ahora es de Maderera Shambo, hasta el martes 22/09.",
    );
  });

  /* Revisión 23-09: el PATCH sólo deja a admin/dueño; el almacenero abre la
     reserva desde la tabla para VERLA, no para chocar con un 403. */
  it("sin permiso: se lee la reserva, pero no hay «Guardar cambios» ni «Liberar» y los campos no se tocan", () => {
    R.rol = "almacenero";
    abrir({ apartadoActual });
    expect(screen.getByText(/Maderera Shambo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar cambios/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Liberar apartado/i })).toBeNull();
    expect(campoPara()).toBeDisabled();
    expect(screen.getByText(/lo hace el dueño o el administrador/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza la liberación, el modal se queda abierto con el motivo real", async () => {
    fetchMock.mockResolvedValueOnce(falla("El mes ya está cerrado."));
    const { onCerrar } = abrir({ apartadoActual });
    fireEvent.click(screen.getByRole("button", { name: /Liberar apartado/i }));

    await waitFor(() =>
      expect(screen.getByText(/No se pudo liberar: El mes ya está cerrado/)).toBeInTheDocument(),
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe("CeldaApartado — la reserva vencida es stock congelado", () => {
  it("sin apartado ofrece la puerta", () => {
    render(<CeldaApartado apartado={null} onAbrir={() => {}} ahora={HOY} />);
    expect(screen.getByRole("button", { name: /Apartar/i })).toBeInTheDocument();
  });

  it("pegada al código (sin puerta) no dibuja nada cuando la fila está libre", () => {
    const { container } = render(
      <CeldaApartado apartado={null} onAbrir={() => {}} ahora={HOY} mostrarVacio={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("vencida: lo dice con los días y en tono de peligro", () => {
    render(
      <CeldaApartado
        apartado={{ id: "a", para: "Maderera X", hasta: "2026-09-12", nota: null }}
        onAbrir={() => {}}
        ahora={HOY}
      />,
    );
    const boton = screen.getByRole("button");
    expect(boton).toHaveTextContent("Apartado: Maderera X");
    expect(boton).toHaveTextContent("venció hace 3 días");
    expect(boton.className).toContain("--data-error-500");
  });

  it("vigente y sin plazo se leen tranquilas", () => {
    expect(plazoDeApartado("2026-09-30", HOY)).toMatchObject({
      estado: "vigente",
      texto: "hasta 30/09",
    });
    expect(plazoDeApartado(null, HOY)).toMatchObject({ estado: "sin-plazo", dias: null });
    expect(plazoDeApartado("2026-09-15", HOY)).toMatchObject({
      estado: "vence-hoy",
      texto: "vence hoy",
    });
    expect(plazoDeApartado("2026-09-16", HOY)).toMatchObject({
      estado: "por-vencer",
      texto: "vence mañana",
    });
    // Un solo día de atraso no dice «1 días».
    expect(plazoDeApartado("2026-09-14", HOY).texto).toBe("venció hace 1 día");
  });
});
