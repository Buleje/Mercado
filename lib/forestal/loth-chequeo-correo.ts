/**
 * loth-chequeo-correo — el correo del chequeo del Libro TH (26-10, Brandon:
 * «que el chequeo te mande un correo el día que aparece algo que puede multar,
 * como "PO1 de Blas vence en 7 días"»). PURO: recibe el chequeo ya leído
 * (`chequeoAvanzado`) y decide qué avisar, qué es nuevo y cómo se escribe.
 *
 *   · Qué se avisa: lo de severidad multa, y las advertencias con plazo
 *     (preliminar o despacho por asentar) a 7 días o menos. El resto de las
 *     advertencias (ficha, transporte, papeles por subir) se ven en la
 *     pantalla: no tienen fecha que se venza. El vencimiento del plan NO va
 *     acá (`AVISA_OTRO_CRON`): ya tiene su propio aviso.
 *   · El último día (26-10, Brandon): el caso con plazo que llega a 0 días se
 *     avisa OTRA vez, con su propia clave (`<clave>|ultimo`) y un asunto que
 *     lo dice. Ese día sólo existe esa clave, y al sellarla se sella también
 *     la de siempre: si el caso apareció ya en 0 días sale un aviso, no dos.
 *   · Canales: el mismo aviso va a la campana del panel, al WhatsApp del
 *     negocio y al correo (el cron decide cuáles; acá se escribe cada uno).
 *   · Qué es nuevo: lo que no está en el registro de lo ya avisado
 *     (`loth-chequeo-avisados:<tenantId>`, PlatformSetting). La clave de cada
 *     caso es estable: el chequeo + el caso SIN su cuenta regresiva («te
 *     quedan 5 días» cambia cada día; «GTF 19-000003 (PO1)» no).
 *   · Caducidad: un caso avisado que desaparece se borra del registro; si
 *     vuelve, se avisa de nuevo. Sólo se borra si su chequeo SE LEYÓ entero:
 *     lo no leído no es «en orden», y borrarlo repetiría el correo mañana.
 *
 * El correo nunca dice «todo en orden»: si algo no se pudo leer, lo nombra.
 */

import { escapeHtml } from "@/lib/email/escape-html";
import type { LothCheck } from "./loth-compliance";

/** Las advertencias con plazo se avisan desde este día antes de vencer. */
export const DIAS_AVISO_CORREO = 7;

/** Techo del registro por negocio: los más recientes (un libro real avisa decenas). */
export const TOPE_REGISTRO_AVISADOS = 500;

/** Cumplimiento › Chequeo del Libro TH. */
export const URL_CHEQUEO_TH = "/admin?tab=loth-libro-operaciones&vista=cumplimiento&sub=chequeo";

/** Configuración › Datos del negocio (ahí está «Avisos por correo»). */
export const URL_AVISOS_CORREO = "/admin?tab=config&vista=negocio";

/** PlatformSetting con lo ya avisado del negocio. */
export const claveAvisadosChequeo = (tenantId: string): string => `loth-chequeo-avisados:${tenantId}`;

/** Lo que se agrega a la clave del caso el día que vence su plazo: un segundo aviso. */
export const SUFIJO_ULTIMO_DIA = "|ultimo";

/** Chequeos cuyo caso lleva una cifra que cambia sola (días, m³): la clave es el sujeto. */
const CLAVE_POR_SUJETO: ReadonlySet<string> = new Set([
  "plan_vencido",
  "preliminar_vencida",
  "preliminar_vieja",
  "despacho_sin_asentar",
  "despacho_por_asentar",
  "bloque_excedido",
  "bloque_excederia",
]);

/** Advertencias con fecha que se vence: se avisan a `DIAS_AVISO_CORREO` días o menos. */
const CON_PLAZO: ReadonlySet<string> = new Set(["preliminar_vieja", "despacho_por_asentar"]);

