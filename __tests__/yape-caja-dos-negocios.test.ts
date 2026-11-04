// Yape → caja con UN celular que cobra para dos negocios (04-11-2026, Brandon: «Los dos, lo separo») y apagado solo del modo
// aprender. Casa temporal (YAPE_CASA), sin red (fetch falso) y sin la conexión real del MCP (credenciales falsas).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Yape {
  ENTRADA: string;
  procesar(archivo: string): Promise<Record<string, unknown>>;
  boton(data: string, quien?: string): Promise<Record<string, unknown>>;
  revisarAprender(ahora?: number): Promise<Record<string, unknown>>;
  _paraPruebas: {
    REGISTRO: string;
    MEMORIA: string;
    MEMORIA_SECO: string;
    guardarBoton(id: string, st: object): void;
    leerBoton(id: string): Record<string, unknown> | null;
    botonesDe(id: string, st: object): [string, string][][];
    textoPendiente(st: object): string;
    idNuevo(): string;
  };
}

let casa = "";
const fetchFalso = vi.fn(async (..._a: unknown[]): Promise<unknown> => {
  throw new Error("sin red en los tests");
});
const telegramOk = () => fetchFalso.mockImplementation(async () => ({ status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) }));
const textoEnviado = (i = 0) => String((fetchFalso.mock.calls[i]?.[1] as { body: URLSearchParams }).body.get("text"));

async function cargar(op: { seco: boolean; ajustes: object }): Promise<Yape> {
  casa = mkdtempSync(join(tmpdir(), "yape-dos-"));
  process.env.YAPE_CASA = casa;
  if (op.seco) process.env.YAPE_SECO = "1";
  else delete process.env.YAPE_SECO;
  mkdirSync(join(casa, ".config/yape"), { recursive: true });
  writeFileSync(join(casa, ".config/yape/ajustes.json"), JSON.stringify(op.ajustes));
  writeFileSync(join(casa, ".bsm-notify.env"), "TELEGRAM_BOT_TOKEN=prueba\nTELEGRAM_CHAT_ID=1\n");
  vi.resetModules();
  vi.doMock("../tools/mcp-buleje/src/credenciales.mjs", () => ({ leerCredenciales: () => { throw new Error("sin conexión en tests"); } }));
  return (await import("../tools/mcp-buleje/yape-caja.mjs")) as unknown as Yape;
}
const ajustesDe = () => JSON.parse(readFileSync(join(casa, ".config/yape/ajustes.json"), "utf8"));
const ponerAjustes = (a: object) => writeFileSync(join(casa, ".config/yape/ajustes.json"), JSON.stringify(a));

beforeEach(() => {
  fetchFalso.mockReset();
  fetchFalso.mockImplementation(async () => { throw new Error("sin red en los tests"); });
  vi.stubGlobal("fetch", fetchFalso);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../tools/mcp-buleje/src/credenciales.mjs");
  delete process.env.YAPE_CASA;
  delete process.env.YAPE_SECO;
  if (casa) rmSync(casa, { recursive: true, force: true });
  casa = "";
});

const DOS = { negocio: "main", aprender: true, tope: 500, equipos: { "poco-c71": ["main", "blas"] } };
async function avisoDe(m: Yape, soles: string, pagador = "PERSONA SECO", equipo = "poco-c71") {
  mkdirSync(m.ENTRADA, { recursive: true });
  const t = Date.now();
  const datos = { v: 1, equipo, envio: String(t), titulo: "Yape", texto: `${pagador} te envió un pago por S/ ${soles}`, hora: "", llego: t };
  const ruta = join(m.ENTRADA, `${createHash("sha256").update(`${soles}|${Math.random()}`).digest("hex")}.json`);
  writeFileSync(ruta, JSON.stringify(datos));
  return m.procesar(ruta);
}
const textos = (b: unknown) => (b as [string, string][][]).flat().map(([t]) => t);
const datosDe = (b: unknown) => (b as [string, string][][]).flat().map(([, d]) => d);

