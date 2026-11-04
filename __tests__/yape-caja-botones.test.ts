// Yape → caja, lado PC (04-11-2026, ronda de revisión): botones de un repetido sin «Sí», botones de prueba aparte,
// negocio por equipo, espera de 10 min de lo automático y candado de las llaves. Todo en una casa temporal
// (YAPE_CASA) y sin red: fetch falso que tira, así un camino que llame a Telegram o al panel se nota.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Yape {
  ENTRADA: string;
  procesar(archivo: string): Promise<Record<string, unknown>>;
  boton(data: string, quien?: string): Promise<Record<string, unknown>>;
  _paraPruebas: {
    BOTONES: string;
    LLAVES: string;
    guardarBoton(id: string, st: object): void;
    leerBoton(id: string): Record<string, unknown> | null;
    botonesDe(id: string, st: object): [string, string][][];
    textoPendiente(st: object): string;
    idNuevo(): string;
  };
}

let casa = "";
const fetchFalso = vi.fn(async () => {
  throw new Error("sin red en los tests");
});

async function cargar(op: { seco: boolean; ajustes?: object }): Promise<Yape> {
  casa = mkdtempSync(join(tmpdir(), "yape-casa-"));
  process.env.YAPE_CASA = casa;
  if (op.seco) process.env.YAPE_SECO = "1";
  else delete process.env.YAPE_SECO;
  if (op.ajustes) {
    mkdirSync(join(casa, ".config/yape"), { recursive: true });
    writeFileSync(join(casa, ".config/yape/ajustes.json"), JSON.stringify(op.ajustes));
  }
  vi.resetModules(); // las rutas y el modo seco se leen al importar
  return (await import("../tools/mcp-buleje/yape-caja.mjs")) as unknown as Yape;
}

beforeEach(() => {
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.YAPE_CASA;
  delete process.env.YAPE_SECO;
  if (casa) rmSync(casa, { recursive: true, force: true });
  casa = "";
});

const AUTOMATICO = { negocio: "main", aprender: false, tope: 500, equipos: { "poco-c71": "main" } };

function entrada(m: Yape, datos: object | string): { ruta: string; hecho: string } {
  mkdirSync(m.ENTRADA, { recursive: true });
  const h = createHash("sha256").update(`${JSON.stringify(datos)}|${Math.random()}`).digest("hex");
  writeFileSync(join(m.ENTRADA, `${h}.json`), typeof datos === "string" ? datos : JSON.stringify(datos));
  return { ruta: join(m.ENTRADA, `${h}.json`), hecho: join(m.ENTRADA, `${h}.hecho`) };
}
const aviso = (equipo: string, soles: string, haceMs = 0) => {
  const t = Date.now() - haceMs;
  return { v: 1, equipo, envio: String(t), titulo: "Yape", texto: `PERSONA SECO te envió un pago por S/ ${soles}`, hora: "", llego: t };
};
const stDe = (motivos: string[], extra: object = {}) => ({
  v: 1, negocio: "main", equipo: "poco-c71", h: "a".repeat(64), aviso: { montoCentimos: 1250, pagador: "JUAN PEREZ" },
  llave: "b".repeat(64), titulo: "Yape", texto: "JUAN PEREZ te envió un pago por S/ 12.50", recibidoEn: new Date().toISOString(),
  motivos, estado: "pendiente", creado: Date.now(), ...extra,
});

