// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
// @ts-nocheck
// @vitest-environment node
/**
 * Lo anotado por Telegram → panel de Blas (01-11): una fila del Excel se graba UNA vez (la clave de la fila es la
 * idempotencia), nunca a una persona adivinada, nunca encima de un movimiento igual sin «Es otro», y a seco no escribe.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { categoriaGasto, masParecidas, registroTelegram, revisarFila, RUTAS } from "../../tools/mcp-buleje/registro-telegram.mjs";

const config = {
  base: "http://localhost:3000",
  porDefecto: "bodega",
  seco: false,
  negocios: {
    bodega: { slug: "main", usuario: "claude", clave: "x" },
    blas: { slug: "inversiones-agroforestales-blas", usuario: "claude", clave: "x" },
  },
};
const CLAVE = "tg-2026-10-26-f7-a1b2c3d4";
const fila = (extra = {}) => ({ clave: CLAVE, tipo: "Adelanto", persona: "Victor", monto: 200, detalle: "adelanto por trozas", fecha: "2026-11-01T14:30", semana: "Semana 1 (26-oct al 1-nov)", fila: 7, ...extra });
const PERSONAS = [
  { id: "p1", nombre: "MAMA DE ALEX", activo: true },
  { id: "p2", nombre: "Quispe Galindo  Victor", activo: true },
  { id: "p3", nombre: "Wasaco", activo: true },
  { id: "p4", nombre: "PRUEBA TEST - Juan Perez", activo: false },
];

let dir;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "tg-registro-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

/** Panel de mentira: login con cookie; lo demás según `rutas(url, init)`. Junta los pedidos para mirarlos. */
function panel(rutas) {
  const pedidos = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname.startsWith("/api/auth/")) {
      return new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "buleje-admin-sess=s1; Path=/; HttpOnly" } });
    }
    const cuerpo = init.body ? JSON.parse(String(init.body)) : undefined;
    pedidos.push({ metodo: init.method ?? "GET", ruta: u.pathname, query: Object.fromEntries(u.searchParams), cuerpo });
    return rutas(u, init, cuerpo);
  };
  return { fetch, pedidos, escrituras: () => pedidos.filter((p) => p.metodo !== "GET") };
}

const HOY = Date.parse("2026-11-01T20:00:00Z"); // 15:00 en Lima, el mismo día de las filas de prueba
const correr = (args, f, p, deps = {}) =>
  registroTelegram(["pasar", "--negocio=blas", "--quien=1 @brandon", ...args], {
    config, fetch: p.fetch, puertoAbierto: async () => true, carpetaSesiones: join(dir, "s"), entrada: JSON.stringify(f), anotar: () => undefined, ahora: () => HOY, ...deps,
  });

/** Panel con personas, adelantos, gastos y cajas fijos; los POST responden lo que dice `alta`. */
function panelBlas({ adelantos = [], gastos = [], cajas = [{ id: "c1", status: "abierta", openedAt: "2026-06-11T02:41:20Z" }], movimientos = [], alta = {} } = {}) {
  return panel((u, init) => {
    const m = init.method ?? "GET";
    if (m === "GET" && u.pathname === RUTAS.personas) return json(PERSONAS);
    if (m === "GET" && u.pathname === RUTAS.adelantos) return json(adelantos.filter((x) => !u.searchParams.get("beneficiarioId") || x.beneficiarioId === u.searchParams.get("beneficiarioId")));
    if (m === "GET" && u.pathname === RUTAS.gastos) return json(gastos);
    if (m === "GET" && u.pathname === RUTAS.cajas) return json(cajas);
    if (m === "GET" && u.pathname === RUTAS.movimientos) return json(movimientos);
    if (m === "POST" && u.pathname === RUTAS.personas) return json({ id: "nueva1", nombre: "Hermano Alex" }, 201);
    if (m === "POST" && u.pathname === RUTAS.adelantos) return json(alta.adelanto ?? { id: "a9", codigoOperacion: "ADL-2026-0009" }, alta.adelantoStatus ?? 201);
    if (m === "POST" && u.pathname === RUTAS.gastos) return json({ id: "g1" }, 201);
    if (m === "POST" && u.pathname === RUTAS.movimientos) return json({ id: "m1" }, 201);
    return json({ error: "no" }, 404);
  });
}