/**
 * Chequeos que ya avisa OTRO cron y este correo salta (26-10, decisión del
 * coordinador): el plan por vencer lo avisa `loth-plan-vencimiento` a los
 * 90/30/7/0 días por campana, WhatsApp y correo; repetirlo acá le mandaba a
 * Blas dos correos sobre PO1 el mismo día. `plan_vencido` (ya vencido, multa)
 * SÍ se queda: es lo que se arriesga a una multa hoy.
 */
export const AVISA_OTRO_CRON: ReadonlySet<string> = new Set(["plan_por_vencer"]);

/**
 * Chequeos que se arman plan por plan: con un plan sin leer, un caso puede
 * faltar sin estar resuelto (`conLoLeido` del servidor). Con `sinLeer` no se podan.
 */
const POR_PLAN: ReadonlySet<string> = new Set([
  "bloque_excedido",
  "bloque_excederia",
  "plan_vencido",
  "papeles_vencidos",
  "papeles_faltan",
  "ficha_incompleta",
  "preliminar_vencida",
  "preliminar_vieja",
]);

/** Un caso que va en el correo. */
export interface AvisoDelChequeo {
  /** `chequeo|sujeto` — estable día a día. */
  clave: string;
  /** La clave del chequeo (`preliminar_vieja`). */
  chequeo: string;
  /** El caso tal como lo dice la pantalla. */
  caso: string;
  /** Severidad multa (`error`); si no, advertencia con plazo. */
  multa: boolean;
  /** Días que quedan (0 = hoy); `null` = el caso no tiene plazo que contar. */
  quedan: number | null;
  /** Hoy vence su plazo: es el recordatorio del último día (`clave` termina en `SUFIJO_ULTIMO_DIA`). */
  ultimoDia: boolean;
  /** La clave del caso sin el sufijo del último día (igual a `clave` el resto de los días). */
  claveBase: string;
}

/** Lo ya avisado: clave del caso → AAAA-MM-DD (Lima) del correo que lo avisó. */
export interface RegistroAvisados {
  v: 1;
  avisados: Record<string, string>;
}

export const REGISTRO_VACIO: RegistroAvisados = { v: 1, avisados: {} };

/** «GTF 19-000003 (PO1): guía del …» → «GTF 19-000003 (PO1)». Sin «: », el caso entero. */
export function sujetoDelCaso(caso: string): string {
  const t = caso.trim();
  const i = t.indexOf(": ");
  return i > 0 ? t.slice(0, i) : t;
}

export function claveDelCaso(chequeo: string, caso: string): string {
  const base = CLAVE_POR_SUJETO.has(chequeo) ? sujetoDelCaso(caso) : caso.trim();
  return `${chequeo}|${base.replace(/\s+/g, " ").slice(0, 200)}`;
}

/**
 * Los días que le quedan a un caso con plazo, leídos de su frase (las de
 * `preliminaresViejas` y `fraseDespacho`; el test las amarra).
 */
export function diasQueQuedan(caso: string): number | null {
  if (/\bhoy es el último día\b/i.test(caso)) return 0;
  const m = /\bte quedan?\s+(\d+)\s+días?\b/i.exec(caso);
  return m ? Number(m[1]) : null;
}

/**
 * Los casos que van al aviso, del más urgente al menos: lo que vence HOY (aún
 * se puede evitar la multa), las multas (en el orden del catálogo) y las
 * advertencias por los días que les quedan.
 */
