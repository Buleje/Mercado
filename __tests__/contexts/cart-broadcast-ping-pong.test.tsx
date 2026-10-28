/**
 * CartContext — ping-pong entre pestañas y escrituras antes de hidratar.
 *
 * Bug medido el 02-10 (memoria `carrito-dos-pestanas-ping-pong`): con dos
 * pestañas de la misma tienda el carrito se re-difundía sin fin por
 * BroadcastChannel y cada carga escribía `[]` encima de lo guardado.
 *
 * El test multipestaña de al lado no lo caza porque su canal falso entrega al
 * instante y con la MISMA referencia del array (React no ve cambio y no vuelve
 * a difundir). Este canal se porta como el de verdad:
 *   - entrega en una tarea aparte (setTimeout 0), no dentro del postMessage;
 *   - entrega una COPIA (structuredClone), como el navegador;
 *   - los destinatarios se fijan al momento de postMessage.
 * El tiempo corre con timers falsos en rondas de 10 ms, cada una dentro de
 * `act`, para que React pinte y corra sus efectos entre entrega y entrega.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Activity, StrictMode, type ReactNode } from "react";
import { CartProvider, useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";

const arroz: Product = { id: 10, name: "Arroz Paisano", category: "abarrotes", price: 4.5, image: "/arroz.jpg", unit: "kg" };
const azucar: Product = { id: 11, name: "Azúcar rubia", category: "abarrotes", price: 3.8, image: "/azucar.jpg", unit: "kg" };

// ── Canal con entrega asíncrona y copia estructurada ─────────────────────────
type Oyente = (evt: MessageEvent) => void;
const bus = new Map<string, Set<CanalComoElReal>>();
let difusiones: { canal: string; data: { type?: string; payload?: unknown; tabId?: string } }[] = [];
let siguienteId = 0;

class CanalComoElReal {
  name: string;
  private oyentes = new Set<Oyente>();
  private cerrado = false;
  private id = `pestana-${++siguienteId}`;

  constructor(name: string) {
    this.name = name;
    if (!bus.has(name)) bus.set(name, new Set());
    bus.get(name)!.add(this);
  }
  addEventListener(_t: "message", h: Oyente) { this.oyentes.add(h); }
  removeEventListener(_t: "message", h: Oyente) { this.oyentes.delete(h); }
  postMessage(data: unknown) {
    if (this.cerrado) throw new Error("InvalidStateError: canal cerrado");
    // TAB_ID es constante de módulo: en el test las dos "pestañas" comparten
    // módulo, así que se reemplaza por el id de este canal (en el navegador
    // cada pestaña tiene su propio módulo y su propio TAB_ID).
    const copia = structuredClone({ ...(data as Record<string, unknown>), tabId: this.id });
    difusiones.push({ canal: this.name, data: copia });
    const destinos = [...(bus.get(this.name) ?? [])].filter((p) => p !== this);
    for (const destino of destinos) {
      setTimeout(() => destino.entregar(structuredClone(copia)), 0);
    }
  }
  entregar(data: unknown) {
    if (this.cerrado) return;
    const evt = new MessageEvent("message", { data });
    for (const o of this.oyentes) o(evt);
  }
  close() {
    this.cerrado = true;
    bus.get(this.name)?.delete(this);
  }
}

// ── Espía de localStorage ────────────────────────────────────────────────────
let escrituras: { clave: string; valor: string }[] = [];
const setItemOriginal = Storage.prototype.setItem;

const SLUG = "tienda-pingpong";
const CLAVE = `buleje-${SLUG}-cart`;
const escriturasCarrito = () => escrituras.filter((e) => e.clave === CLAVE);
const escriturasVacias = () => escriturasCarrito().filter((e) => e.valor === "[]");
const difusionesCarrito = () => difusiones.filter((d) => d.data.type === "CART_UPDATE");
const guardado = () => JSON.parse(localStorage.getItem(CLAVE) ?? "null") as { id: number; quantity: number }[] | null;

beforeEach(() => {
  vi.useFakeTimers();
  bus.clear();
  difusiones = [];
  escrituras = [];
  localStorage.clear();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, clave: string, valor: string) {
    escrituras.push({ clave, valor });
    return setItemOriginal.call(this, clave, valor);
  });
  vi.stubGlobal("BroadcastChannel", CanalComoElReal);
  vi.stubGlobal("AudioContext", function SinAudio() {
    return {
      state: "running",
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => ({ connect: vi.fn(), type: "sine", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, start: vi.fn(), stop: vi.fn() })),
      createGain: vi.fn(() => ({ connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
      destination: {},
      currentTime: 0,
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const u = String(url);
      const cuerpo = u.includes("/api/products")
        ? [{ id: arroz.id }, { id: azucar.id }]
        : { existingIds: [arroz.id, azucar.id], missingIds: [] };
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function envoltorio({ estricto = false } = {}) {
  const Envoltorio = ({ children }: { children: ReactNode }) => {
    const proveedor = <CartProvider tenantSlug={SLUG}>{children}</CartProvider>;
    return estricto ? <StrictMode>{proveedor}</StrictMode> : proveedor;
  };
  return Envoltorio;
}

// `<Activity>` desconecta los efectos al ocultar y los vuelve a correr al
// mostrar, con el estado intacto (lo mismo que hace React en el navegador:
// medido 28-10, una re-corrida de efectos por carga en /t/main/tienda).
let modoActividad: "visible" | "hidden" = "visible";
function envoltorioConActividad() {
  const Envoltorio = ({ children }: { children: ReactNode }) => (
    <Activity mode={modoActividad}>
      <CartProvider tenantSlug={SLUG}>{children}</CartProvider>
    </Activity>
  );
  return Envoltorio;
}

/** Corre `ms` de reloj en rondas de 10 ms; React pinta y corre efectos entre ronda y ronda. */
async function correr(ms: number) {
  for (let t = 0; t < ms; t += 10) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
  }
}

