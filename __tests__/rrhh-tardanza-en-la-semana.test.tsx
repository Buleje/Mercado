/**
 * __tests__/rrhh-tardanza-en-la-semana.test.tsx
 *
 * ADR-417 — la tardanza sugerida, ahora en la hoja de la SEMANA (ADR-416), que
 * es donde se revisa y de donde sale el PDF con firma. Una tardanza que sólo se
 * ve el martes en la hoja del día no la encuentra nadie el viernes.
 *
 * Dos cosas se prueban acá, y las dos por el camino del encargado:
 *
 * 1. La celda de la semana mide 32 px: el aviso entra como un punto que NO
 *    empuja la grilla, y lo que dice el color se dice también en palabras (el
 *    nombre accesible del cuadrito) — un punto de color solo no comunica nada.
 * 2. Aceptar la tardanza desde la celda manda la marca COMPLETA. El buffer de
 *    `use-rrhh-asistencia` REEMPLAZA lo pendiente de la celda: mandar sólo el
 *    estado guardaría la tardanza sin la hora de entrada que la delató. Por eso
 *    la afirmación es sobre el objeto entero, no sobre el estado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import HojaDeLaSemana from "@/components/admin/rrhh/asistencia/HojaDeLaSemana";
import HojaDelMes from "@/components/admin/rrhh/asistencia/HojaDelMes";
import { horariosPorColaborador, marcaConTardanza, resumenTardanzas, tardanzasSinMarcar } from "@/components/admin/rrhh/asistencia/semana";
import type { AsistenciaDTO, ColaboradorMinDTO, HojaAsistenciaDTO, PuestoDTO } from "@/lib/rrhh/tipos";

// ── Fixtures ────────────────────────────────────────────────────────────────

const LUNES = "2026-09-14";
const HOY = "2026-09-18"; // viernes: la semana se revisa con días ya pasados

const PUESTO_CON_HORARIO: PuestoDTO = {
  id: "p1",
  nombre: "Motosierrista",
  descripcion: null,
  horasJornada: 8,
  horaEntrada: "07:30",
  toleranciaMin: 10,
  orden: 1,
  personas: 1,
};
/** El puesto que nadie horarió: su gente no se juzga (ADR-417). */
const PUESTO_SIN_HORARIO: PuestoDTO = { ...PUESTO_CON_HORARIO, id: "p2", nombre: "Ayudante", horaEntrada: null, orden: 2 };

const VICTOR: ColaboradorMinDTO = {
  id: "c1",
  nombre: "Victor Quispe",
  apodo: null,
  puesto: { id: "p1", nombre: "Motosierrista" },
  estado: "ACTIVO",
  fechaIngreso: null,
  fechaCese: null,
};
const ANA: ColaboradorMinDTO = { ...VICTOR, id: "c2", nombre: "Ana Ríos", puesto: { id: "p2", nombre: "Ayudante" } };

const marcaDe = (over: Partial<AsistenciaDTO> & { colaboradorId: string; fecha: string }): AsistenciaDTO => ({
  id: `${over.colaboradorId}-${over.fecha}`,
  estado: "PRESENTE",
  entrada: null,
  salida: null,
  refrigerioMin: 0,
  horas: null,
  nota: null,
  origen: "manual",
  marcadoPor: "qaadmin",
  marcadoEn: "2026-09-18T12:00:00.000Z",
  ...over,
});

const MARCAS: AsistenciaDTO[] = [
  // Martes: presente, pero entró 07:42 con 07:30 y 10 de gracia → 12 min tarde.
  marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", entrada: "07:42", salida: "17:00", nota: "se le malogró la moto" }),
  // Miércoles: 07:35, dentro de la tolerancia.
  marcaDe({ colaboradorId: "c1", fecha: "2026-09-16", entrada: "07:35" }),
  // Jueves: ya está en TARDANZA, no queda nada por confirmar.
  marcaDe({ colaboradorId: "c1", fecha: "2026-09-17", estado: "TARDANZA", entrada: "08:00" }),
  // Ana entró 09:00, pero su puesto no tiene hora: nadie puede juzgarle la llegada.
  marcaDe({ colaboradorId: "c2", fecha: "2026-09-15", entrada: "09:00" }),
];

