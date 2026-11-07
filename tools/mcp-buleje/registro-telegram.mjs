#!/usr/bin/env node
// Lo anotado por Telegram → panel de Blas (01-11-2026). Lo llama ~/.local/share/asistente/pasar_panel.py (desde el buzón).
//
// Brandon anota «adelanto 200 a Victor», «gasté 50 en combustible», «me pagaron 1500 por la madera» → fila en el Excel de
// la semana. Debajo del «📝 Anotado» salen «✅ Pasar al panel de Blas» / «❌ Solo en el registro». SOLO con el toque de ✅:
//   pasar → graba ESA fila en el panel, una sola vez:
//     Adelanto → POST /api/adelantos (módulo Adelantos, DADO, cuenta corriente). La caja NO se toca: el mensaje no dice si
//                fue efectivo. La persona tiene que existir en el panel: sin una coincidencia exacta devuelve las 3 más
//                parecidas (error «persona»); con --persona-nueva la crea (POST /api/adelantos/beneficiarios).
//     Gasto    → POST /api/expenses (módulo Gastos, salidaDeCaja=false: tampoco toca la caja).
//     Ingreso  → POST /api/cash-registers/movements (ingreso a la caja abierta: Blas no tiene cuentas de tesorería y el
//                panel no tiene otro lugar para un ingreso suelto). Sin caja abierta = error «sin_caja».
//   Idempotencia = la clave de la fila (tg-<lunes>-f<N>-<huella>): en el adelanto es la idempotencyKey del panel; en el gasto
//   y el ingreso va escrita en las notas/la descripción y se busca ANTES de escribir. Un movimiento igual (misma persona,
//   monto y día) que no trae la clave = «posible duplicado» (error «duplicado»): no se graba sin --forzar («Es otro»).
//
// Uso: registro-telegram.mjs pasar --negocio=<blas|qa-forestal> --quien="<id @usuario>" [--seco] [--beneficiario=<id>]
//        [--recordada] [--persona-nueva] [--forzar] [--otro-dia]   (la fila va por STDIN, en JSON: {clave, tipo, persona, monto, detalle, fecha,
//        semana, fila}; fecha = «AAAA-MM-DDTHH:MM» de Lima)
//   → {"ok":true,"hecho":"grabado"|"ya_estaba","destino":"adelantos"|"gastos"|"caja","codigo":"ADL-2026-0009",…}
//   → {"ok":false,"error":"persona","parecidas":[{id,nombre,documento}]} · {"ok":false,"error":"duplicado","duplicado":{…}}
//   → {"ok":false,"error":"otro_dia"} (ingreso de otro día: la caja lo fecharía hoy; --otro-dia = Brandon dijo que igual)
//   → {"ok":false,"error":"panel_apagado"|"compilando"|"limite"|"servidor"|"incierto"|"sin_plan"|…,"mensaje":"…"}
//     «incierto» = se cortó DESPUÉS de mandar la escritura: puede que sí haya quedado (el buzón espera y vuelve a mirar).
//   --recordada: el --beneficiario es la persona elegida la vez pasada; si hay otra que se llama EXACTO así, pregunta.
//   --seco: lee el panel (persona, duplicados, caja) pero NO escribe: {"ok":true,"seco":true,"pedidos":[…]}.
// Sale: UNA línea JSON en stdout (código 1 si ok=false).
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { crearCliente } from "./src/cliente.mjs";
import { leerCredenciales } from "./src/credenciales.mjs";
import { anotar as anotarReal } from "./src/registro.mjs";
import { CARPETA_SESIONES, negocioDeConfig } from "./archivar-telegram.mjs";

export const NEGOCIOS = new Set(["blas", "qa-forestal"]);
export const TIPOS = new Set(["Adelanto", "Gasto", "Ingreso"]);
export const RUTAS = {
  adelantos: "/api/adelantos",
  personas: "/api/adelantos/beneficiarios",
  gastos: "/api/expenses",
  cajas: "/api/cash-registers",
  movimientos: "/api/cash-registers/movements",
};
export const RE_CLAVE = /^tg-\d{4}-\d{2}-\d{2}-f\d{1,4}-[0-9a-f]{8}$/;
export const PLAZO_ESCRIBIR_MS = 100_000;
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MONTO_MAX = 9_999_999;