export function avisosDelChequeo(checks: readonly LothCheck[], umbralDias: number = DIAS_AVISO_CORREO): AvisoDelChequeo[] {
  const ultimos: AvisoDelChequeo[] = [];
  const multas: AvisoDelChequeo[] = [];
  const conPlazo: AvisoDelChequeo[] = [];
  const vistas = new Set<string>();
  for (const c of checks) {
    if (AVISA_OTRO_CRON.has(c.key)) continue;
    const multa = c.severity === "error";
    if (!multa && !CON_PLAZO.has(c.key)) continue;
    for (const caso of c.casos ?? []) {
      const quedan = CON_PLAZO.has(c.key) ? diasQueQuedan(caso) : null;
      if (!multa && (quedan == null || quedan > umbralDias)) continue;
      const claveBase = claveDelCaso(c.key, caso);
      if (vistas.has(claveBase)) continue;
      vistas.add(claveBase);
      const ultimoDia = !multa && quedan === 0;
      const aviso: AvisoDelChequeo = {
        clave: ultimoDia ? `${claveBase}${SUFIJO_ULTIMO_DIA}` : claveBase,
        chequeo: c.key,
        caso: caso.trim(),
        multa,
        quedan,
        ultimoDia,
        claveBase,
      };
      (ultimoDia ? ultimos : multa ? multas : conPlazo).push(aviso);
    }
  }
  conPlazo.sort((a, b) => (a.quedan ?? 0) - (b.quedan ?? 0));
  return [...ultimos, ...multas, ...conPlazo];
}

/** El registro guardado, tolerante: lo que no se entiende se descarta (avisar de más es mejor que callar). */
export function leerRegistroAvisados(raw: unknown): RegistroAvisados {
  if (!raw || typeof raw !== "object") return { v: 1, avisados: {} };
  const avisados = (raw as { avisados?: unknown }).avisados;
  if (!avisados || typeof avisados !== "object") return { v: 1, avisados: {} };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(avisados as Record<string, unknown>)) {
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && k.includes("|")) out[k] = v;
  }
  return { v: 1, avisados: out };
}

/**
 * Quita del registro lo que ya no está (caducidad), salvo que no se pueda
 * saber: su chequeo no se leyó, su lista vino cortada al tope, o se arma plan
 * por plan y algún plan quedó sin leer. Lo de un chequeo que avisa otro cron
 * sale siempre: este correo ya no lo avisa (registros de antes del 26-10).
 */
function podar(registro: RegistroAvisados, checks: readonly LothCheck[], vigentes: ReadonlySet<string>, hayPlanSinLeer: boolean): RegistroAvisados {
  const porClave = new Map(checks.map((c) => [c.key, c]));
  const avisados: Record<string, string> = {};
  for (const [clave, fecha] of Object.entries(registro.avisados)) {
    const chequeo = clave.slice(0, clave.indexOf("|"));
    if (AVISA_OTRO_CRON.has(chequeo)) continue;
    const c = porClave.get(chequeo);
    const noSeSabe = !c || (c.casos?.length ?? 0) < c.count || (hayPlanSinLeer && POR_PLAN.has(chequeo));
    if (noSeSabe || vigentes.has(clave)) avisados[clave] = fecha;
  }
  return { v: 1, avisados };
}

/** Los más recientes primero, hasta el tope. */
function conTope(avisados: Record<string, string>): Record<string, string> {
  const filas = Object.entries(avisados);
  if (filas.length <= TOPE_REGISTRO_AVISADOS) return avisados;
  filas.sort((a, b) => b[1].localeCompare(a[1]));
  return Object.fromEntries(filas.slice(0, TOPE_REGISTRO_AVISADOS));
}

export interface PlanCorreoChequeo {
  /** Todo lo que hoy amerita correo (lo nuevo y lo ya avisado). */
  avisos: AvisoDelChequeo[];
  /** Lo que todavía no se avisó: el correo sale sólo si hay alguno. */
  nuevos: AvisoDelChequeo[];
  /** El registro si el correo SALIÓ: podado + lo nuevo con la fecha de hoy. */
  registroSiSale: RegistroAvisados;
  /** El registro si no salió (o no había nada): sólo podado. Lo nuevo se reintenta mañana. */
  registroSiNoSale: RegistroAvisados;
}

