import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRrhhAsistencia, type ResultadoFlush } from "@/hooks/use-rrhh-asistencia";
import MotivoCorreccionModal from "@/components/admin/rrhh/asistencia/MotivoCorreccionModal";
import {
  MOTIVOS_FRECUENTES,
  _resetBuzonDeMotivo,
  pedirMotivoCorreccion,
  responderMotivo,
  revisarMotivoCorreccion,
  suscribirPedidoDeMotivo,
  type CambioACorregir,
  type RespuestaMotivo,
} from "@/lib/rrhh/motivo-correccion";
import { guardarMarcasSchema } from "@/lib/rrhh/schemas";
import type { AsistenciaDTO, HojaAsistenciaDTO } from "@/lib/rrhh/tipos";

/**
 * ADR-417 — corregir una marca guardada pide el motivo.
 *
 * MEDIDO el 2026-09-15 contra la base real: 10 marcas corregidas, 0 motivos.
 * El tramo del servidor estaba entero (schema → route → `motivoCorreccion` de
 * la fila que se da de baja → `reemplazada.motivo` del historial); lo cortado
 * era el cliente: `use-rrhh-asistencia` mandaba `{ marcas }` y nunca un motivo.
 *
 * Control negativo de todo el archivo: con el hook viejo, el body del PUT
 * nunca traía `motivo` y `pedirMotivoCorreccion` no existía — no compilaría.
 */

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FECHA = "2026-09-11";

function marcaGuardada(p: Partial<AsistenciaDTO> = {}): AsistenciaDTO {
  return {
    id: "asis-real-1", // id del SERVIDOR: por eso cambiarla es una corrección
    colaboradorId: "c1",
    fecha: FECHA,
    estado: "FALTA",
    entrada: null,
    salida: null,
    refrigerioMin: 0,
    horas: null,
    nota: null,
    origen: "manual",
    marcadoPor: "qaadmin",
    marcadoEn: "2026-09-11T13:00:00.000Z",
    ...p,
  };
}

function hojaDe(marcas: AsistenciaDTO[]): HojaAsistenciaDTO {
  return {
    nivel: "completo",
    hoy: FECHA,
    desde: FECHA,
    hasta: FECHA,
    ventana: { desde: null, hasta: FECHA },
    colaboradores: [
      { id: "c1", nombre: "Ana", apodo: null, puesto: null, estado: "ACTIVO", fechaIngreso: null, fechaCese: null },
      { id: "c2", nombre: "Beto", apodo: null, puesto: null, estado: "ACTIVO", fechaIngreso: null, fechaCese: null },
    ],
    marcas,
  };
}

/** GET de la hoja + cualquier PUT en verde. Devuelve los bodies de los PUT. */
function fetchDe(hoja: HojaAsistenciaDTO) {
  const puts: { marcas: { colaboradorId: string; estado: string | null }[]; motivo?: string }[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method !== "PUT") return { ok: true, json: async () => hoja };
    const body = JSON.parse(init.body ?? "{}");
    puts.push(body);
    return {
      ok: true,
      json: async () => ({
        guardadas: body.marcas
          .filter((m: { estado: string | null }) => m.estado !== null)
          .map((m: { colaboradorId: string; fecha: string; estado: string }) =>
            marcaGuardada({ id: `asis-nueva-${m.colaboradorId}`, colaboradorId: m.colaboradorId, fecha: m.fecha, estado: m.estado as AsistenciaDTO["estado"] }),
          ),
        quitadas: 0,
        sinCambio: 0,
      }),
    };
  });
  return { fetchMock, puts };
}

/** Host falso del buzón: guarda lo que se le pregunta y contesta lo que se le diga. */
function hostFalso(respuesta: RespuestaMotivo | null) {
  const pedidos: CambioACorregir[][] = [];
  let pendiente: (() => void) | null = null;
  const baja = suscribirPedidoDeMotivo((cambios) => {
    if (!cambios) return;
    pedidos.push(cambios);
    if (respuesta) responderMotivo(respuesta);
    else pendiente = () => responderMotivo({ tipo: "motivo", motivo: "Trajo descanso médico" });
  });
  return { pedidos, baja, responderDespues: () => pendiente?.() };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetBuzonDeMotivo();
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetBuzonDeMotivo();
});