const fallo = (error, mensaje, extra = {}) => ({ ok: false, error, mensaje, ...extra });
const texto = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** «MAMÁ  de Alex» → «mama de alex»: para comparar nombres sin tildes, mayúsculas ni espacios de más. */
export const plano = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
const igualMonto = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const soles = (n) => `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Día de Lima (AAAA-MM-DD) de un instante del panel. @param {string|Date} v */
export function diaLima(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * La fila que llega por STDIN → fila revisada, o el motivo por el que no sirve. Nada se completa a ojo.
 * @param {any} f
 * @returns {{ ok: true, fila: { clave: string, tipo: string, persona: string, monto: number, detalle: string, fecha: string, dia: string, iso: string, semana: string, fila: number } } | { ok: false, motivo: string }}
 */
export function revisarFila(f) {
  if (!f || typeof f !== "object") return { ok: false, motivo: "la fila no llegó" };
  const clave = String(f.clave ?? "");
  if (!RE_CLAVE.test(clave)) return { ok: false, motivo: "la clave de la fila no es válida" };
  const tipo = String(f.tipo ?? "");
  if (!TIPOS.has(tipo)) return { ok: false, motivo: `el tipo «${texto(tipo, 20)}» no pasa al panel (solo Adelanto, Gasto e Ingreso)` };
  const monto = Math.round(Number(f.monto) * 100) / 100;
  if (!Number.isFinite(monto) || monto <= 0 || monto > MONTO_MAX) return { ok: false, motivo: "el monto no es válido" };
  const m = RE_FECHA.exec(String(f.fecha ?? ""));
  if (!m) return { ok: false, motivo: "la fecha de la fila no es válida" };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-05:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || diaLima(d) !== `${m[1]}-${m[2]}-${m[3]}` || Number(m[4]) > 23 || Number(m[5]) > 59) return { ok: false, motivo: "la fecha de la fila no es válida" };
  const persona = texto(f.persona, 120);
  if (tipo === "Adelanto" && !persona) return { ok: false, motivo: "un adelanto necesita a quién" };
  const n = Number(f.fila);
  if (!Number.isInteger(n) || n < 1 || n > 9999) return { ok: false, motivo: "el n.º de fila no es válido" };
  return { ok: true, fila: { clave, tipo, persona, monto, detalle: texto(f.detalle, 200), fecha: String(f.fecha), dia: `${m[1]}-${m[2]}-${m[3]}`, iso, semana: texto(f.semana, 60), fila: n } };
}

/** Categoría del módulo Gastos (las del panel: lib/expense-categories.ts) por las palabras del detalle. */
const CATEGORIAS = [
  [/combustible|gasolina|petroleo|diesel|grifo|flete|pasaje|movilidad|taxi|mototaxi|transporte|carro|camion|peaje/, "Transporte"],
  [/repuesto|mantenimiento|reparacion|arreglo|aceite|llanta|afilad|sierra|soldad|motor|mecanic/, "Mantenimiento"],
  [/\bluz\b|\bagua\b|internet|telefono|celular|recarga|\bcable\b/, "Servicios"],
  [/tramite|impuesto|sunat|serfor|osinfor|\btasa\b|municipal|notari|registro/, "Impuestos"],
  [/alquiler/, "Alquiler"],
  [/sueldo|jornal|planilla|propina|comida|almuerzo|desayuno|cena|refrigerio|viatico/, "Personal"],
  [/limpieza|escoba|detergente/, "Limpieza"],
];
/** @param {string} detalle */
export function categoriaGasto(detalle) {
  const t = plano(detalle);
  return CATEGORIAS.find(([re]) => re.test(t))?.[1] ?? "Otros";
}

/** Qué tan parecido es un nombre del panel al que dijo Brandon (0 = nada). Palabras en común pesan más que letras. */
export function parecido(a, b) {
  const x = plano(a), y = plano(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const px = new Set(x.split(" ").filter((w) => w.length > 1)), py = new Set(y.split(" ").filter((w) => w.length > 1));
  let comunes = 0;
  for (const w of px) if (py.has(w) || [...py].some((v) => v.length >= 4 && w.length >= 4 && (v.startsWith(w) || w.startsWith(v)))) comunes++;
  const pares = (s) => { const r = new Map(); const t = s.replace(/ /g, ""); for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); r.set(k, (r.get(k) ?? 0) + 1); } return r; };
  const bx = pares(x), by = pares(y);
  let inter = 0, total = 0;
  for (const [k, n] of bx) { inter += Math.min(n, by.get(k) ?? 0); total += n; }
  for (const n of by.values()) total += n;
  const dice = total ? (2 * inter) / total : 0;
  return comunes * 30 + dice * 40;
}

/** Las 3 personas del panel más parecidas (solo activas; las que no se parecen en nada no se ofrecen). Con el documento:
 * dos «Juan Perez» se distinguen por su DNI/RUC en el botón. @param {any[]} personas @param {string} nombre */
export function masParecidas(personas, nombre, n = 3) {
  return personas
    .map((p) => ({ p, s: parecido(p.nombre, nombre) }))
    .filter(({ s }) => s >= 12)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(({ p }) => ({ id: String(p.id), nombre: texto(p.nombre, 80), documento: texto(p.documento, 20) || null }));
}

/** ¿Hay dos opciones con el mismo nombre? Entonces la elección no se recuerda (podría ser la otra). @param {{nombre:string}[]} ops */
export const nombresRepetidos = (ops) => new Set(ops.map((o) => plano(o.nombre))).size < ops.length;

/** Las notas que viajan con el movimiento: de dónde salió y la clave (lo que se busca para no duplicar). */
export function notaDeFila(f) {
  return `Anotado por Telegram (${f.semana || "registro de la semana"}, fila ${f.fila}) · ${f.clave}`;
}

/** Los pedidos de escritura de cada tipo (lo que se manda o, a seco, lo que se mandaría). */
export function pedidoAdelanto(f, beneficiarioId) {
  return {
    metodo: "POST", ruta: RUTAS.adelantos,
    cuerpo: {
      beneficiarioId, montoAdelantado: f.monto, fechaAdelanto: f.iso, direccion: "DADO", modalidad: "CUENTA_CORRIENTE",
      notas: [f.detalle, notaDeFila(f)].filter(Boolean).join(" · ").slice(0, 1000), idempotencyKey: f.clave,
    },
  };
}
export function pedidoGasto(f) {
  const cuerpo = {
    category: categoriaGasto(f.detalle), amount: f.monto, description: (f.detalle || "Gasto anotado por Telegram").slice(0, 2000),
    date: f.iso, salidaDeCaja: false, notes: notaDeFila(f),
  };
  if (f.persona) cuerpo.supplierName = f.persona;
  return { metodo: "POST", ruta: RUTAS.gastos, cuerpo };
}
export function pedidoIngreso(f, cajaId) {
  const [, mm, dd] = f.dia.split("-");
  const descripcion = [f.detalle, f.persona, `del ${dd}/${mm} ${f.fecha.slice(11, 16)}`, f.clave].filter(Boolean).join(" · ").slice(0, 500);
  return { metodo: "POST", ruta: RUTAS.movimientos, cuerpo: { cashRegisterId: cajaId, type: "ingreso", amount: f.monto, motivo: "Ingreso por Telegram", descripcion } };
}
export const pedidoPersona = (nombre) => ({ metodo: "POST", ruta: RUTAS.personas, cuerpo: { nombre, notas: "Creada desde Telegram (anotación de Brandon)." } });

/** Filas de una lista del panel (la forma cambió entre versiones). @param {any} d */
const filasDe = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : Array.isArray(d?.movements) ? d.movements : []);

/** Error del panel → el mismo código, para que el buzón decida (apagado = pendiente). 402 = negocio en solo lectura (plan
 * vencido o suspendido): no se arregla reintentando. @param {any} r */
const delPanel = (r, que) => (r.status === 402
  ? fallo("sin_plan", `${que}: el panel de ese negocio está en solo lectura (plan vencido o suspendido).`)
  : fallo(r.error?.codigo ?? "servidor", `${que}: ${r.error?.mensaje ?? `el panel respondió ${r.status}`}`.slice(0, 300)));

/**
 * @param {string[]} argv
 * @param {{ config?: any, fetch?: typeof fetch, puertoAbierto?: () => Promise<boolean>, carpetaSesiones?: string,
 *   entrada?: string, anotar?: (e: Record<string, unknown>) => unknown, ahora?: () => number }} [deps] solo para tests
 */
export async function registroTelegram(argv, deps = {}) {
  const [orden, ...resto] = argv;
  let a;
  try {
    ({ values: a } = parseArgs({ args: resto, options: {
      negocio: { type: "string" }, quien: { type: "string" }, seco: { type: "boolean", default: false },
      beneficiario: { type: "string" }, "persona-nueva": { type: "boolean", default: false }, forzar: { type: "boolean", default: false },
      recordada: { type: "boolean", default: false }, "otro-dia": { type: "boolean", default: false },
      preguntar: { type: "boolean", default: false }, excluir: { type: "string" },
    }, strict: true }));
  } catch (e) { return fallo("argumentos", String(e?.message ?? e).slice(0, 200)); }
  if (orden !== "pasar") return fallo("argumentos", "Orden: pasar");
  if (!a.negocio || !NEGOCIOS.has(a.negocio)) return fallo("argumentos", "--negocio tiene que ser blas o qa-forestal.");
  if (a.beneficiario !== undefined && !/^[\w-]{1,40}$/.test(a.beneficiario)) return fallo("argumentos", "--beneficiario no es un id válido.");
  if (a.beneficiario && a["persona-nueva"]) return fallo("argumentos", "O una persona del panel o una persona nueva, no las dos.");
  if (a.recordada && !a.beneficiario) return fallo("argumentos", "--recordada va con --beneficiario.");
  if (a.excluir !== undefined && !/^[\w-]{1,40}$/.test(a.excluir)) return fallo("argumentos", "--excluir no es un id válido.");
  if (a.preguntar && (a.beneficiario || a["persona-nueva"])) return fallo("argumentos", "--preguntar no va con una persona elegida.");
  const ahora = deps.ahora ?? Date.now;
  const t0 = ahora();

  let crudo;
  try { crudo = JSON.parse(deps.entrada ?? (await leerStdin())); } catch { return fallo("argumentos", "La fila no llegó en JSON por STDIN."); }
  const rev = revisarFila(crudo);
  if (!rev.ok) return fallo("datos_invalidos", `No paso esa fila: ${rev.motivo}.`);
  const f = rev.fila;

  let config;
  try { config = deps.config ?? leerCredenciales(); } catch (e) { return fallo("sin_sesion", String(e?.message ?? e)); }
  const negocio = negocioDeConfig(config, a.negocio);
  if (!negocio) return fallo("argumentos", `El negocio «${a.negocio}» no está en la conexión.`);
  // La misma sesión que la conexión y las tareas (sesion-<negocio>.json): un solo login para todos.
  const cliente = crearCliente({ config, fetch: deps.fetch, puertoAbierto: deps.puertoAbierto, carpetaSesiones: deps.carpetaSesiones ?? CARPETA_SESIONES });
  const leer = (ruta, query) => cliente.pedir(negocio, { metodo: "GET", ruta, query, sinRecorte: true });
  const quien = texto(a.quien, 80);
  const anotar = deps.anotar ?? anotarReal;
  const huella = { negocio, por: "telegram", quien, origen: "registro-telegram", clave: f.clave };

  /** Escribe (o, a seco, junta el pedido). Queda en el registro de la conexión con quién tocó y cuándo.
   * Plazo: si las lecturas ya tardaron más de 100 s, NO se empieza a escribir (el buzón espera 240 s: un POST a medias
   * que el buzón corta es una escritura incierta). Un corte de red o de tiempo DESPUÉS de mandar = «incierto»: el
   * buzón espera 3 min y vuelve a mirar si quedó (la clave) antes de reintentar. */
  const pedidosSeco = [];
  async function escribir(herramienta, pedido) {
    if (a.seco) { pedidosSeco.push(pedido); return { ok: true, status: 0, datos: { seco: true } }; }
    if (ahora() - t0 > PLAZO_ESCRIBIR_MS) return { ok: false, status: 0, error: { codigo: "servidor", mensaje: "el panel tardó demasiado en las lecturas; no grabé nada" } };
    const t1 = Date.now();
    const r = await cliente.pedir(negocio, pedido);
    anotar({ herramienta, tipo: "confirmar", ...huella, metodo: pedido.metodo, ruta: pedido.ruta, cuando: new Date().toISOString(), confirmado: true, status: r.status, ms: Date.now() - t1, error: r.ok ? undefined : r.error?.codigo });
    if (!r.ok && r.status === 0 && (r.error?.codigo === "servidor" || r.error?.codigo === "compilando")) {
      return { ok: false, status: 0, error: { codigo: "incierto", mensaje: `${r.error?.mensaje ?? "sin respuesta"} (puede que sí se haya grabado)` } };
    }
    return r;
  }
  const seco = (extra) => {
    anotar({ herramienta: "registro_pasar", tipo: "confirmar", ...huella, cuando: new Date().toISOString(), confirmado: true, seco: true });
    return { ok: true, seco: true, negocio, tipo: f.tipo, pedidos: pedidosSeco, ...extra };
  };

  if (f.tipo === "Adelanto") {
    const rp = await leer(RUTAS.personas);
    if (!rp.ok) return delPanel(rp, "No pude leer las personas del panel");
    const personas = filasDe(rp.datos).filter((p) => p && p.id && p.activo !== false);
    let persona = null, personaNueva = false;
    const exactas = personas.filter((p) => plano(p.nombre) === plano(f.persona));
    if (a.preguntar) {
      // «👤 Otra persona»: NUNCA elige solo (aunque haya una exacta) y no ofrece la que Brandon acaba de rechazar.
      const resto = personas.filter((p) => String(p.id) !== a.excluir);
      const vistos = new Set();
      const ops = [...exactas.filter((p) => String(p.id) !== a.excluir).map((p) => ({ id: String(p.id), nombre: texto(p.nombre, 80), documento: texto(p.documento, 20) || null })), ...masParecidas(resto, f.persona)]
        .filter((o) => (vistos.has(o.id) ? false : vistos.add(o.id))).slice(0, 3);
      return fallo("persona", `Elige otra persona para «${f.persona}».`, { parecidas: ops, repetidos: nombresRepetidos(ops) });
    }
    if (a.beneficiario) {
      persona = personas.find((p) => String(p.id) === a.beneficiario) ?? null;
      if (!persona) return fallo("persona", `Esa persona ya no está en el panel. ¿Cuál es «${f.persona}»?`, { parecidas: masParecidas(personas, f.persona) });
      // La de la vez pasada no gana a una que se llama EXACTO como lo dijo Brandon: se le pregunta.
      if (a.recordada && exactas.length && !exactas.some((p) => String(p.id) === a.beneficiario)) {
        const ops = [persona, ...exactas].slice(0, 3).map((p) => ({ id: String(p.id), nombre: texto(p.nombre, 80), documento: texto(p.documento, 20) || null }));
        return fallo("persona", `En el panel hay una persona «${f.persona}» distinta de la que elegiste la vez pasada.`, { parecidas: ops, repetidos: nombresRepetidos(ops) });
      }
    } else {
      if (exactas.length === 1) persona = exactas[0];
      else if (exactas.length > 1) {
        const ops = exactas.slice(0, 3).map((p) => ({ id: String(p.id), nombre: texto(p.nombre, 80), documento: texto(p.documento, 20) || null }));
        return fallo("persona", `Hay ${exactas.length} personas que se llaman «${f.persona}» en el panel: ¿cuál es?`, { parecidas: ops, repetidos: true });
      }
      else if (!a["persona-nueva"]) {
        const ops = masParecidas(personas, f.persona);
        return fallo("persona", `«${f.persona}» no está igual en el panel.`, { parecidas: ops, repetidos: nombresRepetidos(ops) });
      }
      else {
        const nombre = texto(f.persona, 120);
        const r = await escribir("adelanto_persona_crear", pedidoPersona(nombre));
        if (!r.ok) return delPanel(r, "No pude crear a la persona en el panel");
        persona = a.seco ? { id: "(nueva)", nombre } : /** @type {any} */ (r.datos);
        if (!persona?.id) return fallo("servidor", "El panel creó la persona pero no devolvió su id; no grabé el adelanto.");
        personaNueva = true;
      }
    }
    const quienEs = { id: String(persona.id), nombre: texto(persona.nombre, 80) };
    if (!personaNueva) {
      // Antes de escribir: ¿ya está? Con la clave = es nuestro (ya pasó). Mismo monto y día sin la clave = posible duplicado.
      const ra = await leer(RUTAS.adelantos, { beneficiarioId: quienEs.id });
      if (!ra.ok) return delPanel(ra, "No pude revisar los adelantos de esa persona; no grabé nada");
      const vivos = filasDe(ra.datos).filter((x) => x && x.status !== "CANCELADO" && (x.direccion ?? "DADO") === "DADO");
      const nuestro = vivos.find((x) => String(x.notas ?? "").includes(f.clave));
      if (nuestro) return { ok: true, hecho: "ya_estaba", destino: "adelantos", negocio, codigo: nuestro.codigoOperacion ?? null, id: nuestro.id ?? null, persona: quienEs };
      const igual = vivos.find((x) => igualMonto(x.montoAdelantado, f.monto) && diaLima(x.fechaAdelanto) === f.dia);
      if (igual && !a.forzar) {
        return fallo("duplicado", `Ya hay un adelanto de ${soles(f.monto)} a ${quienEs.nombre} ese día en el panel.`, {
          duplicado: { codigo: igual.codigoOperacion ?? null, id: igual.id ?? null, monto: Number(igual.montoAdelantado), dia: diaLima(igual.fechaAdelanto), persona: quienEs.nombre },
        });
      }
    }
    const pedido = pedidoAdelanto(f, quienEs.id);
    if (a.seco) { pedidosSeco.push(pedido); return seco({ destino: "adelantos", persona: quienEs, personaNueva }); }
    const r = await escribir("adelanto_dar", pedido);
    if (!r.ok) return delPanel(r, "El panel no grabó el adelanto");
    const d = /** @type {any} */ (r.datos) ?? {};
    return { ok: true, hecho: d.repetido ? "ya_estaba" : "grabado", destino: "adelantos", negocio, codigo: d.codigoOperacion ?? null, id: d.id ?? null, persona: quienEs, personaNueva };
  }

  if (f.tipo === "Gasto") {
    const rg = await leer(RUTAS.gastos, { from: f.dia, to: f.dia });
    if (!rg.ok) return delPanel(rg, "No pude revisar los gastos de ese día; no grabé nada");
    const delDia = filasDe(rg.datos).filter((x) => x && x.recurring !== true);
    const nuestro = delDia.find((x) => String(x.notes ?? "").includes(f.clave));
    if (nuestro) return { ok: true, hecho: "ya_estaba", destino: "gastos", negocio, codigo: null, id: nuestro.id ?? null, categoria: nuestro.category ?? null };
    const igual = delDia.find((x) => igualMonto(x.amount, f.monto));
    if (igual && !a.forzar) {
      return fallo("duplicado", `Ya hay un gasto de ${soles(f.monto)} ese día en el panel.`, {
        duplicado: { codigo: null, id: igual.id ?? null, monto: Number(igual.amount), dia: f.dia, detalle: texto(igual.description, 80) },
      });
    }
    const pedido = pedidoGasto(f);
    if (a.seco) { pedidosSeco.push(pedido); return seco({ destino: "gastos", categoria: pedido.cuerpo.category }); }
    const r = await escribir("gasto_registrar", pedido);
    if (!r.ok) return delPanel(r, "El panel no grabó el gasto");
    const d = /** @type {any} */ (r.datos) ?? {};
    return { ok: true, hecho: "grabado", destino: "gastos", negocio, codigo: null, id: d.id ?? null, categoria: pedido.cuerpo.category };
  }

  // Ingreso → la caja abierta (la más nueva si hubiera varias). La clave se busca en TODAS las cajas que lista el panel
  // (cada una trae sus últimos 100 movimientos): un primer intento pudo grabar en una caja que después se cerró.
  const rc = await leer(RUTAS.cajas);
  if (!rc.ok) return delPanel(rc, "No pude leer las cajas del panel");
  const cajas = filasDe(rc.datos).filter((c) => c && c.id);
  const abiertas = cajas.filter((c) => String(c.status ?? "").toLowerCase() === "abierta")
    .sort((x, y) => String(y.openedAt ?? "").localeCompare(String(x.openedAt ?? "")));
  const enCajas = cajas.flatMap((c) => (Array.isArray(c.movements) ? c.movements.map((m) => ({ ...m, _caja: String(c.id) })) : []));
  const yaEnOtra = enCajas.find((x) => x && x.type === "ingreso" && String(x.description ?? "").includes(f.clave));
  if (yaEnOtra) return { ok: true, hecho: "ya_estaba", destino: "caja", negocio, codigo: null, id: yaEnOtra.id ?? null, caja: yaEnOtra._caja };
  if (!abiertas.length) return fallo("sin_caja", "No hay una caja abierta en el panel: ábrela en Caja y vuelve a tocar «Pasar al panel».");
  const caja = abiertas[0];
  // La caja anota el ingreso con la fecha de HOY: si la fila es de otro día, Brandon lo decide.
  if (diaLima(new Date(ahora())) !== f.dia && !a["otro-dia"]) {
    const [, mm, dd] = f.dia.split("-");
    return fallo("otro_dia", `Ese ingreso es del ${dd}/${mm}: en la caja del panel quedaría con la fecha de hoy.`);
  }
  const rm = await leer(RUTAS.movimientos, { cashRegisterId: String(caja.id) });
  if (!rm.ok) return delPanel(rm, "No pude revisar los movimientos de la caja; no grabé nada");
  const ingresos = filasDe(rm.datos).filter((x) => x && x.type === "ingreso");
  const nuestro = ingresos.find((x) => String(x.description ?? "").includes(f.clave));
  if (nuestro) return { ok: true, hecho: "ya_estaba", destino: "caja", negocio, codigo: null, id: nuestro.id ?? null, caja: String(caja.id) };
  const igual = ingresos.find((x) => igualMonto(x.amount, f.monto) && diaLima(x.createdAt) === f.dia);
  if (igual && !a.forzar) {
    return fallo("duplicado", `Ya hay un ingreso de ${soles(f.monto)} ese día en la caja del panel.`, {
      duplicado: { codigo: null, id: igual.id ?? null, monto: Number(igual.amount), dia: diaLima(igual.createdAt), detalle: texto(igual.description, 80) },
    });
  }
  const pedido = pedidoIngreso(f, String(caja.id));
  if (a.seco) { pedidosSeco.push(pedido); return seco({ destino: "caja", caja: String(caja.id) }); }
  const r = await escribir("caja_movimiento", pedido);
  if (!r.ok) return delPanel(r, "El panel no grabó el ingreso");
  const d = /** @type {any} */ (r.datos) ?? {};
  return { ok: true, hecho: "grabado", destino: "caja", negocio, codigo: null, id: d.id ?? null, caja: String(caja.id) };
}

function leerStdin() {
  return new Promise((res, rej) => {
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { s += c; if (s.length > 20_000) rej(new Error("grande")); });
    process.stdin.on("end", () => res(s));
    process.stdin.on("error", rej);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mayor = Number(process.versions.node.split(".")[0]);
  const r = mayor < 20 ? fallo("node", `Node ${process.versions.node} es muy viejo.`) : await registroTelegram(process.argv.slice(2)).catch((e) => fallo("servidor", String(e?.message ?? e).slice(0, 200)));
  process.stdout.write(`${JSON.stringify(r)}\n`);
  process.exitCode = r.ok ? 0 : 1;
}
