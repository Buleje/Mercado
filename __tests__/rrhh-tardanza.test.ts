/**
 * __tests__/rrhh-tardanza.test.ts
 *
 * ADR-417 — `tardanzaDe` es quien decide si una marca de asistencia llegó
 * tarde. El caso que da miedo no es el «llegó tarde», es el silencioso: un
 * puesto SIN hora de entrada tiene que devolver `null` (nadie fijó horario,
 * nadie puede juzgar), nunca `{ tarde: false }` — ese `false` se vería en la
 * hoja como «llegó a tiempo» y taparía a quien sí llegó tarde.
 *
 * Cada caso lleva su control negativo: el mismo dato que SÍ debe pasar, para
 * que una regla de más no se cuele sin que un test la note.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { tardanzaDe } from "@/lib/rrhh/asistencia";
import FilaMarcaDelDia from "@/components/admin/rrhh/asistencia/FilaMarcaDelDia";
import type { AsistenciaDTO, ColaboradorMinDTO } from "@/lib/rrhh/tipos";

describe("tardanzaDe — cuándo NO se puede juzgar", () => {
  it("sin horario del puesto devuelve null, aunque haya hora marcada", () => {
    expect(tardanzaDe("09:45", null, 10)).toBeNull();
    // Control: el mismo 09:45, ahora con horario, sí se juzga.
    expect(tardanzaDe("09:45", "07:30", 10)).toEqual({ tarde: true, minutos: 135 });
  });

  it("sin hora marcada devuelve null, aunque el puesto tenga horario", () => {
    expect(tardanzaDe(null, "07:30", 10)).toBeNull();
    expect(tardanzaDe("", "07:30", 10)).toBeNull();
  });

  it("sin nada de nada devuelve null", () => {
    expect(tardanzaDe(null, null, 10)).toBeNull();
  });

  it("una hora con formato inválido no se juzga: null, nunca un falso «a tiempo»", () => {
    expect(tardanzaDe("25:00", "07:30", 10)).toBeNull();
    expect(tardanzaDe("7:5", "07:30", 10)).toBeNull();
    expect(tardanzaDe("07:30", "07:3O", 10)).toBeNull(); // letra O, no cero
  });
});

describe("tardanzaDe — el límite de la tolerancia", () => {
  it("justo en el minuto de la tolerancia NO es tardanza (el último minuto también es de gracia)", () => {
    expect(tardanzaDe("07:40", "07:30", 10)).toEqual({ tarde: false, minutos: 10 });
  });

  it("un minuto después SÍ es tardanza, con los minutos exactos desde la hora del puesto", () => {
    expect(tardanzaDe("07:41", "07:30", 10)).toEqual({ tarde: true, minutos: 11 });
  });

  it("los minutos se cuentan desde la hora de entrada, no desde el fin de la tolerancia", () => {
    // Llegó 07:42 a un puesto de 07:30 con 10 de gracia: son 12 min tarde, no 2.
    expect(tardanzaDe("07:42", "07:30", 10)).toEqual({ tarde: true, minutos: 12 });
  });

  it("con tolerancia 0 el minuto siguiente ya es tardanza, y la hora exacta no", () => {
    expect(tardanzaDe("07:30", "07:30", 0)).toEqual({ tarde: false, minutos: 0 });
    expect(tardanzaDe("07:31", "07:30", 0)).toEqual({ tarde: true, minutos: 1 });
  });
});

describe("tardanzaDe — llegar antes", () => {
  it("entrar antes de la hora nunca es tardanza y los minutos salen negativos", () => {
    expect(tardanzaDe("07:22", "07:30", 10)).toEqual({ tarde: false, minutos: -8 });
    expect(tardanzaDe("06:00", "07:30", 0)).toEqual({ tarde: false, minutos: -90 });
  });

  it("un turno que cruza medianoche se deja pasar: no se marca tarde a quien llegó bien", () => {
    // Entra 23:00, marcó 00:10 del día siguiente: sin fecha no hay cómo saberlo.
    expect(tardanzaDe("00:10", "23:00", 10)).toEqual({ tarde: false, minutos: -1370 });
  });
});

describe("tardanzaDe — tolerancias raras", () => {
  it("una tolerancia negativa o NaN se trata como 0, no rompe ni perdona de más", () => {
    expect(tardanzaDe("07:31", "07:30", -5)).toEqual({ tarde: true, minutos: 1 });
    expect(tardanzaDe("07:31", "07:30", Number.NaN)).toEqual({ tarde: true, minutos: 1 });
    expect(tardanzaDe("07:30", "07:30", Number.NaN)).toEqual({ tarde: false, minutos: 0 });
  });

  it("una tolerancia con decimales se trunca hacia abajo (10.9 son 10 minutos de gracia)", () => {
    expect(tardanzaDe("07:41", "07:30", 10.9)).toEqual({ tarde: true, minutos: 11 });
    expect(tardanzaDe("07:40", "07:30", 10.9)).toEqual({ tarde: false, minutos: 10 });
  });
});

// ── La fila, que es donde el encargado lo vive ───────────────────────────────
//
// La regla pura de arriba puede estar perfecta y la hoja seguir rota: el bug
// caro es el de la ACEPTACIÓN. El buffer de `use-rrhh-asistencia` reemplaza lo
// pendiente de la celda en vez de mezclarlo, así que aceptar la sugerencia
// mandando sólo el estado guardaría la tardanza SIN la hora que la delató.
// (`createElement` en vez de JSX porque este archivo es `.ts`.)

type PropsFila = ComponentProps<typeof FilaMarcaDelDia>;

const PERSONA: ColaboradorMinDTO = {
  id: "c1",
  nombre: "Victor Quispe",
  apodo: null,
  puesto: { id: "p1", nombre: "Motosierrista" },
  estado: "ACTIVO",
  fechaIngreso: null,
  fechaCese: null,
};

const HORARIO = { horaEntrada: "07:30", toleranciaMin: 10 };

const marcaDe = (over: Partial<AsistenciaDTO>): AsistenciaDTO => ({
  id: "a1",
  colaboradorId: "c1",
  fecha: "2026-09-15",
  estado: "PRESENTE",
  entrada: null,
  salida: null,
  refrigerioMin: 0,
  horas: null,
  nota: null,
  origen: "manual",
  marcadoPor: "qaadmin",
  marcadoEn: "2026-09-15T12:00:00.000Z",
  ...over,
});

function pintarFila(over: Partial<PropsFila> = {}) {
  const onMarcar = vi.fn();
  const props: PropsFila = {
    colaborador: PERSONA,
    fecha: "2026-09-15",
    marca: marcaDe({ entrada: "07:42" }),
    pendiente: false,
    errorMsg: undefined,
    horario: HORARIO,
    onMarcar,
    onVerHistorial: () => {},
    ...over,
  };
  render(createElement(FilaMarcaDelDia, props));
  return { onMarcar };
}

afterEach(cleanup);

describe("FilaMarcaDelDia — la tardanza sugerida", () => {
  it("con la hora pasada de la tolerancia dice cuánto tarde llegó y ofrece aceptarlo", () => {
    pintarFila();
    expect(screen.getByText(/Llegó 12 min tarde/)).toBeTruthy();
    expect(screen.getByText(/Entra 07:30 · 10 min de tolerancia/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar tardanza" })).toBeTruthy();
  });

  it("aceptar la sugerencia guarda la TARDANZA SIN perder la hora que la delató", () => {
    const { onMarcar } = pintarFila({ marca: marcaDe({ entrada: "07:42", salida: "17:00", nota: "se le malogró la moto" }) });
    fireEvent.click(screen.getByRole("button", { name: "Marcar tardanza" }));
    expect(onMarcar).toHaveBeenCalledWith({ estado: "TARDANZA", entrada: "07:42", salida: "17:00", nota: "se le malogró la moto" });
  });

  it("si ya está en TARDANZA sólo informa: no vuelve a ofrecer el cambio", () => {
    pintarFila({ marca: marcaDe({ estado: "TARDANZA", entrada: "07:42" }) });
    expect(screen.getByText(/Llegó 12 min tarde/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar tardanza" })).toBeNull();
  });

  it("con otro estado elegido a mano (medio día) informa, pero no toca la marca", () => {
    pintarFila({ marca: marcaDe({ estado: "MEDIO_DIA", entrada: "07:42" }) });
    expect(screen.getByText(/Llegó 12 min tarde/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar tardanza" })).toBeNull();
  });

  it("fuera de la ventana de corrección informa pero no deja aceptar nada", () => {
    pintarFila({ soloLectura: true });
    expect(screen.getByText(/Llegó 12 min tarde/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar tardanza" })).toBeNull();
  });

  it("dentro de la tolerancia dice que llegó a tiempo, sin sugerir nada", () => {
    pintarFila({ marca: marcaDe({ entrada: "07:38" }) });
    expect(screen.getByText(/Llegó a tiempo para las 07:30/)).toBeTruthy();
    expect(screen.queryByText(/tarde/)).toBeNull();
  });

  it("un puesto sin horario no dice nada de tardanza: se sigue marcando a mano", () => {
    pintarFila({ horario: null });
    expect(screen.queryByText(/tarde/)).toBeNull();
    expect(screen.queryByText(/a tiempo/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar tardanza" })).toBeNull();
  });
});