describe("un celular, dos negocios: un toque elige", () => {
  it("pagador nuevo → «✅ Bodega» · «✅ Blas» con índice firmado (n0/n1), nunca el slug, ≤64 bytes", async () => {
    const m = await cargar({ seco: true, ajustes: DOS });
    const r = await avisoDe(m, "12.50");
    expect(r.estado).toBe("pendiente");
    expect(r.motivos).toContain("elegir");
    expect(textos(r.botones)).toEqual(["✅ Bodega", "✅ Blas", "🙋 Es personal", "❌ No es pago"]);
    const d = datosDe(r.botones);
    expect(d.slice(0, 2).map((x) => x.slice(-3))).toEqual([":n0", ":n1"]);
    expect(d.every((x) => Buffer.byteLength(x) <= 64 && !x.includes("blas") && !x.includes("main"))).toBe(true);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("toca «Blas» → anota en Blas y lo recuerda; la próxima vez Blas sale primero; con aprender apagado IGUAL pregunta (doble cuenta entre negocios)", async () => {
    const m = await cargar({ seco: true, ajustes: DOS });
    const r = await avisoDe(m, "12.50");
    const id = String(datosDe(r.botones)[1]).split(":")[1];
    const t = await m.boton(`yp:${id}:n1`, "test");
    expect(String(t.texto)).toContain("✅ Anotado en la caja de ahora (Blas).");
    expect(String(t.texto)).toContain("La próxima vez que pague PERSONA SECO pongo primero Blas.");
    expect(existsSync(m._paraPruebas.MEMORIA_SECO)).toBe(true);
    expect(existsSync(m._paraPruebas.MEMORIA)).toBe(false); // a seco no toca la memoria de verdad

    const r2 = await avisoDe(m, "20.00");
    expect(r2.motivos).not.toContain("elegir");
    expect(r2.motivos).toContain("dos");
    expect(r2.recordado).toBe("blas");
    expect(textos(r2.botones)[0]).toBe("✅ Blas (como la vez pasada)");
    expect(textos(r2.botones)).toContain("✅ Bodega");

    ponerAjustes({ ...DOS, aprender: false });
    const r3 = await avisoDe(m, "30.00");
    // Nunca entra solo con 2 negocios: el panel deduplica POR negocio (venta Yape del POS en la Bodega + recordado Blas = doble).
    expect(r3.estado).toBe("pendiente");
    expect(r3.sinAprender).toBe("pendiente");
    expect(r3.motivos).toEqual(["dos"]);
    expect(r3.negocio).toBe("blas");
    expect(textos(r3.botones)[0]).toBe("✅ Blas (como la vez pasada)");
    const nuevo = await avisoDe(m, "31.00", "OTRA PERSONA");
    expect(nuevo.estado).toBe("pendiente");
    expect(nuevo.motivos).toEqual(["elegir"]);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("lista de uno = como antes; lista repetida o vacía = ajustes rotos", async () => {
    const m = await cargar({ seco: true, ajustes: { ...DOS, equipos: { "poco-c71": ["main"] } } });
    const r = await avisoDe(m, "12.50");
    expect(r.negocio).toBe("main");
    expect(r.motivos).not.toContain("elegir");
    expect(textos(r.botones)).not.toContain("✅ Bodega");
    for (const malo of [["main", "main"], [], ["main", "Blas Mayus"]]) {
      ponerAjustes({ ...DOS, equipos: { "poco-c71": malo } });
      const x = await avisoDe(m, `4${malo.length}.0${malo.join("").length % 10}`);
      expect(x.estado).toBe("pendiente");
      expect(x.motivos).not.toContain("elegir");
      expect(x.negocio ?? null).toBeNull();
    }
  });

  it("repetido con dos negocios → «Otro pago → Bodega/Blas» + «Es el mismo»; índice fuera de la lista = inválido", async () => {
    const m = await cargar({ seco: true, ajustes: DOS });
    const st = {
      v: 1, negocio: null, opciones: ["main", "blas"], recordado: null, equipo: "poco-c71", h: "a".repeat(64),
      aviso: { montoCentimos: 1250, pagador: "JUAN PEREZ" }, llave: "b".repeat(64), titulo: "Yape", texto: "JUAN PEREZ te envió un pago por S/ 12.50",
      recibidoEn: new Date().toISOString(), motivos: ["duplicado", "elegir", "aprender"], estado: "pendiente", creado: Date.now(),
    };
    const id = m._paraPruebas.idNuevo();
    expect(textos(m._paraPruebas.botonesDe(id, st))).toEqual(["➕ Otro pago → Bodega", "➕ Otro pago → Blas", "✅ Es el mismo, no anotar", "🙋 Es personal"]);
    m._paraPruebas.guardarBoton(id, st);
    expect((await m.boton(`yp:${id}:n3`, "test")).toque).toBe("Botón inválido");
    expect((await m.boton(`yp:${id}:n0`, "test")).toque).toBe("Es repetido: elige «Otro pago» o «Es el mismo»");
    const otro = await m.boton(`yp:${id}:o0`, "test");
    expect(String(otro.texto)).toContain("✅ Anotado en la caja de ahora (Bodega).");
    expect(m._paraPruebas.leerBoton(id)?.estado).toBe("resuelto");
  });

  it("elegir otro negocio que el recordado = 1 error para el modo aprender (de verdad, sin panel: queda pendiente)", async () => {
    const m = await cargar({ seco: false, ajustes: DOS });
    const id = m._paraPruebas.idNuevo();
    m._paraPruebas.guardarBoton(id, {
      v: 1, negocio: "main", opciones: ["main", "blas"], recordado: "main", equipo: "poco-c71", h: "c".repeat(64),
      aviso: { montoCentimos: 900, pagador: "ANA" }, llave: "d".repeat(64), titulo: "Yape", texto: "ANA te envió un pago por S/ 9.00",
      recibidoEn: new Date().toISOString(), motivos: ["aprender"], estado: "pendiente", creado: Date.now(),
    });
    const r = await m.boton(`yp:${id}:n1`, "test");
    expect(r.toque).toBe("Todavía no se anotó");
    const evs = readFileSync(m._paraPruebas.REGISTRO, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(evs.filter((e) => e.motivo === "cambio_negocio")).toHaveLength(1);
    expect(m._paraPruebas.leerBoton(id)?.negocio).toBe("blas");
    expect(JSON.parse(readFileSync(m._paraPruebas.MEMORIA, "utf8"))).toBeTruthy();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("equipo desconocido → ofrece todos los negocios conocidos, nunca supone la Bodega", async () => {
    const m = await cargar({ seco: true, ajustes: DOS });
    const r = await avisoDe(m, "15.00", "PERSONA SECO", "otro-cel");
    expect(r.motivos).toContain("equipo");
    expect(r.negocio ?? null).toBeNull();
    expect(textos(r.botones).slice(0, 2)).toEqual(["✅ Bodega", "✅ Blas"]);
  });

  it("«↔️ Mejor a…» solo si el panel dijo que NO anotó (sin caja), nunca tras un corte del servidor", async () => {
    const m = await cargar({ seco: true, ajustes: DOS });
    const st = (motivos: string[]) => ({
      v: 1, negocio: "main", opciones: ["main", "blas"], recordado: "main", equipo: "poco-c71", h: "e".repeat(64),
      aviso: { montoCentimos: 700, pagador: "LUIS" }, llave: "f".repeat(64), titulo: "Yape", texto: "LUIS te envió un pago por S/ 7.00",
      recibidoEn: new Date().toISOString(), motivos, estado: "pendiente", creado: Date.now(),
    });
    const id = m._paraPruebas.idNuevo();
    expect(textos(m._paraPruebas.botonesDe(id, st(["sin_turno"])))).toContain("↔️ Mejor a Blas");
    for (const corte of ["panel_servidor", "panel_tiempo", "panel_compilando"]) {
      expect(textos(m._paraPruebas.botonesDe(id, st([corte])))).not.toContain("↔️ Mejor a Blas");
    }
  });
});

describe("modo aprender se apaga solo (timer diario 08:10)", () => {
  const AHORA = Date.parse("2026-11-04T15:00:00Z"); // 10:00 en Lima
  const registro = (m: Yape, evs: object[]) => {
    mkdirSync(join(casa, ".local/state/yape"), { recursive: true });
    writeFileSync(m._paraPruebas.REGISTRO, evs.map((e) => JSON.stringify(e)).join("\n") + "\n");
  };
  const yapes = (n: number, t: number) => Array.from({ length: n }, (_, i) => ({ t: t + i * 60_000, tipo: "yape", h: `h${i}` }));
  const HACE_6 = AHORA - 6 * 86_400_000; // dentro del tramo (desde 28-10)

  it("7 días, 5 Yape, 0 errores → avisa a Telegram y recién ahí apaga", async () => {
    const m = await cargar({ seco: false, ajustes: { ...DOS, aprenderDesde: "2026-10-28" } });
    registro(m, [...yapes(5, HACE_6 + 3_600_000), { t: HACE_6 + 4_000_000, tipo: "yape", h: "h0" }]); // h0 repetido cuenta 1
    telegramOk();
    const r = await m.revisarAprender(AHORA);
    expect(r).toMatchObject({ accion: "apagado", dias: 7, yapes: 5, errores: 0 });
    expect(textoEnviado()).toBe("✅ Apagué el modo aprender: 7 días, 5 Yape, 0 errores. Los Yape del celular que cobra para Bodega y Blas te siguen preguntando de cuál es (1 toque), para no contar dos veces una venta.");
    expect(ajustesDe().aprenderDesde).toBeUndefined();
    expect(ajustesDe()).toMatchObject({ aprender: false, aprenderApagado: "2026-11-04", equipos: { "poco-c71": ["main", "blas"] } });
    expect((await m.revisarAprender(AHORA + 86_400_000)).accion).toBe("ya_apagado");
  });

  it("si Telegram falla no apaga (sigue aprendiendo y reintenta mañana)", async () => {
    const m = await cargar({ seco: false, ajustes: { ...DOS, aprenderDesde: "2026-10-28" } });
    registro(m, yapes(6, HACE_6 + 3_600_000));
    await expect(m.revisarAprender(AHORA)).rejects.toThrow();
    expect(ajustesDe().aprender).toBe(true);
  });

  it("antes de 7 días sin errores: nada; con un error: vuelve a contar desde hoy, 1 aviso por semana como máximo", async () => {
    const m = await cargar({ seco: false, ajustes: { ...DOS, aprenderDesde: "2026-11-01" } });
    registro(m, yapes(9, AHORA - 2 * 86_400_000));
    telegramOk();
    expect((await m.revisarAprender(AHORA)).accion).toBe("esperando");
    expect(fetchFalso).not.toHaveBeenCalled();

    registro(m, [...yapes(9, AHORA - 2 * 86_400_000), { t: AHORA - 3_600_000, tipo: "error", motivo: "no_leido", h: "x" }]);
    const r = await m.revisarAprender(AHORA);
    expect(r).toMatchObject({ accion: "reiniciado", avisado: true, errores: 1 });
    expect(textoEnviado()).toBe("⏳ Sigo en modo aprender: hubo 1 error (aviso que no pude leer). Vuelvo a contar 7 días desde hoy.");
    expect(ajustesDe()).toMatchObject({ aprender: true, aprenderDesde: "2026-11-04" });
    // el error de esta mañana ya no cuenta mañana (corte = hora del reinicio)
    expect((await m.revisarAprender(AHORA + 86_400_000)).accion).toBe("esperando");
    // otro error a los 2 días: reinicia de nuevo pero sin mensaje (ya avisó esta semana)
    registro(m, [{ t: AHORA + 2 * 86_400_000 - 60_000, tipo: "error", motivo: "panel_venta_yape_parecida", h: "y" }]);
    const r2 = await m.revisarAprender(AHORA + 2 * 86_400_000);
    expect(r2).toMatchObject({ accion: "reiniciado", avisado: false });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("7 días con menos de 5 Yape → reinicia y dice cuántos faltaron; a seco solo dice qué haría", async () => {
    const m = await cargar({ seco: true, ajustes: { ...DOS, aprenderDesde: "2026-10-28" } });
    registro(m, yapes(3, HACE_6 + 3_600_000));
    const r = await m.revisarAprender(AHORA);
    expect(r).toMatchObject({ accion: "reiniciaria", avisaria: true, mensaje: "⏳ Sigo en modo aprender: en 7 días llegaron 3 Yape y necesito 5. Vuelvo a contar 7 días desde hoy." });
    expect(ajustesDe().aprenderDesde).toBe("2026-10-28");
    expect(fetchFalso).not.toHaveBeenCalled();
  });
  it("prendido de nuevo a mano tras apagarse → la cuenta arranca hoy (no se vuelve a apagar al día siguiente)", async () => {
    const m = await cargar({ seco: false, ajustes: { ...DOS, aprender: true, aprenderDesde: "2026-11-04", aprenderApagado: "2026-11-11" } });
    const T = Date.parse("2026-11-21T13:10:00Z");
    registro(m, yapes(6, T - 5 * 86_400_000));
    telegramOk();
    expect((await m.revisarAprender(T)).accion).toBe("empieza");
    expect(ajustesDe()).toMatchObject({ aprender: true, aprenderDesde: "2026-11-21" });
    expect(ajustesDe().aprenderApagado).toBeUndefined();
    expect((await m.revisarAprender(T + 86_400_000)).accion).toBe("esperando");
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
