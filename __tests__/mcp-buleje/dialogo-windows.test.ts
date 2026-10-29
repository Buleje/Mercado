// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos).
import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { preguntarEnWindows, leerRespuesta, leerResultado, armarScript, armarDatos, comandoCodificado, etiquetaNegocio, BLOQUEO_INICIAL_MS, BLOQUEO_AL_ENFOCAR_MS, decidirClic, esMensajeDeBoton, CANDADO_CS, FISICO_MS, RUTA_TASKKILL, LLMHF_INJECTED, LLMHF_LOWER_IL_INJECTED } from "../../tools/mcp-buleje/src/dialogo-windows.mjs";
import { claveMonto } from "../../tools/mcp-buleje/src/clave-ok.mjs";

/** powershell.exe falso: `guion(hijo)` decide qué imprime y cuándo cierra. */
function spawnFalso(guion) {
  const llamadas = [];
  const spawn = vi.fn((cmd, args) => {
    const hijo = new EventEmitter();
    hijo.stdout = new EventEmitter();
    hijo.stderr = new EventEmitter();
    hijo.kill = vi.fn(() => { queueMicrotask(() => hijo.emit("close", null)); return true; });
    llamadas.push({ cmd, args, hijo });
    queueMicrotask(() => guion?.(hijo, cmd, args));
    return hijo;
  });
  return { spawn, llamadas };
}
const cerrarCon = (texto, codigo = 0) => (h) => { if (texto) h.stdout.emit("data", Buffer.from(texto)); h.emit("close", codigo); };
/** Salida de la ventana nueva (2.ª pasada 29-10): una línea JSON con el botón y los clics inyectados descartados. */
const json = (respuesta, inyectados = 0) => JSON.stringify({ respuesta, inyectados });
// azar fijo () => 0: Fisher-Yates deja [señuelo1, señuelo2, real] → el correcto es el botón 2 («b2»).
const ventana = { clave: claveMonto(150), filas: [{ etiqueta: "A quién", valor: "Don Lucho" }] };
const base = { negocio: "blas", resumen: "Dar S/ 150,00 a Don Lucho", ventana, aleatorio: () => 0, segundos: 120, powershell: "powershell.exe", log: () => {} };
const datosDe = (args) => {
  const script = Buffer.from(args[4], "base64").toString("utf16le");
  return JSON.parse(Buffer.from(script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)[1], "base64").toString("utf8"));
};

afterEach(() => { vi.useRealTimers(); });

