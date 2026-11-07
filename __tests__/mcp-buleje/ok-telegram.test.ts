// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
// @ts-nocheck
// @vitest-environment node
/**
 * OK por Telegram (01-11): el id del botón vale una vez y solo para su operación; un .respuesta sin el id correcto no
 * aprueba; 10 min sin respuesta = vencio; gana el primero (ventana o Telegram). Y el borrador de la foto de guía.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearCarrera, crearOkTelegram, hashId, sinClaves, textoPregunta, PREFIJO } from "../../tools/mcp-buleje/src/ok-telegram.mjs";
import { crearConfirmador } from "../../tools/mcp-buleje/src/confirmaciones.mjs";
import { borradorDeLectura, faltanDe, pedidoDeGrabar, guiaTelegram } from "../../tools/mcp-buleje/guia-telegram.mjs";

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ok-tg-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

/** Telegram falso: guarda lo mandado; `alEnviar` simula el toque de Brandon (lo que haría el buzón). */
function telegramFalso(alEnviar) {
  const enviados = [], editados = [];
  return {
    enviados, editados,
    async enviar(texto, botones) { enviados.push({ texto, botones }); setTimeout(() => alEnviar?.(botones), 5); return 77; },
    async editar(id, texto) { editados.push({ id, texto }); return true; },
  };
}
/** Lo que hace el buzón con un toque: hash del id → .respuesta con el id adentro, solo si hay .pendiente. */
function tocar(botones, cual, quien = "123 @brandon") {
  const fila = botones[0];
  const dato = cual === "no" ? botones[1][0].dato : cual === "si" ? fila.find((b) => b.texto === "S/ 200,00").dato : fila.find((b) => b.texto !== "S/ 200,00").dato;
  const [, id, resp] = dato.split(":"); // resp = b0|b1|b2|no (el buzón escribe el botón tocado)
  const h = hashId(id);
  if (!existsSync(join(dir, `${h}.pendiente`))) return false;
  writeFileSync(join(dir, `${h}.respuesta`), JSON.stringify({ id, respuesta: resp, quien, cuando: "2026-11-01T10:00:00Z" }), { flag: "wx" });
  return true;
}
const p = (extra = {}) => ({ negocio: "blas", herramienta: "adelanto_dar", resumen: "Dar S/ 200,00 a Hermano Alex\n\nPara hacerlo, aprieta el botón con el monto correcto.", ventana: { clave: { etiqueta: "Monto", valor: "S/ 200,00", senuelos: ["S/ 2.000,00", "S/ 20,00"], palabra: "monto" }, filas: [{ etiqueta: "A quién", valor: "Hermano Alex" }] }, vence: Date.now() + 2_000, ...extra });
const ok = (tg) => crearOkTelegram({ telegram: tg, dir, sondeoMs: 10, log: () => undefined });

