#!/usr/bin/env node
// Estado de cuenta de cada cliente, cada lunes 07:30 (Brandon 03-11-2026). Lo llama ~/.config/systemd/user/estado-cuenta-lunes.timer.
//
// Qué hace (LEE el panel de Blas y nunca le manda nada a un cliente; lo único que escribe es la copia de cada papel para
// su QR, como todo papel de Blas — ADR-534):
//   1. Lee /api/adelantos/cuentas (la misma lista de «Cuenta por persona» de Adelantos) y toma a quienes le deben a Blas
//      (`neto` > 0: «positivo = te debe», lib/adelantos/cuenta-unificada.ts).
//   2. De cada uno lee /api/adelantos/cuentas/estado (movimientos línea por línea) y arma 1 PDF de 1 hoja con el formato
//      único de los papeles de Blas (molde EC de ~/.local/share/blas-papeles: número EC-, código y QR en el pie; el
//      molde recalcula el saldo y si no cuadra con el del panel NO sale). En --seco sale de PRUEBA: no gasta número.
//   3. Le manda a BRANDON por Telegram (su propio bot): un resumen y cada PDF. Si la persona tiene celular, el resumen trae
//      un enlace wa.me con el texto ya escrito: Brandon lo toca, adjunta el PDF y envía él. Esto NUNCA escribe a un cliente.
//
// Uso:  estado-cuenta-lunes.mjs [--seco] [--negocio=blas] [--solo="<parte del nombre>"] [--carpeta=<ruta>]
//   --seco   arma los PDF e imprime lo que mandaría; no manda nada a Telegram.
//   --solo   (para pruebas) únicamente las personas cuyo nombre contiene ese texto.
// Si el panel está apagado lo prende (como la herramienta panel_prender); si no se puede leer, avisa a Brandon y NO genera PDF.
import { execFile, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { crearCliente } from "./src/cliente.mjs";
import { leerCredenciales } from "./src/credenciales.mjs";
import { estadoPanel, prenderPanel } from "./src/panel-local.mjs";
import { CARPETA_SESIONES, negocioDeConfig } from "./archivar-telegram.mjs";

const BIN = join(homedir(), ".local", "bin");
const PAPELES = join(homedir(), ".local", "share", "blas-papeles");
export const MOLDE = join(PAPELES, "moldes", "estado-cuenta.typ");
const SEMANA = "/mnt/c/Users/Usuario/OneDrive/Documentos/Escritorio/Semana actual/Despachos y clientes";

/**
 * Brandon 04-11: el papel de una persona va también a SU carpeta (BLAS SAC › …).
 * `persona guardar` copia solo si está SEGURO de quién es (código 0); si duda o no
 * está en la lista, no copia nada y lo decimos en el resumen para que Brandon diga quién es.
 */
function archivarEnPersona(nombre, pdf) {
  const r = spawnSync(join(BIN, "persona"), ["guardar", nombre, pdf, "--estado", "oficial"]  /* 04-11: el oficial nuevo archiva el estado de cuenta anterior */, { encoding: "utf8", timeout: 30_000 });
  return { ok: r.status === 0, salida: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}
const MAX_FILAS_PDF = 24; // 1 sola hoja: lo anterior se resume en una fila de «saldo anterior»
const ESPERA_PANEL_MS = 240_000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Formato (todo en español simple) ─────────────────────────────────────────

export const r2 = (n) => Math.round(n * 100) / 100;
export const soles = (n) => `S/ ${r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monto = (n) => r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dos = (n) => String(n).padStart(2, "0");

/** Día de una fecha como lo vive el negocio: con hora → Lima (UTC−5); a medianoche UTC exacta es un día sin hora → UTC. */
export function diaDe(iso) {
  const d = new Date(iso);
  const sinHora = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  const x = sinHora ? d : new Date(d.getTime() - 5 * 3600_000);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}
export const fechaCorta = (iso) => { const { y, m, d } = diaDe(iso); return `${dos(d)}/${dos(m)}/${y}`; };
const diaNumero = (iso) => { const { y, m, d } = diaDe(iso); return Date.UTC(y, m - 1, d) / 86_400_000; };

/** Hoy en Lima. */
export function hoyLima(ahora = Date.now()) {
  const x = new Date(ahora - 5 * 3600_000);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), n: Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / 86_400_000 };
}

/** Celular de Perú con 51 delante, o null si no sirve. */
export function celularWa(tel) {
  const s = String(tel ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(s)) return `51${s}`;
  if (/^519\d{8}$/.test(s)) return s;
  return null;
}

export function enlaceWa(cel, nombre, saldo) {
  const texto = `Hola ${nombre}, te escribe Blas. Tu saldo pendiente con nosotros es ${soles(saldo)}. Te paso tu estado de cuenta con el detalle. Cualquier duda me avisas.`;
  return `https://wa.me/${cel}?text=${encodeURIComponent(texto)}`;
}

/**
 * Pasa las líneas del panel (solo soles, que es lo que suma en «neto») a los datos del molde EC: fechas AAAA-MM-DD y
 * cargo/abono como texto; el saldo lo calcula el molde. Si son más de MAX_FILAS_PDF, lo anterior va como «saldo
 * anterior», para que entre en 1 hoja.
 * @returns {{ datos: object, ultimoAbono: string|null }}
 */
export function datosEstadoCuenta(persona, lineas, otras = []) {
  const pen = lineas.filter((l) => (l.moneda || "PEN") === "PEN");
  const abonos = pen.filter((l) => l.monto < 0);
  const ultimoAbono = abonos.length ? abonos[abonos.length - 1].fecha : null;
  const resto = pen.length > MAX_FILAS_PDF ? pen.slice(pen.length - MAX_FILAS_PDF) : pen;
  const antes = pen.length - resto.length;
  const iso = (f) => { const { y, m, d } = diaDe(f); return `${y}-${dos(m)}-${dos(d)}`; };
  const fijo = (n) => r2(n).toFixed(2);
  const datos = {
    para: { nombre: persona.nombre, ...(persona.documento ? { doc: String(persona.documento) } : {}) },
    ...(antes > 0 ? { saldo_anterior: fijo(pen[antes - 1].acumulado), saldo_anterior_fecha: iso(pen[antes - 1].fecha) } : {}),
    movimientos: resto.map((l) => ({
      fecha: iso(l.fecha),
      concepto: String(l.concepto ?? "") || "Movimiento",
      ref: String(l.referencia ?? ""),
      ...(l.monto > 0 ? { cargo: fijo(l.monto) } : {}),
      ...(l.monto < 0 ? { abono: fijo(-l.monto) } : {}),
    })),
    otras,
  };
  return { datos, ultimoAbono };
}

// ── Panel ────────────────────────────────────────────────────────────────────

async function asegurarPanel(base, log, deps) {
  const est = deps.estadoPanel ?? estadoPanel;
  let e = await est({ base });
  if (e.abierto && e.saludable) return { ok: true };
  // 03-11: el liviano (0,55 GB) con la última compilación; el de desarrollo pesa 4,7 GB y quedaba prendido
  if (!e.abierto) {
    const r = await (deps.prenderPanel ?? prenderPanel)({ base, comando: join(BIN, "panel-trabajo") });
    log(`panel apagado → ${r.mensaje}`);
    if (!r.ok) return { ok: false, motivo: r.mensaje };
  } else log("panel prendido pero compilando; espero");
  const fin = Date.now() + ESPERA_PANEL_MS;
  while (Date.now() < fin) {
    await (deps.dormir ?? dormir)(6000);
    e = await est({ base });
    if (e.abierto && e.saludable) return { ok: true };
  }
  return { ok: false, motivo: "el panel no respondió a tiempo" };
}

// ── Telegram (solo a Brandon: el bot de ~/.bsm-notify.env) ────────────────────

function correr(cmd, args) {
  return new Promise((res) => execFile(cmd, args, { timeout: 150_000 }, (err, out, errout) => res({ ok: !err, salida: `${out}${errout}`.trim() })));
}
const avisar = (texto) => correr(join(BIN, "aviso-telegram"), [texto]);
const mandarPdf = (archivo, texto) => correr(join(BIN, "mandar-telegram"), [archivo, texto]);

/** Trozos de ≤3.800 caracteres cortando entre bloques (Telegram corta a 4.096). */
export function trozos(bloques, tope = 3800) {
  const out = [];
  let acc = "";
  for (const b of bloques) {
    if (acc && acc.length + b.length + 2 > tope) { out.push(acc); acc = ""; }
    acc += (acc ? "\n\n" : "") + b;
  }
  if (acc) out.push(acc);
  return out;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

// El papel lo arma `blas_papeles.emitir` (el mismo del programa `papel`): número EC-, código, QR, archivo y copia al
// panel (con cola si el panel no responde). `esperado_total` = el saldo del panel: si el molde suma otra cosa, no sale.
const EMITIR_PY = `import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import blas_papeles as bp
m = bp.emitir("estado-cuenta", bp.MOLDES / "estado-cuenta.typ", Path(sys.argv[2]), nombre=sys.argv[3], estado="oficial",
              prueba=sys.argv[4] == "1", entregar_a=False, esperado_total=sys.argv[5])
print(json.dumps({k: m.get(k) for k in ("numero", "codigo", "pdf", "hojas", "total", "lineas")}, ensure_ascii=False))`;

function hacerPdf({ persona, datos, total, carpeta, prueba }) {
  const tmp = join(carpeta, `.datos-${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify(datos));
  const r = spawnSync("python3", ["-c", EMITIR_PY, PAPELES, tmp, persona.nombre, prueba ? "1" : "0", monto(Math.abs(total))], { encoding: "utf8", timeout: 120_000 });
  rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error(`el papel no salió: ${String(r.stderr || r.error || "").trim().split("\n").pop().slice(-200)}`);
  const papel = JSON.parse(String(r.stdout).trim().split("\n").pop());
  const salida = join(carpeta, basename(papel.pdf));
  copyFileSync(papel.pdf, salida);
  return { salida, paginas: Number(papel.hojas) || 1, numero: papel.numero, panel: (papel.lineas ?? []).join(" · ") };
}

// ── Principal ────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @param {{ cliente?: any, config?: any, estadoPanel?: Function, prenderPanel?: Function, dormir?: Function, ahora?: number,
 *   carpetaBase?: string, avisar?: Function, mandarPdf?: Function }} [deps] solo para pruebas
 */
export async function estadoCuentaLunes(argv, deps = {}) {
  const { values: a } = parseArgs({ args: argv, options: { seco: { type: "boolean", default: false }, negocio: { type: "string", default: "blas" }, solo: { type: "string" }, carpeta: { type: "string" } }, strict: true });
  const log = (m) => process.stdout.write(`${m}\n`);
  const tg = { avisar: deps.avisar ?? avisar, mandarPdf: deps.mandarPdf ?? mandarPdf };
  const noLeyo = async (motivo) => {
    log(`No pude leer el panel: ${motivo}`);
    if (!a.seco) await tg.avisar(`No pude armar los estados de cuenta del lunes: no pude leer el panel (${motivo}). No mandé nada a ningún cliente. Cuando lo prendas, corre: estado-cuenta-lunes`);
    return { ok: false, motivo };
  };

  let config;
  try { config = deps.config ?? leerCredenciales(); } catch (e) { return noLeyo(`sin acceso al panel (${String(e?.message ?? e).slice(0, 120)})`); }
  const negocio = negocioDeConfig(config, a.negocio);
  if (!negocio) return noLeyo(`el negocio «${a.negocio}» no está configurado`);

  const panel = await asegurarPanel(config.base, log, deps);
  if (!panel.ok) return noLeyo(panel.motivo);

  const cliente = deps.cliente ?? crearCliente({ config, carpetaSesiones: CARPETA_SESIONES });
  const lista = await cliente.pedir(negocio, { metodo: "GET", ruta: "/api/adelantos/cuentas", sinRecorte: true });
  if (!lista.ok || !Array.isArray(lista.datos?.personas)) return noLeyo(lista.error?.mensaje ?? "la lista de cuentas no llegó");
  const truncada = lista.datos.truncado === true;

  let deben = lista.datos.personas.map((p) => ({ ...p, nombre: String(p.nombre).replace(/\s+/g, " ").trim() })).filter((p) => Number(p.neto) > 0.005);
  if (a.solo) { const t = a.solo.toLowerCase(); deben = deben.filter((p) => p.nombre.toLowerCase().includes(t)); }
  deben.sort((x, y) => y.neto - x.neto);
  if (deben.length === 0) {
    log("Nadie le debe a Blas hoy.");
    if (!a.seco) await tg.avisar("Estados de cuenta del lunes: hoy ningún cliente tiene saldo pendiente con Blas.");
    return { ok: true, clientes: 0, total: 0 };
  }

  const hoy = hoyLima(deps.ahora);
  const carpeta = a.carpeta ?? join(deps.carpetaBase ?? SEMANA, `Estados de cuenta ${dos(hoy.d)}-${dos(hoy.m)}`);
  mkdirSync(carpeta, { recursive: true });

  const hechos = [];
  const fallidos = [];
  for (const p of deben) {
    const query = {};
    if (p.beneficiarioId) query.beneficiario = p.beneficiarioId;
    if (p.parteId) query.parte = p.parteId;
    const det = await cliente.pedir(negocio, { metodo: "GET", ruta: "/api/adelantos/cuentas/estado", query, sinRecorte: true });
    if (!det.ok || !Array.isArray(det.datos?.lineas)) { fallidos.push(`${p.nombre} (no se leyó su cuenta)`); continue; }
    const { datos, ultimoAbono } = datosEstadoCuenta(p, det.datos.lineas, []);
    const netoDetalle = det.datos.totales?.neto;
    // El PDF y la lista tienen que decir lo mismo: si no cuadran, no se manda un número dudoso.
    if (typeof netoDetalle === "number" && Math.abs(netoDetalle - p.neto) > 0.01) { fallidos.push(`${p.nombre} (su detalle dice ${soles(netoDetalle)} y la lista ${soles(p.neto)})`); continue; }
    const otras = Object.entries(p.otrasMonedas ?? {}).filter(([, v]) => Math.abs(v) > 0.005).map(([m, v]) => `${m} ${monto(v)}`);
    try {
      const { salida, paginas, numero, panel } = hacerPdf({ persona: p, datos: { ...datos, otras }, total: p.neto, carpeta, prueba: a.seco });
      log(`${numero} · ${p.nombre} · ${soles(p.neto)}${panel ? ` · ${panel}` : ""}`);
      if (paginas > 1) log(`ojo: el PDF de ${p.nombre} salió de ${paginas} hojas`);
      const dias = ultimoAbono ? Math.max(0, hoy.n - diaNumero(ultimoAbono)) : null;
      hechos.push({ persona: p, pdf: salida, paginas, dias, ultimoAbono, cel: celularWa(p.telefono) });
    } catch (e) { fallidos.push(`${p.nombre} (${String(e?.message ?? e).slice(0, 80)})`); }
  }

  if (hechos.length === 0) return noLeyo(`no se pudo armar ningún estado (${fallidos.join("; ")})`);

  // En seco o con carpeta de prueba no se toca ninguna carpeta de persona.
  const archivar = deps.archivar ?? (a.seco || a.carpeta || deps.carpetaBase ? null : archivarEnPersona);
  const archivados = [];
  const sinCarpeta = [];
  if (archivar) {
    for (const h of hechos) {
      const r = archivar(h.persona.nombre, h.pdf);
      (r.ok ? archivados : sinCarpeta).push(h.persona.nombre);
      if (!r.ok) log(`sin carpeta para ${h.persona.nombre}: ${r.salida.split("\n")[0]}`);
    }
  }

  const total = r2(hechos.reduce((s, h) => s + h.persona.neto, 0));
  const lineaDe = (h, i) => {
    const pagos = h.dias === null ? "todavía no ha pagado nada" : h.dias === 0 ? "pagó hoy" : `último pago hace ${h.dias} ${h.dias === 1 ? "día" : "días"}`;
    const wa = h.cel ? `\nPara escribirle por WhatsApp (toca, adjunta el PDF y envías tú): ${enlaceWa(h.cel, h.persona.nombre, h.persona.neto)}` : "\n(No tiene celular guardado.)";
    return `${i + 1}. ${h.persona.nombre} · ${soles(h.persona.neto)} · ${pagos}${wa}`;
  };
  const cab = `${hechos.length} ${hechos.length === 1 ? "cliente te debe" : "clientes te deben"} ${soles(total)} en total.`;
  const notas = [
    ...(truncada ? ["Ojo: la cuenta de madera es muy larga y puede faltar alguna deuda."] : []),
    ...fallidos.map((f) => `No pude armar: ${f}.`),
    ...(archivados.length ? [`Copiados a su carpeta: ${archivados.join(", ")}.`] : []),
    ...(sinCarpeta.length ? [`Sin carpeta (no sé con seguridad quién es; dime y lo archivo): ${sinCarpeta.join(", ")}.`] : []),
  ];
  const textos = trozos([cab, ...hechos.map(lineaDe), ...notas, "No le mandé nada a ningún cliente. Los PDF te llegan enseguida y también están en Semana actual › Despachos y clientes."]);

  if (a.seco) {
    log("── Lo que mandaría a Telegram (modo seco) ──");
    for (const t of textos) log(t + "\n");
    for (const h of hechos) log(`PDF: ${h.pdf}  (${h.paginas} hoja${h.paginas === 1 ? "" : "s"}) · caption: «Estado de cuenta · ${h.persona.nombre} · ${soles(h.persona.neto)}»`);
  } else {
    for (const t of textos) { const r = await tg.avisar(t); if (!r.ok) log(`Telegram no recibió el resumen: ${r.salida}`); }
    for (const h of hechos) {
      const r = await tg.mandarPdf(h.pdf, `Estado de cuenta · ${h.persona.nombre} · ${soles(h.persona.neto)}`);
      log(r.ok ? `Enviado: ${h.pdf}` : `Telegram no recibió ${h.pdf}: ${r.salida}`);
    }
  }
  return { ok: true, clientes: hechos.length, total, carpeta, hechos, fallidos, archivados, sinCarpeta };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  estadoCuentaLunes(process.argv.slice(2)).then((r) => process.exit(r.ok ? 0 : 1)).catch((e) => { process.stderr.write(`estado-cuenta-lunes: ${e?.stack ?? e}\n`); process.exit(1); });
}