describe("dialogo-windows", () => {
  it("solo el botón del dato correcto aprueba; un señuelo, el viejo «si» o salida rara = «no»", async () => {
    for (const [salida, esperado] of [[json("b2"), "si"], [json("b2") + "\r\n", "si"], [json("b0"), "no"], [json("b1"), "no"], [json("si"), "no"], [json("no"), "no"], [json("vencio"), "vencio"], ["", "no"], [json("b22"), "no"], [json("B2"), "no"], ["b2", "no"], ['{"respuesta":"b2","inyectados":"x"}', "si"], ["[1]", "no"]]) {
      const { spawn } = spawnFalso(cerrarCon(salida));
      expect(await preguntarEnWindows({ ...base, spawn }), salida).toBe(esperado);
    }
    expect(leerRespuesta("ruido\n" + json("b1"), 1)).toBe("si");
    expect(leerRespuesta(json("b1"), 0)).toBe("no");
    expect(leerRespuesta(json("b1"), undefined)).toBe("no");
    expect(leerRespuesta(json("b3"), 3)).toBe("no");
  });

  it("clic inyectado (SendInput/desktop-control): aunque sea el botón correcto, «no» + cuántos llegaron", async () => {
    const intentos = [];
    for (const salida of [json("b2", 1), json("no", 3), json("vencio", 2)]) {
      const { spawn } = spawnFalso(cerrarCon(salida));
      const r = await preguntarEnWindows({ ...base, spawn, log: (m) => intentos.push(m) });
      expect(r, salida).toEqual({ respuesta: "no", inyectados: JSON.parse(salida).inyectados });
    }
    expect(intentos.filter((m) => /^INTENTO: \d+ clic/.test(m))).toHaveLength(3);
    expect(leerResultado(json("b1", 0), 1)).toEqual({ respuesta: "si", inyectados: 0 });
    expect(leerResultado(json("b1", -4), 1)).toEqual({ respuesta: "si", inyectados: 0 });
    expect(leerResultado(json("b1", 2.5), 1)).toEqual({ respuesta: "si", inyectados: 0 });
  });

  it("decisión del gancho de mouse (lógica pura): botón con LLMHF_INJECTED o LOWER_IL_INJECTED se descarta; movimiento y rueda pasan", () => {
    expect([LLMHF_INJECTED, LLMHF_LOWER_IL_INJECTED]).toEqual([1, 2]);
    // WM_LBUTTONDOWN/UP, DBLCLK, RBUTTON*, MBUTTON*, XBUTTON*
    for (const msg of [0x201, 0x202, 0x203, 0x204, 0x205, 0x206, 0x207, 0x208, 0x209, 0x20b, 0x20c, 0x20d]) {
      expect(esMensajeDeBoton(msg)).toBe(true);
      expect(decidirClic(msg, 0), `0x${msg.toString(16)} físico`).toBe("aceptar");
      for (const f of [1, 2, 3, 0x11, 0x80000003]) expect(decidirClic(msg, f), `0x${msg.toString(16)} flags ${f}`).toBe("descartar");
      expect(decidirClic(msg, 0x10)).toBe("aceptar"); // otras banderas no son inyección
    }
    for (const msg of [0x200, 0x20a, 0x20e]) for (const f of [0, 1, 2, 3]) expect(decidirClic(msg, f)).toBe("aceptar"); // mover, rueda
    // El C# del gancho usa la misma regla y apunta al clic físico que aprueba.
    expect(CANDADO_CS).toContain("(flags & 0x3u) != 0");
    expect(CANDADO_CS).toContain("SetWindowsHookEx(14");
    expect(CANDADO_CS).toMatch(/return\s+\(IntPtr\)1|return\s+new IntPtr\(1\)/);
    expect(FISICO_MS).toBe(600);
  });

  it("los 3 botones: el monto real y 2 señuelos (×10 y ÷10) en orden al azar; la ventana no dice cuál es", () => {
    const vistos = new Set();
    for (let k = 0; k < 3; k++) {
      const { correcto, datos } = armarDatos({ negocio: "bodega", resumen: "x", ventana, segundos: 60, aleatorio: () => k % 3 });
      expect([...datos.botones].sort()).toEqual(["S/ 1.500,00", "S/ 15,00", "S/ 150,00"].sort());
      expect(datos.botones[correcto]).toBe("S/ 150,00");
      expect(datos.valor).toBe("S/ 150,00");
      expect(datos.instruccion).toMatch(/aprieta el botón con el monto correcto/);
      expect(JSON.stringify(datos)).not.toMatch(/correcto"\s*:/);
      vistos.add(correcto);
    }
    expect(vistos.size).toBeGreaterThan(1);
  });

  it("nombres y filas a una línea de ≤60 (sin saltos, bidi ni ancho cero); sin clave → código de 3 cifras", () => {
    const raro = `Don Lucho\nSÍ ES CORRECTO\u202e\u200b${"x".repeat(80)}`;
    const { datos } = armarDatos({ negocio: "blas", resumen: "r", ventana: { clave: null, filas: [{ etiqueta: "A quién", valor: raro }] }, segundos: 60 });
    expect(datos.filas[0].valor).not.toMatch(/[\n\u202e\u200b]/);
    expect([...datos.filas[0].valor].length).toBeLessThanOrEqual(60);
    expect(datos.etiqueta).toBe("Código de esta operación");
    expect(datos.valor).toMatch(/^\d{3}$/);
    expect(new Set(datos.botones).size).toBe(3);
  });

  it("sin powershell.exe (ENOENT) → «no»", async () => {
    const { spawn } = spawnFalso((h) => h.emit("error", Object.assign(new Error("spawn powershell.exe ENOENT"), { code: "ENOENT" })));
    expect(await preguntarEnWindows({ ...base, spawn })).toBe("no");
    const tira = vi.fn(() => { throw new Error("EACCES"); });
    expect(await preguntarEnWindows({ ...base, spawn: tira })).toBe("no");
  });

  it("si powershell no contesta, a segundos + holgura lo mata y devuelve «vencio»", async () => {
    vi.useFakeTimers();
    const { spawn, llamadas } = spawnFalso(() => {});
    const prom = preguntarEnWindows({ ...base, segundos: 15, spawn });
    await vi.advanceTimersByTimeAsync(15_000 + 25_000);
    expect(await prom).toBe("vencio");
    expect(llamadas[0].hijo.kill).toHaveBeenCalled();
  });

  it("al vencer, con el PID de Windows conocido: taskkill /T /F primero y recién entonces la promesa (no quedan dos ventanas)", async () => {
    vi.useFakeTimers();
    const { spawn, llamadas } = spawnFalso((h, cmd) => {
      if (cmd === RUTA_TASKKILL) return queueMicrotask(() => { h.emit("close", 0); llamadas[0].hijo.emit("close", 1); });
      h.stderr.emit("data", Buffer.from("pid=4321\r\n"));
    });
    let r;
    const prom = preguntarEnWindows({ ...base, segundos: 15, spawn }).then((x) => { r = x; });
    await vi.advanceTimersByTimeAsync(15_000 + 25_000);
    await prom;
    expect(r).toBe("vencio");
    const tk = llamadas.find((l) => l.cmd === RUTA_TASKKILL);
    expect(tk?.args).toEqual(["/PID", "4321", "/T", "/F"]);
    expect(llamadas.indexOf(tk)).toBe(1);
  });

  it("si la ventana no cierra tras matarla, entrega igual a los 4 s (la fila no queda colgada)", async () => {
    vi.useFakeTimers();
    const { spawn } = spawnFalso((h, cmd) => { if (cmd !== RUTA_TASKKILL) h.kill = vi.fn(() => true); });
    let r;
    preguntarEnWindows({ ...base, segundos: 5, spawn }).then((x) => { r = x; });
    await vi.advanceTimersByTimeAsync(5_000 + 25_000 + 3_000);
    expect(r).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(r).toBe("vencio");
  });

  it("AbortSignal (se canceló la llamada) cierra la ventana → «no»", async () => {
    const ctl = new AbortController();
    const { spawn, llamadas } = spawnFalso(() => ctl.abort());
    expect(await preguntarEnWindows({ ...base, spawn, signal: ctl.signal })).toBe("no");
    expect(llamadas[0].hijo.kill).toHaveBeenCalled();
  });

  it("el resumen nunca va interpolado: argv = -EncodedCommand y el texto viaja en base64 dentro del script", async () => {
    const malicioso = "S/ 1'); Remove-Item C:\\ -Recurse; (' \" `$(calc) «ñ»\nlínea 2";
    const { spawn, llamadas } = spawnFalso(cerrarCon("no"));
    await preguntarEnWindows({ ...base, resumen: malicioso, spawn });
    const { cmd, args } = llamadas[0];
    expect(cmd).toBe("powershell.exe");
    expect(args.slice(0, 4)).toEqual(["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand"]);
    expect(args.join(" ")).not.toContain("Remove-Item");
    const script = Buffer.from(args[4], "base64").toString("utf16le");
    expect(script).not.toContain("Remove-Item");
    expect(script).toContain("'Claude pide tu OK'");
    expect(script).toContain("$f.TopMost = $true");
    const datos = datosDe(args);
    expect(datos.negocio).toBe("Blas — aserradero");
    expect(datos.resumen).toBe(malicioso);
    expect(datos.segundos).toBe(120);
    expect(datos.botones).toHaveLength(3);
  });

  it("armarScript solo acepta base64; los botones se habilitan a los 2 s, se rebloquean 1,5 s al enfocar y solo con clic de mouse", () => {
    expect(() => armarScript("abc'; calc; '")).toThrow();
    const s = armarScript("e30=");
    expect(BLOQUEO_INICIAL_MS).toBe(2000);
    expect(BLOQUEO_AL_ENFOCAR_MS).toBe(1500);
    expect(s).toContain("Add_MouseClick");
    expect(s).toContain("MouseButtons]::Left");
    expect(s).toContain("Add_Activated");
    expect(s).toContain("Add_Deactivate");
    expect(s).toContain("[System.Windows.Forms.Form]::ActiveForm -eq $f");
    expect(s).toContain("UseMnemonic = $false");
    expect(s).toContain("TabStop = $false");
    expect(s).not.toMatch(/\$si\b/);
    expect(s).not.toContain("'si'");
    expect(s).toContain("$f.CancelButton = $no");
    // 2.ª pasada 29-10: gancho WH_MOUSE_LL mientras la ventana está abierta; sin gancho, «no»; el clic necesita un LBUTTONUP físico.
    expect(s).toContain("class CandadoMouse");
    expect(s).toContain("[CandadoMouse]::Instalar($f.Handle)");
    expect(s).toContain("[CandadoMouse]::TomarFisico(600)");
    expect(s).toContain("[CandadoMouse]::Quitar()");
    expect(s).toContain('[Console]::Error.WriteLine("pid=$PID")');
    expect(s).toContain('"inyectados":');
    expect(s).not.toContain("AcceptButton");
    expect(comandoCodificado("a")).toBe(Buffer.from("a", "utf16le").toString("base64"));
  });

  it("los segundos salen de `vence` si no vienen; tope 5-300", async () => {
    const leer = async (op) => {
      const { spawn, llamadas } = spawnFalso(cerrarCon("no"));
      await preguntarEnWindows({ ...base, segundos: undefined, spawn, ...op });
      return datosDe(llamadas[0].args).segundos;
    };
    expect(await leer({ vence: 1_000_000 + 90_000, ahora: () => 1_000_000 })).toBe(90);
    expect(await leer({ segundos: 1 })).toBe(5);
    expect(await leer({ segundos: 9999 })).toBe(300);
    expect(etiquetaNegocio("otro")).toBe("otro");
  });
});
