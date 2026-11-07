/**
 * «Entregar adelanto» (ADR-491): persona + monto + firma en un paso.
 *
 * Lo que se fija:
 *  - las 3 personas frecuentes salen como tarjetas y un toque la elige;
 *  - el teclado arma el monto (ceros, punto, dos decimales, borrar) y el pie dice «Entregar S/ 120.00»;
 *  - con firma obligatoria (cajero), «Entregar» no manda nada sin firma y dice qué falta;
 *  - la entrega va en multipart con `datos` (JSON) + `firma` (PNG);
 *  - un corte de red se reintenta con la MISMA `idempotencyKey` (no se entrega dos veces);
 *  - firma no guardada → «Reintentar firma» contra `POST …/firmas` con `entregaKey` = la clave de la entrega.
 *
 * El lienzo se reemplaza por un botón que «firma» (jsdom no dibuja canvas) y
 * `firmaEnCanvas` devuelve un PNG falso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PersonasEntregarRespuesta } from "@/lib/adelantos/entregar-tipos";

vi.mock("@/components/ui-system/LienzoFirma", () => ({
  default: ({ onCambio }: { onCambio: (t: { x: number; y: number }[][]) => void }) => (
    <button type="button" data-testid="firmar" onClick={() => onCambio([[{ x: 0.1, y: 0.25 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.3 }]])}>
      firmar
    </button>
  ),
}));
vi.mock("@/components/admin/adelantos/firma/hoja-firma", () => ({
  firmaEnCanvas: () => ({
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["png"], { type: "image/png" })),
    toDataURL: () => "data:image/png;base64,AAAA",
  }),
}));

import EntregarAdelantoModal from "@/components/admin/adelantos/entregar/EntregarAdelantoModal";
import { teclear } from "@/components/admin/adelantos/entregar/TecladoMonto";
import { borrarPedidoEntregar, leerPedidoEntregar } from "@/components/admin/adelantos/hooks/use-adelanto-en-url";

const persona = (id: string, nombre: string, ultimoMonto: number | null, documentoFinal: string | null = "45678901") => ({
  id,
  nombre,
  documentoFinal,
  tieneTelefono: true,
  ultimoMonto,
});

const CAJERO: PersonasEntregarRespuesta = {
  frecuentes: [persona("b1", "Juan Pérez", 150), persona("b2", "Rosa Díaz", 300), persona("b3", "Luis Soto", null)],
  resultados: [],
  porCodigo: null,
  codigoSinPersona: false,
  restringido: true,
  topeCajero: 500,
  firmaObligatoria: true,
  cajaAbierta: true,
};

const RESPUESTA_OK = {
  adelanto: { id: "a1", codigoOperacion: "ADL-2026-0024", monto: 120, moneda: "PEN", persona: "Juan Pérez", fechaAdelanto: "2026-10-10T15:00:00.000Z" },
  caja: { movimientoId: "m1" },
  firma: { guardada: true, id: "f1", sha256: "abc" },
  huella: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

type Llamada = { url: string; init?: RequestInit };
let llamadas: Llamada[] = [];
let respuestasEntregar: (() => Promise<Response>)[] = [];

function montar(ctx: PersonasEntregarRespuesta = CAJERO, extra?: (u: string, init?: RequestInit) => Response | null) {
  llamadas = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, init });
    const otra = extra?.(url, init);
    if (otra) return otra;
    if (url.startsWith("/api/adelantos/entregar/personas")) return jsonResponse(ctx);
    if (url === "/api/adelantos/entregar") {
      const r = respuestasEntregar.shift();
      return r ? r() : jsonResponse(RESPUESTA_OK, 201);
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
  const onEntregado = vi.fn();
  render(<EntregarAdelantoModal onClose={() => {}} onEntregado={onEntregado} />);
  return { onEntregado };
}

const posts = () => llamadas.filter((l) => l.init?.method === "POST");
const datosDe = (l: Llamada) => JSON.parse(String((l.init?.body as FormData).get("datos")));

async function elegirJuanY120() {
  const tarjeta = await waitFor(() => {
    const t = document.querySelector('[data-persona-frecuente="b1"]');
    if (!t) throw new Error("sin tarjetas");
    return t as HTMLElement;
  });
  fireEvent.click(tarjeta);
  for (const t of ["1", "2", "0"]) fireEvent.click(document.querySelector(`[data-tecla="${t}"]`) as HTMLElement);
}

beforeEach(() => {
  respuestasEntregar = [];
  window.sessionStorage.clear();
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("teclado del monto (puro)", () => {
  it("arma el número como se escribe la plata", () => {
    const escribir = (teclas: string[]) => teclas.reduce(teclear, "");
    expect(escribir(["0", "5"])).toBe("5");
    expect(escribir(["1", "2", "0"])).toBe("120");
    expect(escribir([".", "5"])).toBe("0.5");
    expect(escribir(["1", ".", "2", "5", "9"])).toBe("1.25");
    expect(escribir(["1", ".", "."])).toBe("1.");
    expect(escribir(["1", "2", "borrar"])).toBe("1");
    expect(escribir(Array(9).fill("9"))).toBe("9999999");
  });
});

describe("?accion=nuevo[&persona=] abre Entregar una vez", () => {
  it("lee la persona y, atendido, borra el pedido sin tocar el resto de la URL", () => {
    window.history.replaceState(null, "", "/admin?tab=plata&vista=adelantos&accion=nuevo&persona=b1");
    expect(leerPedidoEntregar()).toEqual({ persona: "b1" });
    borrarPedidoEntregar();
    expect(window.location.search).toBe("?tab=plata&vista=adelantos");
    expect(leerPedidoEntregar()).toBeNull();
    /* `accion=liquidar` no es de Entregar: no se toca. */
    window.history.replaceState(null, "", "/admin?tab=plata&vista=adelantos&accion=liquidar&persona=b1");
    expect(leerPedidoEntregar()).toBeNull();
    borrarPedidoEntregar();
    expect(window.location.search).toContain("accion=liquidar");
  });
});

