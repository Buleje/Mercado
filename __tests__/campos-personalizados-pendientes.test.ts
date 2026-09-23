import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  guardarValoresPendientes,
  pendientesVacios,
  hayPendientes,
  useCamposPersonalizados,
  type PendientesCampos,
} from "@/hooks/use-campos-personalizados";
import type { CampoPersonalizado } from "@/lib/campos-personalizados";

/**
 * Campos personalizados (ADR-427) — lo que se puede probar sin navegador.
 *
 * Tres cosas que, si se rompen, no las ve ni `tsc` ni el ojo:
 *
 * 1. Un campo inventado durante un ALTA no se puede crear todavía (un campo
 *    temporal necesita el id del registro al que pertenece). Queda pendiente y
 *    se crea cuando el padre devuelve el id — y lo escrito en él tiene que
 *    viajar con el id RECIÉN creado, no con la clave local.
 * 2. Un nombre repetido no puede voltear a los otros pendientes ni al guardado
 *    de valores: el registro ya se guardó, esto es un agregado.
 * 3. La carga vieja no pisa lo optimista: el GET que salió antes de crear el
 *    campo vuelve después y repondría la lista SIN él.
 */

const campo = (over: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({
  id: "c1",
  formulario: "qa.demo",
  clave: "apuntador",
  nombre: "Apuntador",
  descripcion: "Quién tomó la medida",
  tipo: "texto",
  opciones: [],
  soloParaRegistroId: null,
  orden: 0,
  activo: true,
  ...over,
});

/** El cuerpo JSON de la llamada `n` al mock de fetch. */
function cuerpo(fetchMock: ReturnType<typeof vi.fn>, n: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[n][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("guardarValoresPendientes — lo que se cargó en un alta entra cuando aparece el id", () => {
  const pendientes: PendientesCampos = {
    formulario: "qa.demo",
    valores: { "c-existente": "ACME", "c-vacio": "   " },
    nuevos: [
      { clave: "cp1", nombre: "Color de cinta", descripcion: "", tipo: "texto", opciones: [], soloEnEsteRegistro: true, valor: "rojo" },
      { clave: "cp2", nombre: "Orden interna", descripcion: "", tipo: "numero", opciones: [], soloEnEsteRegistro: false, valor: "12,5" },
    ],
  };

  it("crea el temporal contra el registro nuevo, el permanente sin registro, y manda los valores con el id creado", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ campo: campo({ id: "n1", clave: "color-de-cinta", soloParaRegistroId: "reg-9" }) }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ campo: campo({ id: "n2", clave: "orden-interna", tipo: "numero" }) }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ guardados: 3 }) });
    vi.stubGlobal("fetch", fetchMock);

    const r = await guardarValoresPendientes("reg-9", pendientes);

    expect(r).toEqual({ creados: 2, guardados: 3, errores: [] });
    // El temporal cuelga del registro; el permanente queda para todos.
    expect(cuerpo(fetchMock, 0)).toMatchObject({ formulario: "qa.demo", nombre: "Color de cinta", soloParaRegistroId: "reg-9" });
    expect(cuerpo(fetchMock, 1)).toMatchObject({ nombre: "Orden interna", soloParaRegistroId: null });

    const put = cuerpo(fetchMock, 2);
    expect(String(fetchMock.mock.calls[2][0])).toContain("/valores");
    expect(put.registroId).toBe("reg-9");
    // El vacío no viaja; los nuevos viajan con el id que devolvió el servidor.
    expect(put.valores).toEqual([
      { campoId: "c-existente", valor: "ACME" },
      { campoId: "n1", valor: "rojo" },
      { campoId: "n2", valor: "12,5" },
    ]);
  });

  it("un nombre repetido (409) no voltea a los demás ni al guardado de valores", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: "Ya existe un campo «Color de cinta»." }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ campo: campo({ id: "n2" }) }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ guardados: 2 }) });
    vi.stubGlobal("fetch", fetchMock);

    const r = await guardarValoresPendientes("reg-9", pendientes);

    expect(r.creados).toBe(1);
    expect(r.guardados).toBe(2);
    expect(r.errores).toEqual(["Color de cinta: Ya existe un campo «Color de cinta»."]);
    expect(cuerpo(fetchMock, 2).valores).toEqual([
      { campoId: "c-existente", valor: "ACME" },
      { campoId: "n2", valor: "12,5" },
    ]);
  });

  it("hayPendientes ignora lo que quedó en blanco", () => {
    const vacios = pendientesVacios("qa.demo");
    expect(hayPendientes(vacios)).toBe(false);
    expect(hayPendientes({ ...vacios, valores: { c1: "   " } })).toBe(false);
    expect(hayPendientes({ ...vacios, valores: { c1: "x" } })).toBe(true);
  });
});

describe("useCamposPersonalizados", () => {
  it("una función que no existe todavía (404) no es un error: el bloque se esconde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const { result } = renderHook(() => useCamposPersonalizados({ formulario: "qa.demo", registroId: "reg-1" }));
    await waitFor(() => expect(result.current.cargando).toBe(false));
    expect(result.current.disponible).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("la carga vieja no pisa el campo recién creado", async () => {
    let responderGet = (_: unknown) => {};
    const getLento = new Promise((res) => {
      responderGet = res;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(getLento) // GET inicial: vuelve tarde, con la lista SIN el campo nuevo
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ campo: campo({ id: "nuevo", nombre: "Color de cinta" }) }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCamposPersonalizados({ formulario: "qa.demo", registroId: "reg-1" }));

    await act(async () => {
      const r = await result.current.crear({ nombre: "Color de cinta", descripcion: "", tipo: "texto", opciones: [], soloEnEsteRegistro: false });
      expect(r.error).toBeNull();
    });
    expect(result.current.campos.map((c) => c.id)).toEqual(["nuevo"]);

    await act(async () => {
      responderGet({ ok: true, status: 200, json: async () => ({ campos: [], valores: [] }) });
      await getLento;
    });

    // Sin la guarda de `cambios`, acá la lista quedaba vacía.
    expect(result.current.campos.map((c) => c.id)).toEqual(["nuevo"]);
  });

  it("guardar manda lo tocado, incluido lo que se vació a propósito", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ campos: [campo()], valores: [{ campoId: "c1", valor: "Luis", valorNum: null, valorFecha: null }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ guardados: 1 }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCamposPersonalizados({ formulario: "qa.demo", registroId: "reg-1" }));
    await waitFor(() => expect(result.current.campos).toHaveLength(1));

    await act(async () => {
      const r = await result.current.guardarValores({ c1: "" });
      expect(r.ok).toBe(true);
    });

    expect(cuerpo(fetchMock, 1)).toEqual({ registroId: "reg-1", valores: [{ campoId: "c1", valor: "" }] });
    // La copia local queda como lo que se guardó, sin esperar otro GET.
    expect(result.current.valores.c1).toEqual({ campoId: "c1", valor: null, valorNum: null, valorFecha: null });
  });
});