const hojaDe = (over: Partial<HojaAsistenciaDTO> = {}): HojaAsistenciaDTO => ({
  nivel: "gestion",
  hoy: HOY,
  desde: LUNES,
  hasta: "2026-09-20",
  ventana: { desde: null, hasta: HOY },
  colaboradores: [ANA, VICTOR],
  marcas: MARCAS,
  ...over,
});

// ── Las reglas puras ────────────────────────────────────────────────────────

const HORARIOS = horariosPorColaborador([PUESTO_CON_HORARIO, PUESTO_SIN_HORARIO], [VICTOR, ANA]);
const siempre = () => true;

describe("horariosPorColaborador", () => {
  it("resuelve el horario por el puesto y deja afuera a quien no tiene con qué juzgarse", () => {
    expect(HORARIOS.get("c1")).toEqual({ horaEntrada: "07:30", toleranciaMin: 10 });
    // Puesto sin hora de entrada y persona sin puesto: fuera del mapa, no un horario inventado.
    expect(HORARIOS.get("c2")).toBeUndefined();
    const sinPuesto = horariosPorColaborador([PUESTO_CON_HORARIO], [{ ...VICTOR, puesto: null }]);
    expect(sinPuesto.size).toBe(0);
  });

  it("sin catálogo de puestos nadie queda con tardanza sugerida (la semana se marca a mano, como antes)", () => {
    expect(horariosPorColaborador([], [VICTOR, ANA]).size).toBe(0);
    expect(tardanzasSinMarcar(MARCAS, horariosPorColaborador([], [VICTOR]), siempre)).toEqual([]);
  });
});