describe("Entregar adelanto", () => {
  it("muestra las 3 frecuentes como tarjetas y el teclado arma «Entregar S/ 120.00»", async () => {
    montar();
    await waitFor(() => expect(document.querySelectorAll("[data-persona-frecuente]")).toHaveLength(3));
    expect(screen.getByText("Hasta S/ 500.00")).toBeTruthy();
    await elegirJuanY120();
    expect(document.querySelector('[data-persona-elegida="b1"]')).toBeTruthy();
    expect((document.querySelector("[data-monto-cifra]") as HTMLInputElement).value).toBe("S/ 120");
    expect(document.querySelector("[data-entregar]")?.textContent).toContain("Entregar S/ 120.00");
    /* Cajero: sin «No sale de la caja». */
    expect(document.querySelector('[data-metodo="sin-caja"]')).toBeNull();
  });

  it("con firma obligatoria, «Entregar» no manda nada sin firma y dice qué falta", async () => {
    montar();
    await elegirJuanY120();
    const boton = document.querySelector("[data-entregar]") as HTMLElement;
    expect(boton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(boton);
    expect(posts()).toHaveLength(0);
    expect(document.querySelector("[data-falta]")?.textContent).toContain("Falta la firma de Juan");
  });

  it("entrega en multipart con `datos` + `firma` y avisa al de atrás", async () => {
    const { onEntregado } = montar();
    await elegirJuanY120();
    fireEvent.click(screen.getByTestId("firmar"));
    const boton = document.querySelector("[data-entregar]") as HTMLElement;
    expect(boton.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(boton);
    await waitFor(() => expect(document.querySelector("[data-entrega-hecha]")).toBeTruthy());
    const [post] = posts();
    expect(post?.url).toBe("/api/adelantos/entregar");
    const fd = post?.init?.body as FormData;
    expect(fd.get("firma")).toBeInstanceOf(Blob);
    expect(fd.get("huella")).toBeNull();
    const datos = datosDe(post as Llamada);
    expect(datos).toMatchObject({ beneficiarioId: "b1", monto: 120, metodoCaja: "efectivo", firmante: { nombre: "Juan Pérez", documento: "45678901" } });
    expect(datos.trazos).toHaveLength(1);
    expect(datos.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(document.querySelector("[data-entrega-hecha]")?.textContent).toContain("ADL-2026-0024 · S/ 120.00 entregados a Juan");
    expect(onEntregado).toHaveBeenCalledTimes(1);
  });

  it("un corte de red se reintenta con la MISMA clave", async () => {
    respuestasEntregar = [() => Promise.reject(new Error("red")), () => Promise.resolve(jsonResponse({ ...RESPUESTA_OK, repetido: true }, 200))];
    montar();
    await elegirJuanY120();
    fireEvent.click(screen.getByTestId("firmar"));
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-error-entrega]")?.textContent).toContain("no se entrega dos veces"));
    /* Incierta: el monto queda fijo (cambiarlo daba 422 y, con clave nueva, otro adelanto). */
    const cinco = document.querySelector('[data-tecla="5"]') as HTMLButtonElement;
    expect(cinco.disabled).toBe(true);
    fireEvent.click(cinco);
    expect((document.querySelector("[data-monto-cifra]") as HTMLInputElement).value).toBe("S/ 120");
    expect(document.querySelector("[data-entregar]")?.textContent).toContain("Reintentar entrega de S/ 120.00");
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-entrega-hecha]")).toBeTruthy());
    const [primero, segundo] = posts();
    expect(datosDe(segundo as Llamada).idempotencyKey).toBe(datosDe(primero as Llamada).idempotencyKey);
    expect(document.querySelector("[data-entrega-hecha]")?.textContent).toContain("no se entregó dos veces");
  });

  it("cerrar con la entrega sin confirmar y reabrir retoma la MISMA clave, persona y monto", async () => {
    respuestasEntregar = [() => Promise.resolve(jsonResponse({ error: "Database error" }, 503))];
    montar();
    await elegirJuanY120();
    fireEvent.click(screen.getByTestId("firmar"));
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-descartar-pendiente]")).toBeTruthy());
    const [primero] = posts();
    cleanup();
    montar();
    await waitFor(() => expect(document.querySelector('[data-persona-elegida="b1"]')).toBeTruthy());
    expect((document.querySelector("[data-monto-cifra]") as HTMLInputElement).value).toBe("S/ 120");
    fireEvent.click(screen.getByTestId("firmar"));
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-entrega-hecha]")).toBeTruthy());
    const [segundo] = posts();
    expect(datosDe(segundo as Llamada).idempotencyKey).toBe(datosDe(primero as Llamada).idempotencyKey);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("un 422 `idempotencia_distinta` muestra lo ya registrado y NO cambia la clave sin «Es otra entrega»", async () => {
    respuestasEntregar = [
      () => Promise.resolve(jsonResponse({ code: "idempotencia_distinta", error: "x", existente: { codigoOperacion: "ADL-2026-0023", monto: 150, moneda: "PEN", persona: "Juan Pérez" } }, 422)),
    ];
    const { onEntregado } = montar();
    await elegirJuanY120();
    fireEvent.click(screen.getByTestId("firmar"));
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-ya-registrado]")?.textContent).toContain("Ya se registró ADL-2026-0023 · S/ 150.00 a Juan"));
    expect(document.querySelector("[data-entregar]")).toBeNull();
    expect(onEntregado).toHaveBeenCalledWith(null);
    fireEvent.click(document.querySelector("[data-es-otra-entrega]") as HTMLElement);
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-entrega-hecha]")).toBeTruthy());
    const [primero, segundo] = posts();
    expect(datosDe(segundo as Llamada).idempotencyKey).not.toBe(datosDe(primero as Llamada).idempotencyKey);
  });

  it("el tope del cajero se explica con el código de la ruta", async () => {
    respuestasEntregar = [() => Promise.resolve(jsonResponse({ code: "supera_tope_cajero", error: "x", tope: 100 }, 403))];
    montar();
    await elegirJuanY120();
    fireEvent.click(screen.getByTestId("firmar"));
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-error-entrega]")?.textContent).toContain("Pasa tu tope de S/ 100.00"));
  });

  it("firma no guardada → «Reintentar firma» con `entregaKey` = la clave de la entrega", async () => {
    respuestasEntregar = [() => Promise.resolve(jsonResponse({ ...RESPUESTA_OK, firma: { guardada: false, motivo: "storage" } }, 201))];
    montar(CAJERO, (url) => (url === "/api/adelantos/a1/firmas" ? jsonResponse({ firma: { guardada: true, id: "f9", sha256: "x" }, huella: null }, 201) : null));
    await elegirJuanY120();
    fireEvent.click(screen.getByTestId("firmar"));
    fireEvent.click(document.querySelector("[data-entregar]") as HTMLElement);
    const reintentar = await waitFor(() => {
      const b = document.querySelector("[data-reintentar-firma]");
      if (!b) throw new Error("sin reintentar");
      return b as HTMLElement;
    });
    fireEvent.click(reintentar);
    await waitFor(() => expect(document.querySelector("[data-reintentar-firma]")).toBeNull());
    const [entrega, firma] = posts();
    expect(firma?.url).toBe("/api/adelantos/a1/firmas");
    const datos = datosDe(firma as Llamada);
    expect(datos.entregaKey).toBe(datosDe(entrega as Llamada).idempotencyKey);
    expect(datos.idempotencyKey).not.toBe(datos.entregaKey);
    expect((firma?.init?.body as FormData).get("firma")).toBeInstanceOf(Blob);
  });

  it("sin caja abierta, el cajero ve «Abre la caja primero» con el enlace a la caja", async () => {
    montar({ ...CAJERO, cajaAbierta: false });
    await waitFor(() => expect(document.querySelector("[data-aviso-sin-caja]")).toBeTruthy());
    const enlace = document.querySelector("[data-aviso-sin-caja] a") as HTMLAnchorElement;
    expect(enlace.getAttribute("href")).toBe("/admin?tab=ventas-caja&vista=caja-registradora&sub=hoy");
  });
});