// ── 1. Qué es un motivo ──────────────────────────────────────────────────────

describe("revisarMotivoCorreccion — «ok» y «.» no son un motivo", () => {
  it.each(["", "  ", "ok", ".", "..", "1234", "a b"])("rechaza %o", (texto) => {
    expect(revisarMotivoCorreccion(texto).ok).toBe(false);
  });

  it("CONTROL NEGATIVO: un motivo de verdad pasa, y se guarda normalizado", () => {
    const r = revisarMotivoCorreccion("  Llegó   tarde, no faltó  ");
    expect(r).toEqual({ ok: true, motivo: "Llegó tarde, no faltó" });
  });

  it("los 5 motivos frecuentes del modal pasan su propia regla", () => {
    for (const m of MOTIVOS_FRECUENTES) expect(revisarMotivoCorreccion(m).ok).toBe(true);
  });

  it("el servidor aplica la MISMA regla: el PUT con «ok» es 422", () => {
    const marcas = [{ colaboradorId: "c1", fecha: FECHA, estado: "PRESENTE" as const }];
    expect(guardarMarcasSchema.safeParse({ marcas, motivo: "ok" }).success).toBe(false);
    expect(guardarMarcasSchema.safeParse({ marcas, motivo: "Me equivoqué al marcar" }).success).toBe(true);
    // Sin motivo sigue siendo válido: una tanda de marcas nuevas no corrige nada.
    expect(guardarMarcasSchema.safeParse({ marcas }).success).toBe(true);
  });
});

// ── 2. El camino del usuario, por el hook que usa la hoja ────────────────────

describe("use-rrhh-asistencia — sólo pregunta cuando de verdad se corrige", () => {
  it("la PRIMERA marca del día no es una corrección: no pregunta nada y viaja sin motivo", async () => {
    const { fetchMock, puts } = fetchDe(hojaDe([])); // el día arranca vacío
    vi.stubGlobal("fetch", fetchMock);
    const host = hostFalso({ tipo: "cancelado" });

    const { result } = renderHook(() => useRrhhAsistencia(FECHA, FECHA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.marcar({ colaboradorId: "c1", fecha: FECHA, estado: "PRESENTE" }));
    await act(async () => {
      await result.current.guardarAhora();
    });

    expect(host.pedidos).toHaveLength(0);
    expect(puts).toHaveLength(1);
    expect(puts[0].motivo).toBeUndefined();
    host.baja();
  });

  it("arrepentirse en dos segundos tampoco pregunta (esa marca todavía no existía para el libro)", async () => {
    const { fetchMock, puts } = fetchDe(hojaDe([]));
    vi.stubGlobal("fetch", fetchMock);
    const host = hostFalso({ tipo: "cancelado" });

    const { result } = renderHook(() => useRrhhAsistencia(FECHA, FECHA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.marcar({ colaboradorId: "c1", fecha: FECHA, estado: "PRESENTE" }));
    act(() => result.current.marcar({ colaboradorId: "c1", fecha: FECHA, estado: "FALTA" }));
    await act(async () => {
      await result.current.guardarAhora();
    });

    expect(host.pedidos).toHaveLength(0);
    expect(puts[0].marcas).toEqual([expect.objectContaining({ estado: "FALTA" })]);
    host.baja();
  });

  it("cambiar una marca YA guardada pregunta el motivo y lo manda en el mismo PUT", async () => {
    const { fetchMock, puts } = fetchDe(hojaDe([marcaGuardada()])); // Ana ya está en FALTA
    vi.stubGlobal("fetch", fetchMock);
    const host = hostFalso({ tipo: "motivo", motivo: "Avisó su falta después" });

    const { result } = renderHook(() => useRrhhAsistencia(FECHA, FECHA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.marcar({ colaboradorId: "c1", fecha: FECHA, estado: "PRESENTE" }));
    await act(async () => {
      await result.current.guardarAhora();
    });

    // Lo que ve el modal: quién, qué día, de qué a qué.
    expect(host.pedidos).toHaveLength(1);
    expect(host.pedidos[0]).toEqual([
      { colaboradorId: "c1", fecha: FECHA, nombre: "Ana", antes: "FALTA", despues: "PRESENTE" },
    ]);
    expect(puts).toHaveLength(1);
    expect(puts[0].motivo).toBe("Avisó su falta después");
    host.baja();
  });

  it("cancelar el motivo NO guarda la corrección y la celda vuelve a como estaba", async () => {
    const { fetchMock, puts } = fetchDe(hojaDe([marcaGuardada()]));
    vi.stubGlobal("fetch", fetchMock);
    const host = hostFalso({ tipo: "cancelado" });

    const { result } = renderHook(() => useRrhhAsistencia(FECHA, FECHA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.marcar({ colaboradorId: "c1", fecha: FECHA, estado: "PRESENTE" }));
    expect(result.current.hoja?.marcas[0].estado).toBe("PRESENTE"); // optimista
    await act(async () => {
      await result.current.guardarAhora();
    });

    expect(host.pedidos).toHaveLength(1);
    expect(puts).toHaveLength(0); // nada se escribió
    expect(result.current.hoja?.marcas).toEqual([marcaGuardada()]); // y la celda volvió
    expect(result.current.pendientes.size).toBe(0);
    host.baja();
  });

  it("las marcas nuevas de la misma tanda NO esperan la pregunta (marcar 20 personas no se frena)", async () => {
    const { fetchMock, puts } = fetchDe(hojaDe([marcaGuardada()]));
    vi.stubGlobal("fetch", fetchMock);
    const host = hostFalso(null); // el modal queda abierto

    const { result } = renderHook(() => useRrhhAsistencia(FECHA, FECHA));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.marcar({ colaboradorId: "c1", fecha: FECHA, estado: "PRESENTE" }); // corrección
      result.current.marcar({ colaboradorId: "c2", fecha: FECHA, estado: "PRESENTE" }); // nueva
    });

    let enCurso: Promise<ResultadoFlush> | undefined;
    await act(async () => {
      enCurso = result.current.guardarAhora();
      await Promise.resolve();
    });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].marcas).toEqual([expect.objectContaining({ colaboradorId: "c2" })]);
    expect(puts[0].motivo).toBeUndefined();

    await act(async () => {
      host.responderDespues();
      await enCurso;
    });

    expect(puts).toHaveLength(2);
    expect(puts[1].marcas).toEqual([expect.objectContaining({ colaboradorId: "c1" })]);
    expect(puts[1].motivo).toBe("Trajo descanso médico");
    host.baja();
  });
});