export function planearCorreoChequeo(o: {
  checks: readonly LothCheck[];
  sinLeer: readonly string[];
  registro: RegistroAvisados;
  /** AAAA-MM-DD (Lima). */
  hoy: string;
  umbralDias?: number;
}): PlanCorreoChequeo {
  const avisos = avisosDelChequeo(o.checks, o.umbralDias);
  /* El último día siguen vigentes las dos claves del caso: la de siempre no se poda. */
  const vigentes = new Set(avisos.flatMap((a) => [a.clave, a.claveBase]));
  const nuevos = avisos.filter((a) => !(a.clave in o.registro.avisados));
  const podado = podar(o.registro, o.checks, vigentes, o.sinLeer.length > 0);
  const conNuevos = { ...podado.avisados };
  for (const a of nuevos) {
    conNuevos[a.clave] = o.hoy;
    // El caso que aparece ya en su último día no debe un aviso «de 7 días» después.
    conNuevos[a.claveBase] ??= o.hoy;
  }
  return {
    avisos,
    nuevos,
    registroSiSale: { v: 1, avisados: conTope(conNuevos) },
    registroSiNoSale: { v: 1, avisados: conTope(podado.avisados) },
  };
}

/** ¿Cambia lo guardado? (para no escribir la misma fila cada mañana). */
export function registroCambia(antes: RegistroAvisados, despues: RegistroAvisados): boolean {
  const a = Object.keys(antes.avisados);
  const d = Object.keys(despues.avisados);
  return a.length !== d.length || d.some((k) => antes.avisados[k] !== despues.avisados[k]);
}

/* ── El correo ─────────────────────────────────────────────────────────── */

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const sinParentesis = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
const corto = (s: string, max = 70) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** «GTF 19-000003 a 5 días del plazo», «PO1 vencido»: lo que cabe en el asunto. */
export function titularDelAviso(a: AvisoDelChequeo): string {
  const sujeto = sujetoDelCaso(a.caso);
  switch (a.chequeo) {
    case "plan_vencido":
      return /suspendido/i.test(a.caso) ? `${sujeto} suspendido` : `${sujeto} vencido`;
    case "preliminar_vieja":
    case "despacho_por_asentar": {
      const quien = `${a.chequeo === "despacho_por_asentar" ? "despacho " : ""}${sinParentesis(sujeto)}`;
      return a.quedan === 0 ? `${quien}: hoy es el último día` : a.quedan != null ? `${quien} a ${dias(a.quedan)} del plazo` : corto(a.caso);
    }
    case "preliminar_vencida":
      return `${sinParentesis(sujeto)} fuera de plazo`;
    case "despacho_sin_asentar":
      return `despacho ${sinParentesis(sujeto)} fuera de plazo`;
    default: {
      // «Árbol 977 (PO 12, tala #38…): no está en el censo» → «Árbol 977: no está en el censo».
      const resto = a.caso.trim().slice(sujeto.length).replace(/^:\s*/, "");
      return corto(resto ? `${sinParentesis(sujeto)}: ${resto}` : sujeto, 60);
    }
  }
}

/** «pasar la GTF 19-000003 al libro»: lo que hay que hacer hoy, dicho para el asunto. */
function queVence(a: AvisoDelChequeo): string {
  const guia = sinParentesis(sujetoDelCaso(a.caso));
  return a.chequeo === "despacho_por_asentar" ? `asentar el despacho de la ${guia} en el libro` : `pasar la ${guia} al libro`;
}

/**
 * «Libro TH: 2 cosas que pueden multarte — PO1 vencido y GTF 19-000003 a 5 días del plazo».
 * Si algo vence HOY, el asunto empieza por eso: «Hoy es el último día para
 * pasar la GTF 19-000003 al libro (y 1 más que puede multarte)».
 * Nombra hasta dos casos de chequeos DISTINTOS (dos árboles fuera del censo
 * no dicen más que uno; un árbol y un papel vencido, sí) y cuenta el resto.
 */