describe("OK por Telegram", () => {
  it("Sí del botón aprueba, con quién y cuándo; deja la carpeta limpia y edita el mensaje", async () => {
    const tg = telegramFalso((b) => tocar(b, "si"));
    const r = await ok(tg).preguntar(p());
    expect(r).toMatchObject({ respuesta: "si", por: "telegram", quien: "123 @brandon" });
    expect(readdirSync(dir)).toEqual([]);
    expect(tg.editados[0].texto).toMatch(/Aprobado por Telegram/);
    expect(tg.enviados[0].botones[0][0].dato).toMatch(new RegExp(`^${PREFIJO}:[A-Z2-7]{24}:b[0-2]$`));
  });
  it("tocar un parecido (no el monto correcto) = No", async () => {
    const tg = telegramFalso((b) => tocar(b, "mal"));
    const r = await ok(tg).preguntar(p());
    expect(r.respuesta).toBe("no");
    expect(tg.editados[0].texto).toMatch(/no era/);
  });
  it("3 botones con el monto y 2 parecidos + ❌ No; el monto no va escrito suelto", async () => {
    const tg = telegramFalso((b) => tocar(b, "no"));
    await ok(tg).preguntar(p());
    const { texto, botones } = tg.enviados[0];
    expect(botones[0].map((b) => b.texto).sort()).toEqual(["S/ 2.000,00", "S/ 20,00", "S/ 200,00"].sort());
    expect(botones[1][0].texto).toBe("❌ No");
    expect(texto).not.toMatch(/• Monto:/);
    expect(texto).toMatch(/toca el monto correcto/);
  });
  it("No del botón cancela", async () => {
    const r = await ok(telegramFalso((b) => tocar(b, "no"))).preguntar(p());
    expect(r.respuesta).toBe("no");
  });
  it("sin respuesta → vencio (y el botón viejo ya no encuentra su pendiente)", async () => {
    let botones;
    const tg = telegramFalso((b) => { botones = b; });
    const r = await ok(tg).preguntar(p({ vence: Date.now() + 150 }));
    expect(r.respuesta).toBe("vencio");
    expect(tocar(botones, "si")).toBe(false); // toque tardío: no hay .pendiente → el buzón dice «ya no vale»
    expect(tg.editados[0].texto).toMatch(/Caducó/);
  });
  it("un .respuesta escrito a mano sin el id correcto NO aprueba", async () => {
    const tg = telegramFalso((b) => {
      const [, id] = b[0][0].dato.split(":");
      writeFileSync(join(dir, `${hashId(id)}.respuesta`), JSON.stringify({ id: "A".repeat(24), respuesta: "si" }));
    });
    const r = await ok(tg).preguntar(p({ vence: Date.now() + 300 }));
    expect(r.respuesta).toBe("vencio");
  });
  it("cada pregunta sortea un id distinto (el botón de una no sirve para otra)", async () => {
    const tg = telegramFalso((b) => tocar(b, "no"));
    await ok(tg).preguntar(p()); await ok(tg).preguntar(p());
    expect(tg.enviados[0].botones[0][0].dato).not.toBe(tg.enviados[1].botones[0][0].dato);
  });
  it("si Telegram no sale, dice sin_telegram (no aprueba ni cancela)", async () => {
    const r = await crearOkTelegram({ telegram: { enviar: async () => { throw new Error("red"); }, editar: async () => true }, dir, log: () => undefined }).preguntar(p());
    expect(r.respuesta).toBe("sin_telegram");
    expect(readdirSync(dir)).toEqual([]);
  });
  it("el texto no lleva claves, DNI ni la línea de los 3 botones de la ventana", () => {
    const t = textoPregunta({ ...p(), resumen: "Clave SOL: ABC123xyz · DNI 45678912\nPara hacerlo, aprieta el botón con el monto correcto.", minutos: 10 });
    expect(t).not.toMatch(/ABC123xyz|45678912|aprieta el botón/);
    expect(t).toMatch(/A quién: Hermano Alex/);
    expect(sinClaves("password=hunter2")).toBe("password=••••");
  });
});

describe("carrera ventana ↔ Telegram", () => {
  const lento = (r, ms) => (q) => new Promise((res) => { const t = setTimeout(() => res(r), ms); q.signal?.addEventListener("abort", () => { clearTimeout(t); res("no"); }); });
  it("gana la ventana si contesta primero (Telegram se corta)", async () => {
    let cortado = false;
    const c = crearCarrera({ ventana: lento("si", 1600), telegram: (q) => new Promise((res) => q.signal.addEventListener("abort", () => { cortado = true; res({ respuesta: "vencio", por: "telegram" }); })), ventanaMs: 120_000 });
    expect(await c(p())).toMatchObject({ respuesta: "si", por: "ventana" });
    expect(cortado).toBe(true);
  });
  it("gana Telegram si contesta primero (la ventana se cierra)", async () => {
    const c = crearCarrera({ ventana: lento("si", 5000), telegram: async () => ({ respuesta: "si", por: "telegram", quien: "x" }), ventanaMs: 120_000 });
    expect(await c(p())).toMatchObject({ respuesta: "si", por: "telegram" });
  });
  it("ventana que vence no corta: sigue esperando a Telegram", async () => {
    const c = crearCarrera({ ventana: async () => "vencio", telegram: lento({ respuesta: "no", por: "telegram" }, 50), ventanaMs: 120_000 });
    expect((await c(p())).respuesta).toBe("no");
  });
  it("ventana que no abrió («no» al instante) no corta si hay Telegram", async () => {
    const c = crearCarrera({ ventana: async () => "no", telegram: lento({ respuesta: "si", por: "telegram" }, 50), ventanaMs: 120_000 });
    expect((await c(p())).respuesta).toBe("si");
  });
  it("sin Telegram, la ventana manda como siempre", async () => {
    const c = crearCarrera({ ventana: async () => "no", telegram: null, ventanaMs: 120_000 });
    expect((await c(p())).respuesta).toBe("no");
  });
  it("clics inyectados en la ventana = No aunque Telegram diga Sí después", async () => {
    const c = crearCarrera({ ventana: async () => ({ respuesta: "no", inyectados: 2 }), telegram: lento({ respuesta: "si", por: "telegram" }, 50), ventanaMs: 120_000 });
    expect(await c(p())).toMatchObject({ respuesta: "no", inyectados: 2 });
  });
});

