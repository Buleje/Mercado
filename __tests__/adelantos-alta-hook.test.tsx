/**
 * El alta «Nuevo adelanto» (ADR-448) contra los seis defectos que encontró la
 * revisión del 28-09 (U1–U6). Cada caso falla si el defecto vuelve:
 *
 *  U1 abono a UN adelanto por más de lo que debe → el panel lo proyecta contra
 *     ese adelanto y avisa lo que queda «a favor suyo».
 *  U2 abono a un adelanto con plan → lleva la cuota (`pactadaId`).
 *  U3 los pt de «Doy plata» no viajan escondidos en un préstamo.
 *  U4 respuesta perdida + monto cambiado → misma clave, y el `repetido` se
 *     dice («ya estaba registrado»), no se cierra como si fuera nuevo.
 *  U5 fallan los campos personalizados → el aviso va a `err` y el botón
 *     REINTENTA los campos sin volver a crear el adelanto.
 *  U6 servicio: la tarifa llega después de tipear los pt → el monto se calcula.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { abonablesDe, cuentaDePersona, cuerpoAbonoEntrega, cuerpoAdelanto, proyeccionCuenta } from "@/lib/adelantos/modos-alta";
import { mensajeDeValidacion, puedeCambiarDeClave } from "@/components/admin/adelantos/hooks/enviar-alta";
import { datosDelComprobante } from "@/components/admin/adelantos/detalle/comprobante-del-adelanto";
import { textosDelComprobante } from "@/lib/adelantos/comprobante";

const camposMock = { falla: false };
vi.mock("@/components/admin/shared/CamposPersonalizados", () => ({
  default: () => null,
  pendientesVacios: () => ({ x: 1 }),
  hayPendientes: () => true,
  guardarValoresPendientes: async () => ({ errores: camposMock.falla ? ["Color: no se pudo"] : [] }),
}));

import { useAltaAdelanto } from "@/components/admin/adelantos/hooks/use-alta-adelanto";

const persona = (extra: Record<string, unknown> = {}) =>
  ({
    id: "b1", nombre: "WASACO", activo: true, limiteCredito: null, telefono: null,
    saldoPendiente: {}, saldoAFavor: {}, totalAdelantado: {}, totalEntregado: {},
    adelantosAbiertos: 0, adelantosLiquidados: 0, adelantosCancelados: 0, ultimoAdelanto: null,
    ...extra,
  }) as never;

const ad = (id: string, saldo: number, extra: Record<string, unknown> = {}) => ({
  id, beneficiarioId: "b1", codigoOperacion: `ADL-${id}`, fechaAdelanto: `2026-09-2${id}T12:00:00.000Z`,
  saldoPendiente: saldo, montoAdelantado: saldo, moneda: "PEN", modalidad: "CUENTA_CORRIENTE", status: "ABIERTO",
  entregasPactadas: [] as { id: string; numero?: number; valorEsperado?: number; cumplidaEn?: string | null }[],
  entregas: [], direccion: "DADO", ...extra,
});

const BASE_ABONO = { metodoCaja: "efectivo", fecha: "2026-09-28", hoy: "2026-09-28", notas: "", reciboManual: "", comprobante: null };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  camposMock.falla = false;
});

describe("A448 UI — el alta no repite los defectos de la revisión", () => {
  it("U1 abono de 150 a ADL-1 (debe 100): baja 100 y avisa 50 a favor suyo", () => {
    const adelantos = [ad("1", 100), ad("2", 200)];
    const ab = abonablesDe(adelantos, "b1");
    expect(ab.elegibles.map((a) => a.id)).toEqual(["1", "2"]);
    const cuenta = cuentaDePersona({ saldoPendiente: { PEN: 300 }, saldoAFavor: {} });
    const elegido = ab.elegibles[0];
    const p = proyeccionCuenta("abono", cuenta, 150, "PEN", elegido.saldo);
    expect(p).toMatchObject({ antes: 300, despues: 200, cruza: true, excedente: 50 });
  });

  it("U1b en el hook: «Elegir uno» proyecta contra el elegido", () => {
    const adelantos = [ad("1", 100), ad("2", 200)] as never;
    const { result } = renderHook(() =>
      useAltaAdelanto({ beneficiarios: [persona({ saldoPendiente: { PEN: 300 } })], adelantos, admiteRecibido: true, onCreated: () => {} }),
    );
    act(() => result.current.setModo("abono"));
    act(() => result.current.abono.setDestino("1"));
    act(() => result.current.setMonto("150"));
    expect(result.current.proyeccion).toMatchObject({ despues: 200, excedente: 50, cruza: true });
  });

  it("U2 abono a un adelanto con cuotas: lleva la cuota que cumple", () => {
    const b = cuerpoAbonoEntrega({ ...BASE_ABONO, monto: 100, pactadaId: "c1" });
    expect(b).toMatchObject({ pactadaId: "c1" });
    const conPlan = ad("1", 200, { modalidad: "ENTREGAS_PACTADAS", entregasPactadas: [{ id: "c2", numero: 2, valorEsperado: 100 }, { id: "c1", numero: 1, valorEsperado: 100, cumplidaEn: "2026-09-10" }] });
    expect(abonablesDe([conPlan], "b1").elegibles[0].cuotas.map((c) => c.id)).toEqual(["c2"]);
  });

  it("U2b en el hook: «Elegir uno» con plan manda la primera cuota sin cumplir", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("/entregas")) cuerpos.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "a1", caja: null }), { status: 201 });
    });
    const conPlan = ad("1", 200, { modalidad: "ENTREGAS_PACTADAS", entregasPactadas: [{ id: "c7", numero: 1, valorEsperado: 100 }] });
    const { result } = renderHook(() =>
      useAltaAdelanto({ beneficiarios: [persona({ saldoPendiente: { PEN: 200 } })], adelantos: [conPlan] as never, admiteRecibido: true, onCreated: () => {} }),
    );
    act(() => result.current.setModo("abono"));
    act(() => result.current.setMonto("100"));
    await act(async () => { await result.current.submit(); });
    expect(cuerpos[0]).toMatchObject({ pactadaId: "c7", valorManual: 100 });
    expect(typeof cuerpos[0].idempotencyKey).toBe("string");
  });

  it("U3 los pt COMPRADO de «Doy plata» no viajan en «Me prestan plata»", () => {
    const b = cuerpoAdelanto({
      modo: "prestamo", beneficiarioId: "b1", modalidad: "CUENTA_CORRIENTE", monto: 1000, moneda: "PEN", fecha: "2026-09-28", hoy: "2026-09-28",
      vencimiento: "", notas: "", reciboManual: "", metodoCaja: "efectivo", comprobante: null, forzarLimite: false, plan: [],
      piesTablares: "500", piesTablaresTipo: "COMPRADO", contratoId: null,
    });
    expect(b).toMatchObject({ direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO" });
    expect(b.piesTablares).toBeUndefined();
    expect(b.piesTablaresTipo).toBeUndefined();
  });

  it("U4 respuesta perdida + monto cambiado: misma clave, y el repetido se dice", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url) === "/api/adelantos") {
        cuerpos.push(JSON.parse(String(init?.body)));
        n += 1;
        if (n === 1) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify({ id: "a1", codigoOperacion: "ADL-2026-0040", montoAdelantado: 500, repetido: true, caja: null, direccion: "DADO" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    const onCreated = vi.fn();
    const { result } = renderHook(() => useAltaAdelanto({ beneficiarios: [persona()], adelantos: [], admiteRecibido: true, onCreated }));
    act(() => result.current.setMonto("500"));
    await act(async () => { await result.current.submit(); });
    expect(result.current.err).toBe("No se pudo guardar. Revisa la conexión.");
    act(() => result.current.setMonto("600"));
    await act(async () => { await result.current.submit(); });
    expect(cuerpos[1].montoAdelantado).toBe(600);
    expect(cuerpos[1].idempotencyKey).toBe(cuerpos[0].idempotencyKey);
    expect(onCreated).not.toHaveBeenCalled();
    expect(result.current.hecho).toMatch(/Ya estaba registrado ADL-2026-0040 por S\/ 500/);
    expect(result.current.hecho).toMatch(/monto nuevo no se guardó/);
    expect(result.current.registrado).toBe(true);
  });

  it("U4b la clave cambia sólo ante un 4xx: un 502 pudo haber guardado", () => {
    expect(puedeCambiarDeClave({ status: 400 })).toBe(true);
    expect(puedeCambiarDeClave({ status: 502 })).toBe(false);
    expect(puedeCambiarDeClave({})).toBe(false);
    expect(puedeCambiarDeClave({ status: 422, codigo: "idempotencia_distinta" })).toBe(false);
  });

  it("U5 fallan los campos personalizados: aviso en err y el botón los reintenta sin crear otro", async () => {
    let posts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url) === "/api/adelantos") { posts += 1; return new Response(JSON.stringify({ id: "a9", caja: null, direccion: "DADO" }), { status: 201 }); }
      return new Response("{}", { status: 200 });
    });
    camposMock.falla = true;
    const onCreated = vi.fn();
    const { result } = renderHook(() => useAltaAdelanto({ beneficiarios: [persona()], adelantos: [], admiteRecibido: true, onCreated }));
    act(() => result.current.setMonto("100"));
    await act(async () => { await result.current.submit(); });
    expect(result.current.err).toMatch(/campos personalizados no/);
    expect(result.current.hecho).toBeNull();
    expect(result.current.camposPorReintentar).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
    camposMock.falla = false;
    await act(async () => { await result.current.submit(); });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(posts).toBe(1);
  });

  it("U6 servicio: los pt tipeados antes de que llegue la tarifa calculan el monto", async () => {
    let soltar: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).startsWith("/api/admin/forestal/tarifas-cliente")) return new Promise<Response>((r) => { soltar = r; });
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    const { result } = renderHook(() =>
      useAltaAdelanto({ beneficiarios: [persona({ forestPartyId: "p1" })], adelantos: [], admiteRecibido: true, onCreated: () => {} }),
    );
    act(() => result.current.setModo("servicio"));
    act(() => result.current.servicio.setPt("3462"));
    await act(async () => {
      soltar(new Response(JSON.stringify({ tarifas: [{ servicio: "aserrio", vigenteDesde: "2026-01-01", basePt: 0.5 }] }), { status: 200 }));
    });
    await waitFor(() => expect(result.current.servicio.precioPt).toBe("0.5"));
    expect(result.current.monto).toBe("1731");
    expect(result.current.problema).toBeNull();
  });

  it("recibo de un RECIBIDO: «Recibí de» la persona y firma el negocio, con su nombre", () => {
    const a = { ...ad("3", 50, { direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" }), beneficiario: { id: "b1", nombre: "WASACO", activo: true, createdAt: "" } };
    const t = textosDelComprobante(datosDelComprobante(a as never, "Inversiones Blas"));
    expect(t.recibiDe).toBe("WASACO");
    expect(t.nombre).toBe("Inversiones Blas");
    expect(t.firmaDerecha).toMatch(/Inversiones Blas/);
    const dado = textosDelComprobante(datosDelComprobante({ ...a, direccion: "DADO", conceptoRecibido: null } as never, "Inversiones Blas"));
    expect(dado.recibiDe).toBe("Inversiones Blas");
  });

  it("validación del servidor: lo propio en español pasa tal cual, lo de Zod en inglés se traduce", () => {
    expect(mensajeDeValidacion("Elige si te adelantaron por un servicio o te prestaron plata.")).toMatch(/^Elige/);
    expect(mensajeDeValidacion({ path: "notas", message: "Too big: expected string to have <=500 characters" })).toMatch(/Revisa las notas/);
    expect(mensajeDeValidacion("Invalid input")).toMatch(/Algún dato no es válido/);
  });
});
