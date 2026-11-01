#!/usr/bin/env node
// Prueba con el dedo de Brandon (01-11): 2 mensajes en Telegram (1: tocar el monto correcto, 2: tocar ❌ No). Ventana falsa y
// envío a seco: no toca ningún negocio. Uso: node tools/mcp-buleje/probar-boton-telegram.mjs
const M = new URL("./src", import.meta.url).pathname;
const { crearConfirmador } = await import(`${M}/confirmaciones.mjs`);
const { crearCarrera, crearOkTelegram, crearTelegram, leerBot } = await import(`${M}/ok-telegram.mjs`);
const { claveMonto } = await import(`${M}/clave-ok.mjs`);
const tg = crearTelegram(leerBot());
const ok = crearOkTelegram({ telegram: tg });
const ventana = (q) => new Promise((r) => q.signal.addEventListener("abort", () => r("no"), { once: true })); // sin ventana en la PC
const salidas = [];
const enviar = async (n, p) => { salidas.push(p); return { ok: true, status: 200, datos: {} }; }; // a seco: no va al panel
const c = crearConfirmador({ preguntar: crearCarrera({ ventana, telegram: ok.preguntar, ventanaMs: 120_000 }), enviar, esperaMs: 600_000 });
const caso = async (n, texto, monto) => {
  const pr = c.proponer({ negocio: "qa-forestal", herramienta: "adelanto_dar", pedidos: { metodo: "POST", ruta: "/api/adelantos", cuerpo: { monto } }, resumen: texto, ventana: { clave: claveMonto(monto), filas: [{ etiqueta: "A quién", valor: "Prueba (no es real)" }] } });
  const t0 = Date.now();
  const r = await c.confirmar({ token: pr.token, resumen: pr.resumen });
  return { prueba: n, respuesta: r.respuesta, por: r.por, quien: r.quien, segundos: Math.round((Date.now() - t0) / 1000), ejecutado: salidas.length };
};
const res = [];
res.push(await caso(1, "🧪 PRUEBA 1 de 2 (no es plata real): dar S/ 7,00 a «Prueba». Toca el monto correcto para aprobar.", 7));
res.push(await caso(2, "🧪 PRUEBA 2 de 2 (no es plata real): dar S/ 3,00 a «Prueba». Esta vez toca ❌ No.", 3));
console.log(JSON.stringify(res));
const bien = res[0].respuesta === "si" && res[1].respuesta === "no" && res[0].ejecutado === 1 && res[1].ejecutado === 1;
await tg.enviar(bien ? "✅ Prueba terminada: tu toque del monto correcto aprobó y tu ❌ No canceló. El botón funciona de verdad." : `⚠️ Prueba terminada con algo raro: ${res.map((x) => `${x.prueba}=${x.respuesta}`).join(", ")}. Lo reviso.`);