describe("revisarFila", () => {
  it("rechaza lo que no sirve sin completarlo a ojo", () => {
    expect(revisarFila(fila()).ok).toBe(true);
    expect(revisarFila(fila({ clave: "tg-x" })).ok).toBe(false);
    expect(revisarFila(fila({ tipo: "Pago" })).ok).toBe(false);
    expect(revisarFila(fila({ monto: 0 })).ok).toBe(false);
    expect(revisarFila(fila({ monto: "abc" })).ok).toBe(false);
    expect(revisarFila(fila({ fecha: "2026-02-30T10:00" })).ok).toBe(false);
    expect(revisarFila(fila({ fecha: "2026-11-01" })).ok).toBe(false);
    expect(revisarFila(fila({ persona: "" })).ok).toBe(false);
    expect(revisarFila(fila({ tipo: "Gasto", persona: "" })).ok).toBe(true);
  });
  it("la fecha es la de Lima, con su hora", () => {
    const r = revisarFila(fila({ fecha: "2026-11-01T23:30" }));
    expect(r.ok && r.fila.iso).toBe("2026-11-01T23:30:00-05:00");
    expect(r.ok && r.fila.dia).toBe("2026-11-01");
  });
});

describe("parecidos y categorías", () => {
  it("«Victor» encuentra primero a Quispe Galindo Victor", () => {
    expect(masParecidas(PERSONAS.filter((p) => p.activo), "Victor")[0]).toMatchObject({ id: "p2" });
    expect(masParecidas(PERSONAS.filter((p) => p.activo), "Mamá de Alex")[0]).toMatchObject({ id: "p1" });
  });
  it("la categoría del gasto sale de las palabras", () => {
    expect(categoriaGasto("combustible para el camión")).toBe("Transporte");
    expect(categoriaGasto("repuesto de la sierra")).toBe("Mantenimiento");
    expect(categoriaGasto("almuerzo de los trabajadores")).toBe("Personal");
    expect(categoriaGasto("cosas varias")).toBe("Otros");
  });
});

