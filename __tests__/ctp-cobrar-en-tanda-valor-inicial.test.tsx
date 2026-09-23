/**
 * CtpCobrarEnTandaModal — el valor inicial nunca borra plata.
 *
 * ALTO medido por Brandon en QA (2026-09-14): el modal arrancaba en «Madera
 * del centro — no se cobra» con el botón «Cobrar N corridas» YA habilitado.
 * Un clic sin tocar nada mandó `duenoParteId: null` — en la tanda el dueño
 * SIEMPRE se manda explícito (no hay «el de antes» que preservar por
 * corrida) — y le quitó el cobro a corridas que YA tenían dueño. Esto prueba
 * que el botón queda deshabilitado hasta elegir algo, y que elegir
 * explícitamente «Madera del centro» sobre corridas ya cobradas cambia la
 * etiqueta a la acción destructiva real: «Dejar de cobrar».
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CtpCobrarEnTandaModal from "@/components/admin/forestal/CtpCobrarEnTandaModal";
import type { CtpEntry } from "@/components/admin/forestal/ctp-section-shared";
import { TARIFARIO_VACIO, type Tarifario } from "@/lib/forestal/tarifa-aserrio";

// `vi.hoisted`: el mock necesita leer un tarifario que cada test puede cambiar
// (por defecto vacío; el de la unidad-PT abajo pone uno con precio real) sin
// pelearse con el hoisting de `vi.mock`.
const { getTarifarioMock, setTarifarioMock } = vi.hoisted(() => {
  let tarifario: unknown = null;
  return {
    getTarifarioMock: () => tarifario,
    setTarifarioMock: (t: unknown) => {
      tarifario = t;
    },
  };
});

/** Una parte real del directorio para poder elegir "a quién se le asierra"
 *  en los tests que necesitan un `duenoParteId` de verdad (no "Madera del
 *  centro", que siempre manda `null`). */
const parteQa = {
  id: "duenito",
  roles: [] as const,
  nombre: "Cliente QA",
  categoria: null,
  codigoCtp: null,
  docTipo: null,
  docNumero: null,
  direccion: null,
  region: null,
  provincia: null,
  distrito: null,
  zona: null,
  ubigeo: null,
  telefono: null,
  email: null,
  registroMtc: null,
  licencia: null,
  tituloHabilitante: null,
  resolucion: null,
  planManejo: null,
  arffs: null,
  representante: null,
  representanteDni: null,
  notas: null,
  activo: true,
  usos: 0,
  ultimoUso: null,
  logo: null,
  adjuntos: [],
};

vi.mock("@/hooks/use-directorio-forestal", () => ({
  useDirectorioForestal: () => ({
    partes: [parteQa],
    vehiculos: [],
    vehiculosActivos: [],
    porRol: () => [],
    cargando: false,
    error: null,
    cargar: vi.fn(),
    guardarParte: vi.fn(),
    eliminarParte: vi.fn(),
    guardarVehiculo: vi.fn(),
    eliminarVehiculo: vi.fn(),
    marcarUso: vi.fn(),
    candidatosProveedor: [],
    conflictosProveedor: [],
    cargandoCandidatos: false,
    candidatosProveedorError: null,
    cargarCandidatosProveedor: vi.fn(),
    agregarCandidatoProveedor: vi.fn(),
  }),
}));

// jsdom no implementa `scrollIntoView`; el selector de dueño lo llama al abrirse.
Element.prototype.scrollIntoView = vi.fn();

vi.mock("@/components/admin/forestal/hooks/use-tarifa-aserrio", () => ({
  useTarifaAserrio: () => ({
    tarifario: getTarifarioMock(),
    cargando: false,
    guardando: false,
    error: null,
    guardar: vi.fn(),
    quitar: vi.fn(),
    recargar: vi.fn(),
    cargarBorrador: vi.fn(),
  }),
}));

vi.mock("@/components/admin/forestal/hooks/guardar-produccion-corrida", () => ({
  paquetesYaDeclarados: vi.fn().mockResolvedValue([]),
}));

setTarifarioMock(TARIFARIO_VACIO);

afterEach(() => {
  cleanup();
  setTarifarioMock(TARIFARIO_VACIO);
});