describe("tardanzasSinMarcar", () => {
  it("cuenta el PRESENTE que llegó pasado de la tolerancia, y sólo ese", () => {
    expect(tardanzasSinMarcar(MARCAS, HORARIOS, siempre)).toEqual([{ colaboradorId: "c1", fecha: "2026-09-15" }]);
  });

  it("lo ya marcado como TARDANZA no vuelve a pedir nada", () => {
    const yaMarcada = [marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", estado: "TARDANZA", entrada: "07:42" })];
    expect(tardanzasSinMarcar(yaMarcada, HORARIOS, siempre)).toEqual([]);
    // Control: la misma hora en PRESENTE sí se cuenta.
    expect(tardanzasSinMarcar([marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", entrada: "07:42" })], HORARIOS, siempre)).toHaveLength(1);
  });

  it("un estado puesto a mano (medio día) se respeta: informa, no entra a la cuenta", () => {
    const medioDia = [marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", estado: "MEDIO_DIA", entrada: "07:42" })];
    expect(tardanzasSinMarcar(medioDia, HORARIOS, siempre)).toEqual([]);
  });

  it("lo que el rol no puede corregir no se cuenta: un aviso sin acción posible enseña a ignorar la banda", () => {
    const soloDesdeElJueves = (f: string) => f >= "2026-09-17";
    expect(tardanzasSinMarcar(MARCAS, HORARIOS, soloDesdeElJueves)).toEqual([]);
  });

  it("sale ordenado por fecha, para que el resumen nombre los días en orden", () => {
    const desordenadas = [
      marcaDe({ colaboradorId: "c1", fecha: "2026-09-17", entrada: "09:00" }),
      marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", entrada: "09:00" }),
    ];
    expect(tardanzasSinMarcar(desordenadas, HORARIOS, siempre).map((t) => t.fecha)).toEqual(["2026-09-15", "2026-09-17"]);
  });
});

describe("resumenTardanzas", () => {
  const nombreDe = (id: string) => (id === "c1" ? "Victor Quispe" : "Ana Ríos");

  it("dice quién y qué día, no sólo cuántos", () => {
    const texto = resumenTardanzas([{ colaboradorId: "c1", fecha: "2026-09-15" }], nombreDe);
    expect(texto).toBe("Victor Quispe (Mar 15)");
  });

  it("con más de tres corta y cuenta el resto", () => {
    const lista = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"].map((fecha) => ({ colaboradorId: "c1", fecha }));
    expect(resumenTardanzas(lista, nombreDe)).toBe("Victor Quispe (Lun 14), Victor Quispe (Mar 15), Victor Quispe (Mié 16) y 2 más");
  });
});

describe("marcaConTardanza", () => {
  it("manda la marca ENTERA: el buffer del hook reemplaza la celda, no la mezcla", () => {
    const completa = marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", entrada: "07:42", salida: "17:00", nota: "se le malogró la moto" });
    expect(marcaConTardanza(completa, "c1", "2026-09-15")).toEqual({
      colaboradorId: "c1",
      fecha: "2026-09-15",
      estado: "TARDANZA",
      entrada: "07:42",
      salida: "17:00",
      nota: "se le malogró la moto",
    });
  });

  it("sin marca previa los campos van en null explícito, no undefined (el servidor lee `?? null`)", () => {
    expect(marcaConTardanza(undefined, "c1", "2026-09-15")).toEqual({ colaboradorId: "c1", fecha: "2026-09-15", estado: "TARDANZA", entrada: null, salida: null, nota: null });
  });
});

// ── La hoja de la semana, que es donde el encargado lo vive ──────────────────

const mocks = vi.hoisted(() => ({
  hoja: null as HojaAsistenciaDTO | null,
  puestos: [] as PuestoDTO[],
  ganado: null as unknown,
  marcar: vi.fn(),
}));

vi.mock("@/hooks/use-rrhh-asistencia", () => ({
  useRrhhAsistencia: () => ({
    hoja: mocks.hoja,
    loading: false,
    error: null,
    guardando: false,
    pendientes: new Set<string>(),
    erroresPorCelda: new Map<string, string>(),
    marcar: mocks.marcar,
    guardarAhora: vi.fn(async () => ({ ok: true, fallos: [] })),
    masivo: vi.fn(),
    recargar: vi.fn(),
  }),
  avisarFallos: vi.fn(),
}));
vi.mock("@/hooks/use-rrhh-ganado", () => ({
  useRrhhGanado: () => ({ ganado: mocks.ganado, loading: false, error: null, recargar: vi.fn() }),
}));
vi.mock("@/hooks/use-rrhh-puestos", () => ({
  useRrhhPuestos: () => ({ puestos: mocks.puestos, loading: false, error: null, recargar: vi.fn(), crear: vi.fn(), actualizar: vi.fn(), eliminar: vi.fn() }),
}));
// El historial es de otro archivo y abre su propio modal: acá sólo estorba.
vi.mock("@/components/admin/rrhh/asistencia/HistorialMarcaModal", () => ({ default: () => null }));

function pintarSemana(hoja: HojaAsistenciaDTO = hojaDe(), puestos: PuestoDTO[] = [PUESTO_CON_HORARIO, PUESTO_SIN_HORARIO]) {
  mocks.hoja = hoja;
  mocks.puestos = puestos;
  mocks.ganado = null;
  return render(<HojaDeLaSemana desde={LUNES} onCambiarSemana={() => {}} nivel="gestion" />);
}

/**
 * El cuadrito de un día en la TABLA de la semana, buscado por su nombre
 * accesible. Se acota a la tabla porque bajo 640 px la misma semana se pinta
 * otra vez en el calendario por persona (`MesPorPersona`), y en jsdom las dos
 * están en el DOM: sin acotar, la persona que abre el calendario aparece dos
 * veces.
 */
const celdaDe = (nombre: RegExp) => within(screen.getByRole("table")).getByRole("button", { name: nombre });

beforeEach(() => {
  mocks.marcar.mockClear();
  mocks.ganado = null;
});
afterEach(cleanup);

describe("HojaDeLaSemana — la tardanza en la celda", () => {
  it("el punto de aviso se enciende sólo en el día que quedó presente y tarde", () => {
    const { container } = pintarSemana();
    // Uno solo: ni el miércoles a tiempo, ni el jueves ya en TARDANZA, ni Ana sin horario.
    expect(container.querySelectorAll("[data-aviso-tardanza]")).toHaveLength(1);
  });

  it("lo que dice el color lo dice también el nombre accesible del cuadrito", () => {
    pintarSemana();
    expect(celdaDe(/Victor Quispe, 2026-09-15: Presente · llegó 12 min tarde, tardanza sin marcar/)).toBeInTheDocument();
  });

  it("al abrir la celda se ve el detalle completo y el botón para confirmarla", () => {
    pintarSemana();
    fireEvent.click(celdaDe(/2026-09-15: Presente · llegó 12 min tarde/));
    const panel = screen.getByRole("dialog", { name: /Victor Quispe/ });
    expect(within(panel).getByText(/Llegó 12 min tarde/)).toBeInTheDocument();
    expect(within(panel).getByText(/Entra 07:30 · 10 min de tolerancia/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Marcar tardanza" })).toBeInTheDocument();
  });

  it("aceptarla guarda la TARDANZA SIN perder la hora, la salida ni la nota", () => {
    pintarSemana();
    fireEvent.click(celdaDe(/2026-09-15: Presente · llegó 12 min tarde/));
    fireEvent.click(screen.getByRole("button", { name: "Marcar tardanza" }));
    expect(mocks.marcar).toHaveBeenCalledWith({
      colaboradorId: "c1",
      fecha: "2026-09-15",
      estado: "TARDANZA",
      entrada: "07:42",
      salida: "17:00",
      nota: "se le malogró la moto",
    });
    // Y el panel se cierra solo: la celda ya quedó resuelta.
    expect(screen.queryByRole("button", { name: "Marcar tardanza" })).toBeNull();
  });

  it("el día que llegó a tiempo lo dice, sin punto ni botón", () => {
    pintarSemana();
    fireEvent.click(celdaDe(/Victor Quispe, 2026-09-16: Presente$/));
    const panel = screen.getByRole("dialog", { name: /Victor Quispe/ });
    expect(within(panel).getByText(/Llegó a tiempo para las 07:30/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Marcar tardanza" })).toBeNull();
  });

  it("un puesto sin hora de entrada no juzga a nadie, aunque haya entrado 09:00", () => {
    pintarSemana();
    const celda = celdaDe(/Ana Ríos, 2026-09-15: Presente$/);
    expect(celda).toBeInTheDocument();
    fireEvent.click(celda);
    expect(screen.queryByText(/min tarde/)).toBeNull();
    expect(screen.queryByText(/a tiempo/)).toBeNull();
  });

  it("fuera de la ventana de corrección informa, pero no enciende el punto ni ofrece el cambio", () => {
    const { container } = pintarSemana(hojaDe({ ventana: { desde: "2026-09-17", hasta: HOY } }));
    expect(container.querySelectorAll("[data-aviso-tardanza]")).toHaveLength(0);
    expect(celdaDe(/Victor Quispe, 2026-09-15: Presente · llegó 12 min tarde —/)).toBeInTheDocument();
    expect(screen.queryByText(/figura presente con la hora de entrada/)).toBeNull();
  });
});

describe("HojaDeLaSemana — la banda de la semana", () => {
  it("nombra a quién y qué día hay que confirmar antes de firmar", () => {
    pintarSemana();
    expect(screen.getByText(/1 día figura presente con la hora de entrada pasada de la tolerancia del puesto/)).toBeInTheDocument();
    expect(screen.getByText(/Victor Quispe \(Mar 15\)/)).toBeInTheDocument();
  });

  it("sin tardanzas pendientes no hay banda: ni «todo al día» ni un lugar que se aprende a ignorar", () => {
    pintarSemana(hojaDe({ marcas: [marcaDe({ colaboradorId: "c1", fecha: "2026-09-15", entrada: "07:35" })] }));
    expect(screen.queryByText(/pasada de la tolerancia/)).toBeNull();
  });
});

// ── El celular, que es donde Brandon revisa ─────────────────────────────────
//
// Bajo 640 px la semana NO es la tabla: es `MesPorPersona` (calendario de una
// persona a la vez). Una tardanza cableada sólo en la tabla es media función.

const calendario = () => screen.getByRole("region", { name: "Hoja del mes por persona" });

/** El calendario arranca en la primera persona de la lista; se cambia por el select. */
function elegirEnElCalendario(nombreDeLaPersona: string) {
  const select = within(calendario()).getByLabelText("Persona");
  fireEvent.change(select, { target: { value: nombreDeLaPersona } });
}

describe("La semana en el celular", () => {
  it("el punto de aviso aparece en el calendario, y más grande que en la tabla (celda de 36 px)", () => {
    pintarSemana();
    elegirEnElCalendario("c1");
    const punto = calendario().querySelector("[data-aviso-tardanza]");
    expect(punto).not.toBeNull();
    expect(punto?.getAttribute("class")).toContain("h-2.5");
  });

  it("confirmar la tardanza desde el calendario manda la marca COMPLETA", () => {
    pintarSemana();
    elegirEnElCalendario("c1");
    fireEvent.click(within(calendario()).getByRole("button", { name: /2026-09-15: Presente · llegó 12 min tarde/ }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar tardanza" }));
    expect(mocks.marcar).toHaveBeenCalledWith({
      colaboradorId: "c1",
      fecha: "2026-09-15",
      estado: "TARDANZA",
      entrada: "07:42",
      salida: "17:00",
      nota: "se le malogró la moto",
    });
  });

  it("lo que se toca con el dedo mide 44 px: el botón del panel, no el punto", () => {
    pintarSemana();
    elegirEnElCalendario("c1");
    fireEvent.click(within(calendario()).getByRole("button", { name: /llegó 12 min tarde/ }));
    const boton = screen.getByRole("button", { name: "Marcar tardanza" });
    expect(boton.getAttribute("class")).toContain("h-11");
    // El punto es decorativo: no se toca ni se lee dos veces.
    expect(calendario().querySelector("[data-aviso-tardanza]")?.getAttribute("aria-hidden")).toBe("true");
  });
});

// ── La hoja del mes: el mismo cableado ──────────────────────────────────────

describe("HojaDelMes — la tardanza en la celda", () => {
  const pintarMes = () => {
    mocks.hoja = hojaDe({ desde: "2026-09-01", hasta: "2026-09-30" });
    mocks.puestos = [PUESTO_CON_HORARIO, PUESTO_SIN_HORARIO];
    return render(<HojaDelMes mes="2026-09" desde="2026-09-01" hasta="2026-09-30" onCambiarMes={() => {}} />);
  };

  it("avisa el día que quedó presente y tarde, y lo confirma sin perder la hora", () => {
    const { container } = pintarMes();
    expect(container.querySelectorAll("[data-aviso-tardanza]")).toHaveLength(1);
    fireEvent.click(celdaDe(/Victor Quispe, 2026-09-15: Presente · llegó 12 min tarde, tardanza sin marcar/));
    fireEvent.click(screen.getByRole("button", { name: "Marcar tardanza" }));
    expect(mocks.marcar).toHaveBeenCalledWith({
      colaboradorId: "c1",
      fecha: "2026-09-15",
      estado: "TARDANZA",
      entrada: "07:42",
      salida: "17:00",
      nota: "se le malogró la moto",
    });
  });
});

// ── La mudanza de la tabla a su propio archivo ──────────────────────────────
//
// `SemanaEnTabla` salió de `HojaDeLaSemana` (que pasaba las ~300 líneas). Con
// nivel completo se pintan las columnas de plata y el pie con los totales, que
// es la parte que ninguna otra prueba toca: si la mudanza hubiera perdido una
// celda o dejado una variable colgada, acá se cae.

const GANADO_DE_LA_SEMANA = {
  desde: LUNES,
  hasta: "2026-09-20",
  hoy: HOY,
  total: 180,
  personas: [
    {
      colaboradorId: "c1",
      nombre: "Victor Quispe",
      puesto: "Motosierrista",
      beneficiarioId: null,
      adelantos: null,
      total: 180,
      tramos: [],
      conteo: { PRESENTE: 2, TARDANZA: 1, MEDIO_DIA: 0, FALTA: 0, PERMISO: 0, DESCANSO: 0, VACACIONES: 0 },
      sinMarcar: [],
      sinTarifa: [],
      fueraDePeriodo: [],
      avisos: [],
      dias: [{ fecha: "2026-09-15", estado: "PRESENTE" as const, factor: 1, importe: 60 }],
      referencia: { modalidad: "DIARIO" as const, monto: 60 },
    },
  ],
};

describe("La semana con plata (nivel completo)", () => {
  it("pinta el importe del día, la referencia y el total de la semana en el pie", () => {
    mocks.hoja = hojaDe();
    mocks.puestos = [PUESTO_CON_HORARIO, PUESTO_SIN_HORARIO];
    mocks.ganado = GANADO_DE_LA_SEMANA;
    render(<HojaDeLaSemana desde={LUNES} onCambiarSemana={() => {}} nivel="completo" />);
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("60.00")).toBeInTheDocument();
    expect(within(tabla).getByText("Total de la semana")).toBeInTheDocument();
    // Y la tardanza sigue avisando con las columnas de plata puestas.
    expect(tabla.querySelectorAll("[data-aviso-tardanza]")).toHaveLength(1);
  });
});