describe("confirmador con Telegram", () => {
  it("Sí ejecuta y el resultado dice por dónde y quién; No no manda nada", async () => {
    const enviados = [];
    const enviar = async (n, ped) => { enviados.push(ped); return { ok: true, status: 200, datos: {} }; };
    let resp = { respuesta: "si", por: "telegram", quien: "123 @b", cuando: "2026-11-01T10:00:00Z" };
    const c = crearConfirmador({ preguntar: async () => resp, enviar, esperaMs: 600_000 });
    const pr = c.proponer({ negocio: "blas", herramienta: "x", pedidos: { metodo: "POST", ruta: "/api/x", cuerpo: {} }, resumen: "hola" });
    const r = await c.confirmar({ token: pr.token, resumen: "hola" });
    expect(r).toMatchObject({ ok: true, respuesta: "si", por: "telegram", quien: "123 @b" });
    expect(enviados).toHaveLength(1);
    resp = { respuesta: "no", por: "telegram" };
    const pr2 = c.proponer({ negocio: "blas", herramienta: "x", pedidos: { metodo: "POST", ruta: "/api/x", cuerpo: {} }, resumen: "hola" });
    const r2 = await c.confirmar({ token: pr2.token, resumen: "hola" });
    expect(r2).toMatchObject({ ok: false, por: "telegram" });
    expect(enviados).toHaveLength(1);
    // el mismo token otra vez: ya usado
    expect((await c.confirmar({ token: pr.token, resumen: "hola" })).error.codigo).toBe("token_usado");
  });
});

describe("foto de guía → borrador", () => {
  it("lo que no se leyó queda vacío y va en faltan (nunca se adivina)", () => {
    const b = borradorDeLectura({ gtfNumber: "0004567", gtfSeries: "019-001", especie: "Shihuahuaco", volumenM3: 0, proveedor: "CN Santa Rosa", ruc: "123", fecha: "2026-02-30", origen: "", numeroRegistro: "" });
    expect(b.volumenM3).toBe(0);
    expect(b.ruc).toBe("");
    expect(b.fecha).toBe(""); // 30 de febrero no existe
    expect(faltanDe(b)).toEqual(expect.arrayContaining(["volumenM3", "fecha", "placa", "ruc"]));
  });
  it("el pedido es el de madera_ingreso_registrar + serie, científico y registro; placa en notas", () => {
    const ped = pedidoDeGrabar({ guia: "0004567", serie: "019-001", titular: "CN Santa Rosa", especie: "Shihuahuaco", especieCientifica: "Dipteryx micrantha", volumenM3: 18.52, placa: "AHX-123", numeroRegistro: "110-19-0469779", fecha: "2026-10-30", ruc: "", origen: "" });
    expect(ped).toMatchObject({ metodo: "POST", ruta: "/api/admin/forestal/wood-entries" });
    expect(ped.cuerpo).toMatchObject({ gtfNumber: "0004567", gtfSeries: "019-001", providerName: "CN Santa Rosa", speciesCommonName: "Shihuahuaco", volumeM3: 18.52, gtfDate: "2026-10-30", serforNumeroRegistro: "110-19-0469779", speciesScientificName: "Dipteryx micrantha" });
    expect(ped.cuerpo.notes).toMatch(/Placa: AHX-123/);
  });
  it("grabar sin un obligatorio no manda nada; con --seco solo muestra el pedido", async () => {
    const config = { base: "http://localhost:3000", porDefecto: "blas", seco: true, negocios: { blas: { slug: "blas", usuario: "claude", clave: "x" } } };
    const sinVol = await guiaTelegram(["grabar", "--negocio=blas", "--seco"], { config, entrada: JSON.stringify({ guia: "1", titular: "A", especie: "B", volumenM3: 0 }), anotar: () => undefined });
    expect(sinVol).toMatchObject({ ok: false, error: "datos_invalidos" });
    const anotados = [];
    const seco = await guiaTelegram(["grabar", "--negocio=blas", "--seco", "--quien=123 @b"], { config, entrada: JSON.stringify({ guia: "1", titular: "A", especie: "B", volumenM3: 2.5 }), anotar: (e) => anotados.push(e) });
    expect(seco).toMatchObject({ ok: true, seco: true });
    expect(anotados[0]).toMatchObject({ por: "telegram", quien: "123 @b", herramienta: "madera_ingreso_registrar" });
    expect((await guiaTelegram(["grabar", "--negocio=main", "--seco"], { config, entrada: "{}" })).ok).toBe(false);
  });
});