describe("registro-telegram.mjs pasar", () => {
  it("solo Blas o el negocio de pruebas", async () => {
    const p = panelBlas();
    const r = await registroTelegram(["pasar", "--negocio=bodega"], { config, fetch: p.fetch, puertoAbierto: async () => true, entrada: JSON.stringify(fila()), anotar: () => undefined, ahora: () => HOY });
    expect(r).toMatchObject({ ok: false, error: "argumentos" });
    expect(p.pedidos).toHaveLength(0);
  });

  it("adelanto con la persona exacta: una escritura, con la clave como idempotencia y sin tocar la caja", async () => {
    const p = panelBlas();
    const r = await correr([], fila({ persona: "mamá de alex" }), p);
    expect(r).toMatchObject({ ok: true, hecho: "grabado", destino: "adelantos", codigo: "ADL-2026-0009", persona: { id: "p1" } });
    const [w] = p.escrituras();
    expect(p.escrituras()).toHaveLength(1);
    expect(w).toMatchObject({ ruta: "/api/adelantos", cuerpo: { beneficiarioId: "p1", montoAdelantado: 200, idempotencyKey: CLAVE, direccion: "DADO", fechaAdelanto: "2026-11-01T14:30:00-05:00" } });
    expect(w.cuerpo.metodoCaja).toBeUndefined();
    expect(w.cuerpo.notas).toContain(CLAVE);
  });

  it("sin coincidencia exacta NO graba: devuelve las parecidas (las que no se parecen en nada, no)", async () => {
    const p = panelBlas();
    const r = await correr([], fila(), p);
    expect(r).toMatchObject({ ok: false, error: "persona", repetidos: false });
    expect(r.parecidas[0]).toMatchObject({ id: "p2", nombre: "Quispe Galindo Victor" });
    expect(r.parecidas.map((x) => x.id)).not.toContain("p3"); // «Wasaco» no se parece a «Victor»
    expect(r.parecidas.map((x) => x.id)).not.toContain("p4"); // la inactiva no se ofrece
    expect(p.escrituras()).toHaveLength(0);
  });

  it("dos personas con el mismo nombre: pregunta con el documento y marca «repetidos» (no se recuerda)", async () => {
    const p = panel((u, init) => ((init.method ?? "GET") === "GET" && u.pathname === RUTAS.personas
      ? json([{ id: "j1", nombre: "Juan Perez", documento: "40114521", activo: true }, { id: "j2", nombre: "JUAN PÉREZ", documento: "45556677", activo: true }])
      : json({ id: "a1" }, 201)));
    const r = await correr([], fila({ persona: "juan perez" }), p);
    expect(r).toMatchObject({ ok: false, error: "persona", repetidos: true });
    expect(r.parecidas.map((x) => x.documento)).toEqual(["40114521", "45556677"]);
    expect(p.escrituras()).toHaveLength(0);
  });

  it("la persona de la vez pasada no gana a una que se llama EXACTO como lo dijo Brandon", async () => {
    const p = panelBlas();
    const r = await correr(["--beneficiario=p2", "--recordada"], fila({ persona: "Wasaco" }), p);
    expect(r).toMatchObject({ ok: false, error: "persona" });
    expect(r.parecidas.map((x) => x.id)).toEqual(["p2", "p3"]);
    expect(p.escrituras()).toHaveLength(0);
    // sin una exacta distinta, la recordada sirve
    expect(await correr(["--beneficiario=p2", "--recordada"], fila({ persona: "Victor" }), panelBlas())).toMatchObject({ ok: true, persona: { id: "p2" } });
  });

  it("«Otra persona» (--preguntar): nunca elige sola aunque haya una exacta, y no ofrece la rechazada", async () => {
    const p = panelBlas();
    const r = await correr(["--preguntar", "--excluir=p3"], fila({ persona: "Wasaco" }), p);
    expect(r).toMatchObject({ ok: false, error: "persona" });
    expect(r.parecidas.map((x) => x.id)).not.toContain("p3");
    const q = panelBlas();
    const r2 = await correr(["--preguntar", "--excluir=p2"], fila({ persona: "Wasaco" }), q);
    expect(r2.parecidas[0]).toMatchObject({ id: "p3" }); // la exacta se ofrece, pero no se graba sola
    expect([...p.escrituras(), ...q.escrituras()]).toHaveLength(0);
  });

  it("un corte DESPUÉS de mandar la escritura = «incierto» (el buzón espera y vuelve a mirar)", async () => {
    const p = panel((u, init) => {
      if ((init.method ?? "GET") !== "GET") { const e = new Error("tiempo"); e.name = "TimeoutError"; throw e; }
      return json([]);
    });
    expect(await correr([], fila({ tipo: "Gasto" }), p)).toMatchObject({ ok: false, error: "incierto" });
  });

  it("si las lecturas tardaron más de 100 s, no empieza a escribir", async () => {
    let t = HOY;
    const p = panelBlas();
    const r = await correr([], fila({ tipo: "Gasto" }), p, { ahora: () => (t += 120_000) });
    expect(r).toMatchObject({ ok: false, error: "servidor" });
    expect(p.escrituras()).toHaveLength(0);
  });

  it("la persona elegida tiene que existir y estar activa", async () => {
    const p = panelBlas();
    expect(await correr(["--beneficiario=p2"], fila(), p)).toMatchObject({ ok: true, persona: { id: "p2" } });
    const q = panelBlas();
    expect(await correr(["--beneficiario=p4"], fila(), q)).toMatchObject({ ok: false, error: "persona" });
    expect(q.escrituras()).toHaveLength(0);
  });

  it("si ya pasó (la clave está en las notas) no escribe otra vez", async () => {
    const p = panelBlas({ adelantos: [{ id: "a5", beneficiarioId: "p2", codigoOperacion: "ADL-2026-0005", montoAdelantado: 200, fechaAdelanto: "2026-11-01T19:30:00Z", status: "ABIERTO", direccion: "DADO", notas: `x · ${CLAVE}` }] });
    const r = await correr(["--beneficiario=p2"], fila(), p);
    expect(r).toMatchObject({ ok: true, hecho: "ya_estaba", codigo: "ADL-2026-0005" });
    expect(p.escrituras()).toHaveLength(0);
  });

  it("un adelanto igual (persona, monto y día) sin la clave = posible duplicado; con --forzar se graba", async () => {
    const otro = { id: "a6", beneficiarioId: "p2", codigoOperacion: "ADL-2026-0006", montoAdelantado: 200, fechaAdelanto: "2026-11-01T20:00:00Z", status: "ABIERTO", direccion: "DADO", notas: "a mano" };
    const p = panelBlas({ adelantos: [otro] });
    const r = await correr(["--beneficiario=p2"], fila(), p);
    expect(r).toMatchObject({ ok: false, error: "duplicado", duplicado: { codigo: "ADL-2026-0006", dia: "2026-11-01" } });
    expect(p.escrituras()).toHaveLength(0);
    const q = panelBlas({ adelantos: [otro] });
    expect(await correr(["--beneficiario=p2", "--forzar"], fila(), q)).toMatchObject({ ok: true, hecho: "grabado" });
    // uno anulado o de otro día no cuenta como duplicado
    const s = panelBlas({ adelantos: [{ ...otro, status: "CANCELADO" }, { ...otro, id: "a7", fechaAdelanto: "2026-10-31T20:00:00Z" }] });
    expect(await correr(["--beneficiario=p2"], fila(), s)).toMatchObject({ ok: true, hecho: "grabado" });
  });

  it("persona nueva: la crea y le da el adelanto (2 escrituras)", async () => {
    const p = panelBlas();
    const r = await correr(["--persona-nueva"], fila({ persona: "Hermano Alex" }), p);
    expect(r).toMatchObject({ ok: true, hecho: "grabado", personaNueva: true, persona: { id: "nueva1" } });
    expect(p.escrituras().map((w) => w.ruta)).toEqual(["/api/adelantos/beneficiarios", "/api/adelantos"]);
    expect(p.escrituras()[1].cuerpo.beneficiarioId).toBe("nueva1");
  });

  it("el panel repite (misma idempotencyKey) → «ya estaba»", async () => {
    const p = panelBlas({ alta: { adelanto: { id: "a9", codigoOperacion: "ADL-2026-0009", repetido: true }, adelantoStatus: 200 } });
    expect(await correr(["--beneficiario=p2"], fila(), p)).toMatchObject({ ok: true, hecho: "ya_estaba", codigo: "ADL-2026-0009" });
  });

  it("gasto: al módulo Gastos sin sacar de la caja, con la clave en las notas", async () => {
    const p = panelBlas();
    const r = await correr([], fila({ tipo: "Gasto", persona: "", detalle: "combustible del camión", monto: 50 }), p);
    expect(r).toMatchObject({ ok: true, hecho: "grabado", destino: "gastos", categoria: "Transporte" });
    const [w] = p.escrituras();
    expect(w).toMatchObject({ ruta: "/api/expenses", cuerpo: { amount: 50, salidaDeCaja: false, category: "Transporte", date: "2026-11-01T14:30:00-05:00" } });
    expect(w.cuerpo.notes).toContain(CLAVE);
    expect(p.pedidos.find((x) => x.ruta === "/api/expenses" && x.metodo === "GET").query).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
  });

  it("gasto ya pasado o igual del mismo día", async () => {
    const ya = panelBlas({ gastos: [{ id: "g0", amount: 50, notes: `Anotado · ${CLAVE}`, recurring: false }] });
    expect(await correr([], fila({ tipo: "Gasto", monto: 50 }), ya)).toMatchObject({ ok: true, hecho: "ya_estaba", id: "g0" });
    const igual = panelBlas({ gastos: [{ id: "g2", amount: 50, notes: null, recurring: false, description: "combustible" }] });
    expect(await correr([], fila({ tipo: "Gasto", monto: 50 }), igual)).toMatchObject({ ok: false, error: "duplicado" });
    expect(igual.escrituras()).toHaveLength(0);
    // una plantilla de gasto fijo no es un gasto del día
    const plantilla = panelBlas({ gastos: [{ id: "g3", amount: 50, recurring: true }] });
    expect(await correr([], fila({ tipo: "Gasto", monto: 50 }), plantilla)).toMatchObject({ ok: true, hecho: "grabado" });
  });

  it("ingreso: a la caja abierta más nueva, con la clave en la descripción", async () => {
    const p = panelBlas({ cajas: [{ id: "vieja", status: "abierta", openedAt: "2026-06-01T00:00:00Z" }, { id: "nueva", status: "abierta", openedAt: "2026-10-01T00:00:00Z" }, { id: "cerrada", status: "cerrada", openedAt: "2026-10-30T00:00:00Z" }] });
    const r = await correr([], fila({ tipo: "Ingreso", persona: "Ronal", detalle: "me pagaron por la madera", monto: 1500 }), p);
    expect(r).toMatchObject({ ok: true, hecho: "grabado", destino: "caja", caja: "nueva" });
    const [w] = p.escrituras();
    expect(w).toMatchObject({ ruta: "/api/cash-registers/movements", cuerpo: { cashRegisterId: "nueva", type: "ingreso", amount: 1500 } });
    expect(w.cuerpo.descripcion).toContain(CLAVE);
    expect(w.cuerpo.descripcion).toContain("del 01/11 14:30");
  });

  it("ingreso: la clave se busca también en una caja ya cerrada", async () => {
    const p = panelBlas({ cajas: [{ id: "cerrada", status: "cerrada", openedAt: "2026-10-30T00:00:00Z", movements: [{ id: "m9", type: "ingreso", amount: 200, description: `x · ${CLAVE}` }] }, { id: "c1", status: "abierta", openedAt: "2026-10-31T00:00:00Z", movements: [] }] });
    expect(await correr([], fila({ tipo: "Ingreso" }), p)).toMatchObject({ ok: true, hecho: "ya_estaba", id: "m9", caja: "cerrada" });
    expect(p.escrituras()).toHaveLength(0);
  });

  it("ingreso de otro día: la caja lo fecharía hoy → pregunta; con --otro-dia se graba", async () => {
    const otroDia = { ahora: () => Date.parse("2026-11-03T15:00:00Z") };
    const p = panelBlas();
    expect(await correr([], fila({ tipo: "Ingreso" }), p, otroDia)).toMatchObject({ ok: false, error: "otro_dia" });
    expect(p.escrituras()).toHaveLength(0);
    expect(await correr(["--otro-dia"], fila({ tipo: "Ingreso" }), panelBlas(), otroDia)).toMatchObject({ ok: true, hecho: "grabado" });
    // el adelanto y el gasto llevan su propia fecha: no preguntan
    expect(await correr([], fila({ tipo: "Gasto" }), panelBlas(), otroDia)).toMatchObject({ ok: true, hecho: "grabado" });
  });

  it("ingreso sin caja abierta, ya pasado o igual", async () => {
    const sin = panelBlas({ cajas: [{ id: "c1", status: "cerrada" }] });
    expect(await correr([], fila({ tipo: "Ingreso" }), sin)).toMatchObject({ ok: false, error: "sin_caja" });
    const ya = panelBlas({ movimientos: [{ id: "m0", type: "ingreso", amount: 200, description: `x · ${CLAVE}`, createdAt: "2026-11-01T19:00:00Z" }] });
    expect(await correr([], fila({ tipo: "Ingreso" }), ya)).toMatchObject({ ok: true, hecho: "ya_estaba", id: "m0" });
    const igual = panelBlas({ movimientos: [{ id: "m2", type: "ingreso", amount: 200, description: "Ingreso extra", createdAt: "2026-11-01T19:00:00Z" }] });
    expect(await correr([], fila({ tipo: "Ingreso" }), igual)).toMatchObject({ ok: false, error: "duplicado" });
    for (const x of [sin, ya, igual]) expect(x.escrituras()).toHaveLength(0);
  });

  it("a seco: lee el panel pero no escribe nada (ni la persona nueva)", async () => {
    for (const [args, f] of [[["--seco", "--persona-nueva"], fila({ persona: "Hermano Alex" })], [["--seco"], fila({ tipo: "Gasto" })], [["--seco"], fila({ tipo: "Ingreso" })]]) {
      const p = panelBlas();
      const r = await correr(args, f, p);
      expect(r).toMatchObject({ ok: true, seco: true });
      expect(r.pedidos.length).toBeGreaterThan(0);
      expect(p.escrituras()).toHaveLength(0);
    }
  });

  it("panel apagado: no sale nada y el error lo dice (el buzón lo deja pendiente)", async () => {
    const p = panelBlas();
    const r = await correr([], fila({ tipo: "Gasto" }), p, { puertoAbierto: async () => false });
    expect(r).toMatchObject({ ok: false, error: "panel_apagado" });
    expect(p.pedidos).toHaveLength(0);
  });

  it("negocio en solo lectura (402): «sin_plan», que no se reintenta", async () => {
    const p = panel((u, init) => ((init.method ?? "GET") === "GET" ? json([]) : json({ error: "Trial expirado" }, 402)));
    expect(await correr([], fila({ tipo: "Gasto" }), p)).toMatchObject({ ok: false, error: "sin_plan" });
  });

  it("si no pudo revisar duplicados, no escribe", async () => {
    const p = panel((u, init) => ((init.method ?? "GET") === "GET" && u.pathname === RUTAS.gastos ? json({ error: "x" }, 500) : json({ id: "g1" }, 201)));
    expect(await correr([], fila({ tipo: "Gasto" }), p)).toMatchObject({ ok: false });
    expect(p.escrituras()).toHaveLength(0);
  });
});
