/**
 * «¿De qué trozas salió?» (27-09) — el camino del operario en «Declarar producción».
 *
 * Lo que fija:
 *  - la propuesta llega YA marcada y el botón pasa a «Declarar y descontar trozas»;
 *  - son dos actos: primero se declara con el pedido de siempre y DESPUÉS se
 *    atan sólo las trozas que quedaron marcadas (la desmarcada no viaja);
 *  - si el segundo falla, la producción queda declarada: el modal lo dice en
 *    lugar del formulario (sin botón «Registrar» a la vista) y avisa a quien lo
 *    abrió recién con «Entendido»;
 *  - sin trozas de la especie, una línea lo dice y se registra como siempre;
 *  - la bandeja cuenta por motivo, en el orden en que se resuelve.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import CtpDeclararProduccionModal from "@/components/admin/forestal/CtpDeclararProduccionModal";
import CtpRevisarVinculosModal from "@/components/admin/forestal/CtpRevisarVinculosModal";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { TARIFARIO_VACIO } from "@/lib/forestal/tarifa-aserrio";
import type { ProduccionSinLoteRespuesta } from "@/lib/forestal/declarar-produccion";
import type { DiagnosticoCorrida, DiagnosticoSinOrigen } from "@/lib/forestal/vincular-trozas";
import { filasDeBandeja, textoDeVinculos } from "@/hooks/use-vincular-trozas";

const { toastError, rolMock } = vi.hoisted(() => ({ toastError: vi.fn(), rolMock: { rol: null as string | null } }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/hooks/use-mi-rol", () => ({ useMiRol: () => rolMock.rol }));
vi.mock("@/hooks/use-directorio-forestal", () => ({
  useDirectorioForestal: () => ({
    partes: [],
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
vi.mock("@/components/admin/forestal/hooks/use-tarifa-aserrio", () => ({
  useTarifaAserrio: () => ({
    tarifario: TARIFARIO_VACIO,
    cargando: false,
    guardando: false,
    error: null,
    guardar: vi.fn(),
    quitar: vi.fn(),
    recargar: vi.fn(),
    cargarBorrador: vi.fn(),
  }),
}));
vi.mock("@/components/admin/forestal/hooks/use-saldo-permisos", () => ({
  useSaldoPermisos: () => ({ datos: null, cargando: false, error: null, recargar: vi.fn() }),
}));

Element.prototype.scrollIntoView = vi.fn();

const pieza = (id: string, especie: string, cantidad: number): PiezaCubicada => {
  const base = { id, cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { ...base, especie, ...cubicarPieza(base) };
};
const PIEZAS = [pieza("p-1", "Tornillo", 5), pieza("p-2", "Tacho", 2)];

const respuestaOk: ProduccionSinLoteRespuesta = {
  corridas: [
    { id: "c-tor", lineNo: 31, especie: "Tornillo", pt: 100, m3: 0.2358, valorVenta: null, aserrio: null },
    { id: "c-tac", lineNo: 32, especie: "Tacho", pt: 40, m3: 0.0943, valorVenta: null, aserrio: null },
  ],
  total: { pt: 140, m3: 0.3301, valorVenta: null },
};

const troza = (trozaId: string, codigo: string, m3: number) => ({ trozaId, codigo, m3, gtfNumber: "001-0042", especie: "Tornillo" });

let orden: string[] = [];
let vinculos: { corridaId: string; trozaIds: string[] }[] = [];
let vincularResponde: { status: number; body: unknown } = { status: 200, body: {} };

beforeEach(() => {
  orden = [];
  vinculos = [];
  rolMock.rol = null;
  vincularResponde = { status: 200, body: { ok: true, corridaId: "c-tor", trozas: 1, m3: 0.62, lotesArmados: [] } };
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/produccion-sin-lote")) {
        orden.push("declarar");
        return new Response(JSON.stringify(respuestaOk), { status: 200 });
      }
      if (u.includes("/vincular-trozas") && init?.method === "POST") {
        orden.push("vincular");
        vinculos.push(JSON.parse(String(init.body)) as { corridaId: string; trozaIds: string[] });
        return new Response(JSON.stringify(vincularResponde.body), { status: vincularResponde.status });
      }
      if (u.includes("/vincular-trozas?propuesta=1")) {
        const especie = new URL(u, "http://x").searchParams.get("especie");
        const body =
          especie === "Tornillo"
            ? { propuesta: [troza("t-1", "T-104", 0.62), troza("t-2", "T-105", 0.41)], motivo: "lista", detalle: "" }
            : { propuesta: [], motivo: "sin_trozas_de_la_especie", detalle: "No hay trozas de Tacho. Se declara sin origen." };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

function montar() {
  const onRegistrado = vi.fn();
  render(
    <ConfirmDialogProvider>
      <CtpDeclararProduccionModal
        abierto
        onCerrar={vi.fn()}
        piezas={PIEZAS}
        codigosEnPlanta={[]}
        fecha="2026-09-22"
        onFecha={vi.fn()}
        trozas={[]}
        onRegistrado={onRegistrado}
      />
    </ConfirmDialogProvider>,
  );
  return { onRegistrado };
}

async function declararConLaPropuesta() {
  const r = montar();
  fireEvent.click(screen.getByRole("radio", { name: /Madera propia/ }));
  await screen.findByRole("checkbox", { name: /Troza T-104/ });
  return r;
}

describe("¿De qué trozas salió? — en Declarar producción", () => {
  it("la propuesta llega marcada, dice lo que no tiene trozas y cambia el botón", async () => {
    await declararConLaPropuesta();
    expect(screen.getByRole("checkbox", { name: /Troza T-104/ })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: /Troza T-105/ })).toHaveProperty("checked", true);
    expect(screen.getByText("No hay trozas de Tacho. Se declara sin origen.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Declarar y descontar trozas/ })).toBeTruthy();
  });

  it("declara primero y después ata SÓLO las marcadas, a la corrida de su especie", async () => {
    const { onRegistrado } = await declararConLaPropuesta();
    fireEvent.click(screen.getByRole("checkbox", { name: /Troza T-105/ }));
    fireEvent.click(screen.getByRole("button", { name: /Declarar y descontar trozas/ }));

    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
    expect(orden).toEqual(["declarar", "vincular"]);
    /* Tacho no tenía trozas: no hay pedido para su corrida. */
    expect(vinculos).toEqual([{ corridaId: "c-tor", trozaIds: ["t-1"] }]);
    expect(String(onRegistrado.mock.calls[0]?.[0])).toMatch(/Se descontaron 1 troza/);
    /* Lo que se descontó ya no «falta vincular»: sólo lo que quedó sin trozas. */
    expect(String(onRegistrado.mock.calls[0]?.[0])).not.toMatch(/Falta vincularle/);
    expect(String(onRegistrado.mock.calls[0]?.[0])).toMatch(/Sin trozas: Tacho\./);
  });

  it("si descontar falla, la producción queda declarada y se dice por qué antes de cerrar", async () => {
    vincularResponde = { status: 409, body: { ok: false, error: "TROZA_TOMADA", message: "Otra persona usó la T-104." } };
    const { onRegistrado } = await declararConLaPropuesta();
    fireEvent.click(screen.getByRole("button", { name: /Declarar y descontar trozas/ }));

    expect(await screen.findByText("La producción quedó declarada.")).toBeTruthy();
    expect(screen.getByText(/N\.º 31 Tornillo quedó sin trozas: Otra persona usó la T-104\./)).toBeTruthy();
    expect(toastError).toHaveBeenCalledTimes(1);
    /* Sin formulario a la vista: no se puede declarar dos veces. */
    expect(screen.queryByRole("button", { name: /Declarar y descontar|^Registrar/ })).toBeNull();
    expect(onRegistrado).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onRegistrado).toHaveBeenCalledTimes(1);
    expect(String(onRegistrado.mock.calls[0]?.[0])).toMatch(/quedó sin trozas/);
  });

  it("quien no firma vinculaciones (almacenero) declara sin origen: no se le ofrece descontar", async () => {
    rolMock.rol = "almacenero";
    const { onRegistrado } = montar();
    fireEvent.click(screen.getByRole("radio", { name: /Madera propia/ }));
    expect(await screen.findByText(/Las trozas las vincula el dueño o un administrador/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Troza T-104/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Registrar 2 corridas/ }));
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
    expect(orden).toEqual(["declarar"]);
  });

  it("todo desmarcado: registra como siempre, sin segundo pedido", async () => {
    const { onRegistrado } = await declararConLaPropuesta();
    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todas" }));
    fireEvent.click(screen.getByRole("button", { name: /^Registrar 2 corridas/ }));
    await waitFor(() => expect(onRegistrado).toHaveBeenCalledTimes(1));
    expect(orden).toEqual(["declarar"]);
  });
});