describe("CartContext — sin ping-pong entre pestañas ni [] al cargar", () => {
  it("al montar con algo guardado no escribe [] ni lo difunde (ni el pendiente en 0)", async () => {
    setItemOriginal.call(localStorage, CLAVE, JSON.stringify([{ ...arroz, quantity: 2, storeSlug: SLUG }]));
    setItemOriginal.call(localStorage, `buleje-${SLUG}-pending`, "1");

    const pestana = renderHook(() => useCart(), { wrapper: envoltorio() });
    await correr(100);

    expect(escriturasVacias()).toHaveLength(0);
    expect(difusionesCarrito().filter((d) => Array.isArray(d.data.payload) && d.data.payload.length === 0)).toHaveLength(0);
    expect(escrituras.filter((e) => e.clave === `buleje-${SLUG}-pending` && e.valor === "0")).toHaveLength(0);
    expect(pestana.result.current.count).toBe(2);
    expect(pestana.result.current.hasPendingOrder).toBe(true);
    expect(guardado()).toEqual([expect.objectContaining({ id: arroz.id, quantity: 2 })]);
  });

  it("con StrictMode (dev) lo guardado sobrevive a la carga", async () => {
    setItemOriginal.call(localStorage, CLAVE, JSON.stringify([{ ...arroz, quantity: 3, storeSlug: SLUG }]));

    const pestana = renderHook(() => useCart(), { wrapper: envoltorio({ estricto: true }) });
    await correr(100);

    expect(escriturasVacias()).toHaveLength(0);
    expect(pestana.result.current.count).toBe(3);
    expect(guardado()).toEqual([expect.objectContaining({ id: arroz.id, quantity: 3 })]);
  });

  it("dos pestañas: un cambio en A llega a B y en 500 ms no hay más escrituras ni difusiones", async () => {
    const a = renderHook(() => useCart(), { wrapper: envoltorio() });
    const b = renderHook(() => useCart(), { wrapper: envoltorio() });
    await correr(100);
    escrituras = [];
    difusiones = [];

    await act(async () => {
      a.result.current.addItem(arroz);
    });
    await correr(500);

    // Sólo la escritura y la difusión del cambio; B no lo vuelve a guardar ni a difundir.
    expect({
      cuentaA: a.result.current.count,
      cuentaB: b.result.current.count,
      escrituras: escriturasCarrito().length,
      difusiones: difusionesCarrito().length,
    }).toEqual({ cuentaA: 1, cuentaB: 1, escrituras: 1, difusiones: 1 });
  });

  it("efectos que vuelven a correr (pestaña oculta y mostrada) no pisan lo que otra guardó", async () => {
    setItemOriginal.call(localStorage, CLAVE, JSON.stringify([{ ...arroz, quantity: 1, storeSlug: SLUG }]));
    modoActividad = "visible";
    const a = renderHook(() => useCart(), { wrapper: envoltorioConActividad() });
    const b = renderHook(() => useCart(), { wrapper: envoltorio() });
    await correr(100);

    // A se oculta (sus efectos se desconectan: no escucha el canal) y B agrega.
    modoActividad = "hidden";
    a.rerender();
    await correr(50);
    await act(async () => {
      b.result.current.addItem(azucar);
    });
    await correr(100);
    escrituras = [];
    difusiones = [];

    // A vuelve: relee lo guardado; no escribe su copia vieja encima.
    modoActividad = "visible";
    a.rerender();
    await correr(300);

    expect({
      cuentaA: a.result.current.count,
      cuentaB: b.result.current.count,
      guardado: guardado()?.map((i) => i.id).sort(),
      escrituras: escriturasCarrito().length,
      difusiones: difusionesCarrito().length,
    }).toEqual({ cuentaA: 2, cuentaB: 2, guardado: [arroz.id, azucar.id], escrituras: 0, difusiones: 0 });
  });

  it("dos pestañas: lo agregado en A y en B sigue en las dos tras recargarlas a la vez", async () => {
    const a = renderHook(() => useCart(), { wrapper: envoltorio() });
    const b = renderHook(() => useCart(), { wrapper: envoltorio() });
    await correr(100);

    await act(async () => {
      a.result.current.addItem(arroz);
    });
    await correr(100);
    await act(async () => {
      b.result.current.addItem(azucar);
    });
    await correr(100);
    expect({ cuentaA: a.result.current.count, difusionesAntes: difusionesCarrito().length }).toEqual({ cuentaA: 2, difusionesAntes: 2 });

    // Recargar las dos a la vez (p. ej. el recargado completo del dev server).
    a.unmount();
    b.unmount();
    escrituras = [];
    difusiones = [];
    let a2!: ReturnType<typeof renderHook<ReturnType<typeof useCart>, unknown>>;
    let b2!: typeof a2;
    await act(async () => {
      a2 = renderHook(() => useCart(), { wrapper: envoltorio() });
      b2 = renderHook(() => useCart(), { wrapper: envoltorio() });
    });
    await correr(500);

    // Recargar no es un cambio: nadie escribe ni difunde el carrito.
    expect({
      vaciasEscritas: escriturasVacias().length,
      cuentaA: a2.result.current.count,
      cuentaB: b2.result.current.count,
      guardado: guardado()?.map((i) => i.id).sort(),
      escrituras: escriturasCarrito().length,
      difusiones: difusionesCarrito().length,
    }).toEqual({ vaciasEscritas: 0, cuentaA: 2, cuentaB: 2, guardado: [arroz.id, azucar.id], escrituras: 0, difusiones: 0 });
  });

  it("vaciar en A (checkout pagado) con B abierta: B queda en 0 con 1 escritura y 1 difusión", async () => {
    /* Revisión 28-10: con HEAD, B se quedaba con lo que había y hubo 61 escrituras. */
    setItemOriginal.call(localStorage, CLAVE, JSON.stringify([{ ...arroz, quantity: 2, storeSlug: SLUG }]));
    const a = renderHook(() => useCart(), { wrapper: envoltorio() });
    const b = renderHook(() => useCart(), { wrapper: envoltorio() });
    await correr(100);
    escrituras = [];
    difusiones = [];

    await act(async () => {
      a.result.current.clear();
    });
    await correr(300);

    expect({
      cuentaA: a.result.current.count,
      cuentaB: b.result.current.count,
      guardado: guardado(),
      escrituras: escriturasCarrito().length,
      difusiones: difusionesCarrito().length,
    }).toEqual({ cuentaA: 0, cuentaB: 0, guardado: [], escrituras: 1, difusiones: 1 });
  });
});
