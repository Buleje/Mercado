/**
 * CtpCobrarEnTandaModal — la línea del trato pregunta con la corrida MÁS VIEJA.
 *
 * Revisión 23-09 (revisor 2): la tanda pasaba a la línea la fecha de la corrida
 * más NUEVA. Con un trato que empieza en medio de la tanda, la línea decía
 * «Precio pactado» y las corridas de antes quedaban sin precio sin aviso. Y la
 * propuesta dice lo que queda fuera (`quedanAntes`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CtpCobrarEnTandaModal from "@/components/admin/forestal/CtpCobrarEnTandaModal";
import type { CtpEntry } from "@/components/admin/forestal/ctp-section-shared";
import { TARIFARIO_VACIO } from "@/lib/forestal/tarifa-aserrio";

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

/* El cliente elegido tiene un trato global S/ 0,50 que EMPIEZA el 14/09, y la
   tanda trae una corrida del 07/09 y otra del 20/09. La propuesta del arreglo
   (GET …/vigencia) contesta para la fecha que se le pida. */
const TRATO = {
  id: "tc-14",
  parteId: "duenito",
  servicio: "aserrio",
  vigenteDesde: "2026-09-14",
  basePt: 0.5,
  grupos: [],
  especies: [],
  tipos: [],
  nota: null,
};
const pedidosVigencia: string[] = [];
beforeEach(() => {
  pedidosVigencia.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/tarifas-cliente/vigencia")) {
        pedidosVigencia.push(u);
        const desde = new URL(u, "http://x").searchParams.get("desde");
        return new Response(
          JSON.stringify({
            parteId: "duenito",
            parteNombre: "Cliente QA",
            desde,
            arreglo: {
              parteId: "duenito",
              servicio: "aserrio",
              mover: { tarifaId: "tc-14", vigenteDesde: "2026-09-14", desde },
              corte: desde,
              sinCobrar: [],
              antesDelTrato: 0,
              quedanAntes: 2,
              cambian: [],
              pt: 0,
              importe: 0,
              diferencia: 0,
            },
          }),
          { status: 200 },
        );
      }
      if (u.includes("/tarifas-cliente")) return new Response(JSON.stringify({ tarifas: [TRATO] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  setTarifarioMock(TARIFARIO_VACIO);
  vi.unstubAllGlobals();
});

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

describe("CtpCobrarEnTandaModal — el trato que empieza en medio de la tanda (revisor 2, 23-09)", () => {
  it("la línea usa la corrida más vieja, ofrece adelantar a ESA fecha y dice lo que queda fuera", async () => {
    render(
      <CtpCobrarEnTandaModal
        corridas={[corrida({ id: "nueva", lineNo: 41, entryDate: "2026-09-20" }), corrida({ id: "vieja", lineNo: 30, entryDate: "2026-09-07" })]}
        onCerrar={() => {}}
        onListo={() => {}}
      />,
    );
    await waitFor(() => expect(screen.queryByText(/Buscando los paquetes/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Elige a quién se le asierra/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cliente QA/i }));

    expect(
      await screen.findByText(/El trato con Cliente QA empieza el lunes 14\/09 y la corrida más vieja es del lunes 07\/09/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar el trato el 07/09" })).toBeInTheDocument();
    await waitFor(() => expect(pedidosVigencia.some((u) => u.includes("desde=2026-09-07"))).toBe(true));
    expect(await screen.findByText(/2 corridas de antes del 07\/09 siguen sin precio: el trato no las alcanza/)).toBeInTheDocument();
  });
});