export function asuntoDelCorreo(avisos: readonly AvisoDelChequeo[]): string {
  const n = avisos.length;
  if (n === 0) return "Libro TH: nada nuevo que pueda multarte";
  const ultimo = avisos.find((a) => a.ultimoDia);
  if (ultimo) {
    const resto = n - 1;
    const cola = resto > 0 ? ` (y ${resto} más que ${resto === 1 ? "puede" : "pueden"} multarte)` : "";
    return `Hoy es el último día para ${queVence(ultimo)}${cola}`;
  }
  const cuantas = n === 1 ? "1 cosa que puede multarte" : `${n} cosas que pueden multarte`;
  const vistos = new Set<string>();
  const t: string[] = [];
  for (const a of avisos) {
    if (t.length === 2) break;
    if (vistos.has(a.chequeo)) continue;
    vistos.add(a.chequeo);
    t.push(titularDelAviso(a));
  }
  const resto = n - t.length;
  const cola = resto > 0 ? `${t.join(", ")} y ${resto} más` : t.join(" y ");
  return `Libro TH: ${cuantas} — ${cola}`;
}

export interface CorreoChequeo {
  asunto: string;
  html: string;
}

/**
 * El correo: por chequeo, qué es, los casos, la norma corta, qué hacer y el
 * enlace a Cumplimiento › Chequeo. `base` = URL absoluta del panel, sin «/» al final.
 * Sólo datos del negocio que se pasa (el llamador lee el chequeo de ESE tenant).
 */