// ── 3. El modal que pregunta ─────────────────────────────────────────────────

describe("MotivoCorreccionModal — obligatorio, pero de un toque", () => {
  it("un motivo frecuente se toca y resuelve; «ok» no pasa y se avisa", async () => {
    const usuario = userEvent.setup();
    render(<MotivoCorreccionModal />);

    const pedido = pedirMotivoCorreccion([
      { colaboradorId: "c1", fecha: FECHA, nombre: "Ana", antes: "FALTA", despues: "PRESENTE" },
    ]);

    // El modal dice a quién y de qué a qué, sin tener que abrir el historial.
    expect(await screen.findByText("¿Por qué se corrige?")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();

    await usuario.type(screen.getByLabelText(/Otro motivo/i), "ok");
    await usuario.click(screen.getByRole("button", { name: /Guardar la corrección/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/al menos 4 letras/i);

    await usuario.click(screen.getByRole("button", { name: MOTIVOS_FRECUENTES[0] }));
    await expect(pedido).resolves.toEqual({ tipo: "motivo", motivo: MOTIVOS_FRECUENTES[0] });
  });

  it("desmontar el modal con la pregunta abierta la cancela: nadie queda colgado", async () => {
    const { unmount } = render(<MotivoCorreccionModal />);
    const pedido = pedirMotivoCorreccion([
      { colaboradorId: "c1", fecha: FECHA, nombre: "Ana", antes: "PRESENTE", despues: null },
    ]);
    unmount();
    await expect(pedido).resolves.toEqual({ tipo: "cancelado" });
  });

  it("sin modal montado la corrección se guarda igual (perderla sería peor que perder el motivo)", async () => {
    await expect(pedirMotivoCorreccion([{ colaboradorId: "c1", fecha: FECHA, nombre: "Ana", antes: "FALTA", despues: "PRESENTE" }])).resolves.toEqual({
      tipo: "sin-host",
    });
  });
});