describe("repetido: sin «Sí» (un toque distraído anotaba el mismo pago dos veces)", () => {
  it("botones: «Es otro pago» · «Es el mismo» · «Es personal»", async () => {
    const m = await cargar({ seco: true });
    const b = m._paraPruebas.botonesDe(m._paraPruebas.idNuevo(), stDe(["duplicado", "aprender"]));
    expect(b.flat().map(([t]) => t)).toEqual(["➕ Es otro pago, anotar", "✅ Es el mismo, no anotar", "🙋 Es personal"]);
    expect(b.flat().some(([, d]) => d.endsWith(":si"))).toBe(false);
  });

  it("un «Sí» de un mensaje viejo no anota: pide elegir; «Es el mismo» lo cierra", async () => {
    const m = await cargar({ seco: true });
    const id = m._paraPruebas.idNuevo();
    m._paraPruebas.guardarBoton(id, stDe(["duplicado", "aprender"]));
    const si = await m.boton(`yp:${id}:si`, "test");
    expect(si.toque).toBe("Es repetido: elige «Es otro pago» o «Es el mismo»");
    expect(m._paraPruebas.leerBoton(id)?.estado).toBe("pendiente");
    const no = await m.boton(`yp:${id}:no`, "test");
    expect(String(no.texto)).toContain("✅ No se anotó: era el mismo pago.");
    expect(m._paraPruebas.leerBoton(id)?.estado).toBe("resuelto");
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("texto de la pregunta", () => {
  it("dice desde qué equipo llegó y avisa de la venta ya cobrada", async () => {
    const m = await cargar({ seco: true });
    const t = m._paraPruebas.textoPendiente(stDe(["aprender"]));
    expect(t).toContain(" · desde poco-c71");
    expect(t).toContain("Toca «Sí» solo si este Yape NO lo cobraste ya en la caja como venta.");
    const dup = m._paraPruebas.textoPendiente(stDe(["duplicado", "aprender"]));
    expect(dup).toContain("¿Es OTRO pago o el mismo que ya llegó?");
    expect(dup).not.toContain("Toca «Sí»");
  });

  it("equipo desconocido y caja: textos nuevos", async () => {
    const m = await cargar({ seco: true });
    expect(m._paraPruebas.textoPendiente(stDe(["equipo"], { equipo: "cel-raro" }))).toContain("Llegó de un equipo que no conozco: cel-raro.");
    expect(m._paraPruebas.textoPendiente(stDe(["sin_turno"]))).toContain("No hay caja abierta: ábrela y toca «Anotar igual».");
    expect(m._paraPruebas.textoPendiente(stDe(["fuera_de_turno"]))).toContain("«Anotar igual» lo pone en la caja de ahora.");
  });
});

describe("botones de prueba (modo seco) aparte de los de verdad", () => {
  it("van a botones-seco/ y «Es personal» en la prueba no toca personales.txt", async () => {
    const m = await cargar({ seco: true });
    expect(m._paraPruebas.BOTONES).toBe(join(casa, ".local/state/yape/botones-seco"));
    const id = m._paraPruebas.idNuevo();
    m._paraPruebas.guardarBoton(id, stDe(["aprender"], { prueba: true, aviso: { montoCentimos: 100, pagador: "PERSONA DE PRUEBA" } }));
    expect(existsSync(join(casa, ".local/state/yape/botones"))).toBe(false);
    const r = await m.boton(`yp:${id}:pers`, "test");
    expect(r.toque).toBe("Prueba: nada se anotó");
    expect(existsSync(join(casa, ".config/yape/personales.txt"))).toBe(false);
  });

  it("sin modo seco, los botones van a botones/", async () => {
    const m = await cargar({ seco: false });
    expect(m._paraPruebas.BOTONES).toBe(join(casa, ".local/state/yape/botones"));
  });
});

describe("el negocio sale del equipo (ajustes «equipos»)", () => {
  it("equipo que no está en la lista → pendiente con motivo «equipo»", async () => {
    const m = await cargar({ seco: true, ajustes: AUTOMATICO });
    const r = await m.procesar(entrada(m, aviso("cel-raro", "12.50")).ruta);
    expect(r).toMatchObject({ ok: true, estado: "pendiente", equipo: "cel-raro" });
    expect(r.motivos).toContain("equipo");
  });

  it("equipo conocido → su negocio, sin motivos (fresco = esperaría; de hace 11 min = anotaría)", async () => {
    const m = await cargar({ seco: true, ajustes: AUTOMATICO });
    expect(await m.procesar(entrada(m, aviso("poco-c71", "12.50")).ruta)).toMatchObject({ estado: "esperaria", motivos: [], negocio: "main" });
    expect(await m.procesar(entrada(m, aviso("poco-c71", "30.00", 11 * 60_000)).ruta)).toMatchObject({ estado: "anotaria", motivos: [] });
  });

  it("«equipos» mal escrito = ajustes rotos; sin «equipos», como antes", async () => {
    const roto = await cargar({ seco: true, ajustes: { ...AUTOMATICO, equipos: { "poco-c71": "MAIN!" } } });
    expect((await roto.procesar(entrada(roto, aviso("poco-c71", "12.50")).ruta)).motivos).toContain("ajustes");
    const antes = await cargar({ seco: true, ajustes: { negocio: "main", aprender: false, tope: 500 } });
    expect(await antes.procesar(entrada(antes, aviso("cel-raro", "12.50")).ruta)).toMatchObject({ estado: "esperaria", motivos: [] });
  });
});

describe("lo automático espera 10 min desde el pago", () => {
  it("fresco → «esperando» con hasta, sin llamar al panel ni a Telegram; reprocesar antes de hora = ya_procesado", async () => {
    const m = await cargar({ seco: false, ajustes: AUTOMATICO });
    const e = aviso("poco-c71", "12.50");
    const { ruta, hecho } = entrada(m, e);
    const r = await m.procesar(ruta);
    expect(r).toMatchObject({ ok: true, estado: "esperando", hasta: Number(e.envio) + 600_000 });
    expect(JSON.parse(readFileSync(hecho, "utf8"))).toMatchObject({ estado: "esperando", hasta: Number(e.envio) + 600_000 });
    expect((await m.procesar(ruta)).estado).toBe("ya_procesado");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("«esperando» cumplido se retoma; no cumplido, no", async () => {
    const m = await cargar({ seco: true, ajustes: AUTOMATICO });
    const cumplido = entrada(m, aviso("poco-c71", "12.50", 11 * 60_000));
    writeFileSync(cumplido.hecho, JSON.stringify({ estado: "esperando", t: Date.now() - 60_000, hasta: Date.now() - 1000 }));
    expect((await m.procesar(cumplido.ruta)).estado).toBe("anotaria");
    const falta = entrada(m, aviso("poco-c71", "30.00", 11 * 60_000));
    writeFileSync(falta.hecho, JSON.stringify({ estado: "esperando", t: Date.now(), hasta: Date.now() + 60_000 }));
    expect((await m.procesar(falta.ruta)).estado).toBe("ya_procesado");
  });
});

describe("aviso dañado", () => {
  it("queda «invalido»; en modo seco no avisa a Telegram", async () => {
    const m = await cargar({ seco: true });
    const { ruta, hecho } = entrada(m, "{no es json");
    expect(await m.procesar(ruta)).toMatchObject({ ok: false, error: "entrada ilegible" });
    expect(JSON.parse(readFileSync(hecho, "utf8")).estado).toBe("invalido");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sin modo seco intenta avisar, y si Telegram falla no se cae", async () => {
    const m = await cargar({ seco: false });
    const { ruta } = entrada(m, "{no es json");
    expect(await m.procesar(ruta)).toMatchObject({ ok: false, error: "entrada ilegible" });
  });
});

describe("candado de las llaves", () => {
  it("un candado de más de 30 s es de un proceso muerto: se borra y se sigue", async () => {
    const m = await cargar({ seco: true, ajustes: AUTOMATICO });
    mkdirSync(m._paraPruebas.LLAVES, { recursive: true });
    const candado = join(m._paraPruebas.LLAVES, ".candado");
    writeFileSync(candado, "999999");
    const viejo = (Date.now() - 60_000) / 1000;
    utimesSync(candado, viejo, viejo);
    expect((await m.procesar(entrada(m, aviso("poco-c71", "12.50")).ruta)).estado).toBe("esperaria");
    expect(existsSync(candado)).toBe(false);
  });

  it("un candado vivo frena 5 s y falla sin dejar el aviso tomado (lo reintenta el buzón)", { timeout: 15_000 }, async () => {
    const m = await cargar({ seco: true, ajustes: AUTOMATICO });
    mkdirSync(m._paraPruebas.LLAVES, { recursive: true });
    writeFileSync(join(m._paraPruebas.LLAVES, ".candado"), "1");
    const { ruta, hecho } = entrada(m, aviso("poco-c71", "12.50"));
    await expect(m.procesar(ruta)).rejects.toThrow(/ocupadas/);
    expect(existsSync(hecho)).toBe(false);
  });
});