const tarifarioConBaseReal: Tarifario = {
  versiones: [
    {
      id: "v1",
      vigenteDesde: "2026-01-01",
      basePt: 0.3,
      especies: [],
      tipos: [],
      largos: [],
      nota: null,
      creadoPor: "qa",
      creadoEn: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const corrida = (o: Partial<CtpEntry> = {}): CtpEntry => ({
  id: "a",
  section: "produccion",
  lineNo: 1,
  entryDate: "2026-09-10",
  gtfIngreso: null,
  materiaPrimaRef: null,
  speciesCommon: "Tornillo",
  speciesScientific: null,
  cites: false,
  productType: "MADERA ASERRADA (COMERCIAL)",
  volumeInputM3: null,
  rendimientoPct: null,
  quantity: "1",
  unit: "m3",
  pieces: null,
  gtfNumber: null,
  destino: null,
  observations: null,
  status: "registrado",
  annulledReason: null,
  ...o,
});

async function render1CorridaYaCobrada() {
  render(
    <CtpCobrarEnTandaModal
      corridas={[corrida({ duenoParteId: "p1", aserrioImporte: 120, titularNombre: "QA Aserrío" })]}
      onCerrar={() => {}}
      onListo={() => {}}
    />,
  );
  await waitFor(() => expect(screen.queryByText(/Buscando los paquetes/i)).not.toBeInTheDocument());
}

describe("CtpCobrarEnTandaModal — el valor inicial nunca borra plata (ALTO 2026-09-14)", () => {
  it("sin elegir dueño, el botón de guardar arranca deshabilitado", async () => {
    await render1CorridaYaCobrada();

    expect(screen.getByRole("button", { name: /Elige a quién se le asierra/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cobrar 1 corrida$/i })).toBeDisabled();
  });

  it("al elegir explícitamente «Madera del centro» sobre una corrida ya cobrada, pasa a «Dejar de cobrar» y avisa el importe", async () => {
    await render1CorridaYaCobrada();

    fireEvent.click(screen.getByRole("button", { name: /Elige a quién se le asierra/i }));
    fireEvent.click(screen.getByRole("button", { name: /Madera del centro — no se cobra/i }));

    const boton = screen.getByRole("button", { name: /Dejar de cobrar 1 corrida/i });
    expect(boton).not.toBeDisabled();
    expect(screen.getByText(/Vas a dejar de cobrar S\/ 120\.00 en 1 corrida a QA Aserrío/i)).toBeInTheDocument();
  });

  it("sin ninguna corrida ya cobrada, elegir «Madera del centro» NO activa la acción destructiva", async () => {
    render(
      <CtpCobrarEnTandaModal corridas={[corrida({ duenoParteId: null })]} onCerrar={() => {}} onListo={() => {}} />,
    );
    await waitFor(() => expect(screen.queryByText(/Buscando los paquetes/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Elige a quién se le asierra/i }));
    fireEvent.click(screen.getByRole("button", { name: /Madera del centro — no se cobra/i }));

    // Nada que perder: sigue siendo la acción normal, sin aviso ni botón rojo.
    const boton = screen.getByRole("button", { name: /^Cobrar 1 corrida$/i });
    expect(boton).not.toBeDisabled();
    expect(screen.queryByText(/Vas a dejar de cobrar/i)).not.toBeInTheDocument();
  });
});

describe("CtpCobrarEnTandaModal — la vista previa lee la unidad de la corrida (ALTO 2026-09-14)", () => {
  it("una corrida en PT sin paquetes cotiza por PT, no como si fuera m³", async () => {
    setTarifarioMock(tarifarioConBaseReal);
    render(
      <CtpCobrarEnTandaModal
        corridas={[corrida({ unit: "pt", quantity: "5000" })]}
        onCerrar={() => {}}
        onListo={() => {}}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/Buscando los paquetes/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Elige a quién se le asierra/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cliente QA/i }));

    // 5.000 PT × S/ 0.30 = S/ 1.500,00. Sin `unit`, 5.000 se leería como m³
    // (÷ 424 al revés): 2.120.000 PT y un importe absurdo. Sale en la fila Y
    // en el total (una sola corrida) — `getAllByText` por eso, no `getByText`.
    expect(screen.getAllByText("S/ 1,500.00").length).toBeGreaterThan(0);
  });

  it("una corrida en kg sin paquetes no se puede cobrar por PT: muestra el motivo, no un número", async () => {
    render(
      <CtpCobrarEnTandaModal
        corridas={[corrida({ unit: "kg", quantity: "500" })]}
        onCerrar={() => {}}
        onListo={() => {}}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/Buscando los paquetes/i)).not.toBeInTheDocument());

    expect(screen.getByText(/No se puede cobrar: no está en m³/i)).toBeInTheDocument();
    // Tampoco cuenta como cobrable en el botón principal.
    expect(screen.getByRole("button", { name: /^Cobrar 0 corridas$/i })).toBeInTheDocument();
  });
});