export function armarCorreoChequeo(o: {
  negocio: string | null;
  avisos: readonly AvisoDelChequeo[];
  checks: readonly LothCheck[];
  sinLeer: readonly string[];
  base: string;
}): CorreoChequeo {
  const base = o.base.replace(/\/+$/, "");
  const enlace = `${base}${URL_CHEQUEO_TH}`;
  /* Un bloque por chequeo; lo que vence hoy, en su propio bloque «Último día». */
  const porBloque = new Map<string, AvisoDelChequeo[]>();
  const porChequeo = new Map<string, number>();
  for (const a of o.avisos) {
    const k = a.ultimoDia ? `${a.chequeo}${SUFIJO_ULTIMO_DIA}` : a.chequeo;
    porBloque.set(k, [...(porBloque.get(k) ?? []), a]);
    porChequeo.set(a.chequeo, (porChequeo.get(a.chequeo) ?? 0) + 1);
  }
  const ultimoBloque = new Map([...porBloque.entries()].map(([k, lista]) => [lista[0]?.chequeo ?? k, k]));
  const checks = new Map(o.checks.map((c) => [c.key, c]));
  const negocio = escapeHtml(o.negocio?.trim() || "Tu negocio");

  const bloques = [...porBloque.entries()].map(([k, lista]) => {
    const clave = lista[0]?.chequeo ?? k;
    const c = checks.get(clave);
    const etiqueta = lista[0]?.multa ? "Puede multarte" : lista[0]?.ultimoDia ? "Último día" : "Se vence pronto";
    const titulo = c?.title ?? clave;
    // «Siguen N casos más» una sola vez por chequeo, en su último bloque.
    const otros = ultimoBloque.get(clave) === k ? Math.max(0, (c?.count ?? lista.length) - (porChequeo.get(clave) ?? lista.length)) : 0;
    const casos = lista.map((a) => `<li style="margin:4px 0">${escapeHtml(a.caso)}</li>`).join("");
    return `<div style="margin:18px 0;padding-top:12px;border-top:1px solid silver">
  <p style="margin:0 0 4px"><strong>${escapeHtml(etiqueta)}: ${escapeHtml(titulo)}</strong></p>
  ${c?.description ? `<p style="margin:4px 0">${escapeHtml(c.description)}</p>` : ""}
  <ul style="margin:6px 0;padding-left:20px">${casos}</ul>
  ${otros > 0 ? `<p style="margin:4px 0">Siguen ${otros} ${otros === 1 ? "caso más" : "casos más"} de esto en el chequeo (ya te avisé o tienen más plazo).</p>` : ""}
  ${c?.norma ? `<p style="margin:4px 0">Norma: ${escapeHtml(c.norma)}</p>` : ""}
  ${c?.action ? `<p style="margin:4px 0">Qué hacer: ${escapeHtml(c.action)}</p>` : ""}
  <p style="margin:6px 0"><a href="${escapeHtml(enlace)}">Corregir en el chequeo del Libro TH</a></p>
</div>`;
  });

  const n = o.avisos.length;
  const ultimos = o.avisos.filter((a) => a.ultimoDia).length;
  const hoyVence =
    ultimos === 0 ? "" : ` Hoy es el último día de plazo para ${ultimos === 1 ? "una" : ultimos}: mañana ya puede ser multa.`;
  const intro =
    n === 0
      ? `<p>${negocio} · Libro TH: entre lo que pude revisar hoy, no hay nada nuevo que pueda multarte.</p>`
      : ultimos === n
        ? `<p>${negocio} · Libro TH: hoy es el último día de plazo para ${n === 1 ? "esto" : `estas ${n} cosas`}; mañana ya puede ser multa.</p>`
        : `<p>${negocio} · Libro TH: el chequeo de hoy encontró ${n === 1 ? "1 cosa que puede" : `${n} cosas que pueden`} traerte una multa si no ${n === 1 ? "la corriges" : "las corriges"}.${hoyVence}</p>`;
  const sinLeer =
    o.sinLeer.length > 0
      ? `<p style="margin:14px 0"><strong>No pude revisar:</strong> ${escapeHtml(o.sinLeer.join("; "))}. Míralo en el chequeo antes de darlo por bueno.</p>`
      : "";
  const pie = `<p style="margin-top:22px;font-size:13px">Te llega porque tienes prendidos los avisos forestales por correo. Para apagarlos: <a href="${escapeHtml(`${base}${URL_AVISOS_CORREO}`)}">Configuración › Datos del negocio › Avisos por correo</a>. El vencimiento de tus planes te llega en su propio aviso.</p>`;

  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;background:white;color:black;padding:16px">
${intro}
${bloques.join("\n")}
${sinLeer}
${pie}
</div>`;
  return { asunto: asuntoDelCorreo(o.avisos), html };
}

/* ── La campana y el WhatsApp ──────────────────────────────────────────── */

/** El WhatsApp: el asunto y el enlace, en texto plano. `base` = URL absoluta del panel. */
export function mensajeWhatsAppChequeo(avisos: readonly AvisoDelChequeo[], base: string): string {
  return `${asuntoDelCorreo(avisos)}. Ábrelo: ${base.replace(/\/+$/, "")}${URL_CHEQUEO_TH}`;
}

export interface CampanaDelChequeo {
  /** Mismo `entityId` mientras el aviso sea el mismo: el reintento de mañana reusa la campana. */
  entityId: string;
  severidad: "HIGH" | "MEDIUM";
  titulo: string;
  cuerpo: string;
}

/** Hash corto y estable (FNV-1a de 32 bits): nombra un conjunto de casos sin guardarlos en el id. */
function hashCorto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * La campana del panel: el asunto de título y, en el cuerpo, hasta tres casos
 * con su titular. Grave (HIGH) si algo ya multa o vence hoy.
 */
export function campanaDelChequeo(avisos: readonly AvisoDelChequeo[]): CampanaDelChequeo {
  const claves = avisos.map((a) => a.clave).sort();
  const lista = avisos.slice(0, 3).map(titularDelAviso);
  const resto = avisos.length - lista.length;
  return {
    entityId: `loth-chequeo-${hashCorto(claves.join("\n"))}`,
    severidad: avisos.some((a) => a.multa || a.ultimoDia) ? "HIGH" : "MEDIUM",
    titulo: asuntoDelCorreo(avisos),
    cuerpo: `${lista.join(" · ")}${resto > 0 ? ` · y ${resto} más` : ""}. Corrígelo en el chequeo del Libro TH.`,
  };
}