describe("la bandeja y los mensajes", () => {
  const corrida = (id: string, motivo: DiagnosticoCorrida["motivo"], gtfs: string[] = []): DiagnosticoCorrida => ({
    corridaId: id,
    lineNo: 1,
    fecha: "2026-08-01",
    especie: "Tornillo",
    permiso: null,
    m3Producido: 1,
    motivo,
    detalle: "",
    propuesta: gtfs.map((g, i) => ({ trozaId: `${id}-${i}`, codigo: "X", m3: 0.5, gtfNumber: g, especie: "Tornillo" })),
    m3Propuesto: 0,
  });

  it("una fila por motivo, en el orden en que se resuelve, con guías distintas", () => {
    const d: DiagnosticoSinOrigen = {
      corridas: [
        corrida("a", "sin_trozas_de_la_especie"),
        corrida("b", "llegada_posterior", ["G1", "G2"]),
        corrida("c", "llegada_posterior", ["G2"]),
        corrida("d", "lista", ["G3"]),
      ],
      porMotivo: {
        lista: 1,
        llegada_posterior: 2,
        fila_de_otra_especie: 0,
        guia_sin_recibir: 0,
        apertura: 0,
        sin_trozas_de_la_especie: 1,
      },
      total: 4,
    };
    const filas = filasDeBandeja(d);
    expect(filas.map((f) => f.motivo)).toEqual(["lista", "llegada_posterior", "sin_trozas_de_la_especie"]);
    expect(filas[1]).toMatchObject({ guias: 2, trozas: 3 });
  });

  it("suma lo descontado, avisa el 56 % y pone cada falla en su renglón", () => {
    const { texto, fallas } = textoDeVinculos([
      { corridaId: "a", lineNo: 5, especie: "Tornillo", resultado: { ok: true, corridaId: "a", trozas: 3, m3: 1.2, lotesArmados: [], sobreElTope: true } },
      { corridaId: "b", lineNo: 6, especie: "Tacho", resultado: { ok: false, error: "X", message: "Mes cerrado." } },
      { corridaId: "c", lineNo: 7, especie: "Cumala", resultado: null },
    ]);
    expect(texto).toMatch(/Se descontaron 3 trozas \(1\.2 m³\)\./);
    expect(texto).toMatch(/Ojo: N\.º 5 rinde más del 56 %\./);
    expect(fallas).toEqual(["N.º 6 Tacho quedó sin trozas: Mes cerrado."]);
  });

  it("una corrida lista con el mes cerrado no deja vincular (revisión independiente, 27-09)", () => {
    const c: DiagnosticoCorrida = { ...corrida("z", "lista", ["G9"]), mesCerrado: "agosto de 2026" };
    render(<CtpRevisarVinculosModal corridas={[c]} onCerrar={vi.fn()} onVinculada={vi.fn()} />);
    const boton = screen.getByRole("button", { name: /el mes está cerrado: reábrelo para vincular/i });
    expect(boton).toBeDisabled();
  });
});
