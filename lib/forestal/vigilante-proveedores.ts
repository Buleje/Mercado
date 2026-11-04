/**
 * El vigilante mensual de proveedores (04-11-2026).
 *
 * «Revisar a todos» mira la libreta HOY. Pero la lista de SERFOR se actualiza y
 * OSINFOR mete permisos a su lista roja cualquier mes: el proveedor limpio de
 * octubre puede estar sancionado en noviembre. Una vez al mes el cron repite la
 * revisión y le avisa al dueño SOLO lo que entró desde la vez anterior — es como
 * el vigilante que da la vuelta al patio: no grita «todo bien» cada noche, solo
 * toca la puerta si vio algo nuevo.
 *
 * Qué cuenta como «entró» (una huella por hecho, no por proveedor):
 *  · una sanción de SERFOR por su RUC/DNI o por su permiso (también la del
 *    permiso a nombre de otra persona, que dice «ámbar» en la pantalla);
 *  · un permiso suyo en la lista roja de OSINFOR;
 *  · un PAU en trámite de OSINFOR sobre un permiso suyo.
 * Las coincidencias SOLO por nombre no cuentan: un homónimo no merece un
 * WhatsApp que haga dejar de comprarle a alguien en regla.
 *
 * Cálculo puro (sin red ni base): la ruta del cron revisa y guarda.
 */

import { clavesDeSancion, type CoincidenciaInfractor } from "./serfor-infractores";
import { codigoConsultable } from "./osinfor-supervisiones";
import type { FilaRevision } from "./revision-proveedores";

export type TipoHuella = "serfor" | "serfor_permiso_otro" | "osinfor_roja" | "osinfor_pau";

export interface Huella {
  /** La clave principal (la que se compara con la vez anterior). */
  clave: string;
  /** Otras claves del MISMO hecho (la sanción publicada con y sin documento): si cualquiera ya estaba, no es nueva. */
  alias: string[];
  tipo: TipoHuella;
  /** Del proveedor (la fila de la libreta), para agrupar el mensaje. */
  nombre: string;
  documento: string | null;
  /** Lo que se le cuenta al dueño sobre ese hecho, ya en palabras. */
  detalle: string;
}

/** Lo que se guarda por negocio (`Settings.featureFlagsJson[CLAVE_VIGILANTE]`). */
export interface EstadoVigilante {
  v: 1;
  /** ISO de la revisión que dejó este estado. */
  revisadoEn: string;
  corteSerfor: string | null;
  /** Todas las claves y alias vistos, ordenadas. */
  claves: string[];
}

export interface HuellasActuales {
  huellas: Huella[];
  /** Códigos de permiso a los que OSINFOR no contestó (o no se llegó): lo que tenían antes se conserva. */
  osinforSinDato: string[];
}

export interface Comparacion {
  primeraVez: boolean;
  nuevas: Huella[];
  estado: EstadoVigilante;
}

/** YYYY-MM-DD → dd/mm/aaaa (fecha sola: sin zona horaria de por medio). */
export function fechaCorta(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Un instante (ISO) como día de LIMA, dd/mm/aaaa: después de las 19:00 en el servidor (UTC) ya es mañana. */
export function diaDeLima(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function codigoDe(codigo: string): string {
  return codigoConsultable(codigo) ?? codigo.trim().toUpperCase();
}

function textoSancion(s: CoincidenciaInfractor): string {
  const fecha = fechaCorta(s.fecha);
  const res = `resolución ${s.resolucion}${fecha ? ` del ${fecha}` : ""}`;
  if (s.motivo === "permiso_otro") {
    return `su permiso${s.tituloHab ? ` ${s.tituloHab}` : ""} tiene una sanción de SERFOR a nombre de ${s.infractor} (${res})`;
  }
  return `sanción de SERFOR (${res})`;
}

/** Las huellas de hoy. Un mismo hecho que sale en dos filas (la ficha y su permiso suelto) cuenta una vez. */
export function huellasDeFilas(filas: readonly FilaRevision[]): HuellasActuales {
  const porClave = new Map<string, Huella>();
  const sinDato = new Set<string>();
  const sumar = (h: Huella) => {
    if (![h.clave, ...h.alias].some((k) => porClave.has(k))) porClave.set(h.clave, h);
  };

  for (const f of filas) {
    for (const s of f.sanciones) {
      if (s.motivo === "nombre") continue;
      const [principal, ...alias] = clavesDeSancion(s).map((k) => `serfor:${k}`);
      if (!principal) continue;
      sumar({
        clave: principal,
        alias,
        tipo: s.motivo === "permiso_otro" ? "serfor_permiso_otro" : "serfor",
        nombre: f.nombre,
        documento: f.documento,
        detalle: textoSancion(s),
      });
    }
    for (const p of f.permisos) {
      const codigo = codigoDe(p.codigo);
      if (!p.osinfor) {
        sinDato.add(codigo);
        continue;
      }
      if (p.osinfor.enRoja > 0) {
        sumar({
          clave: `osinfor-roja:${codigo}`,
          alias: [],
          tipo: "osinfor_roja",
          nombre: f.nombre,
          documento: f.documento,
          detalle: `el permiso ${p.codigo} entró a la lista roja de OSINFOR`,
        });
      }
      if (p.osinfor.pauEnTramite > 0) {
        sumar({
          clave: `osinfor-pau:${codigo}`,
          alias: [],
          tipo: "osinfor_pau",
          nombre: f.nombre,
          documento: f.documento,
          detalle: `OSINFOR le abrió un proceso (PAU) al permiso ${p.codigo}`,
        });
      }
    }
  }
  return { huellas: [...porClave.values()], osinforSinDato: [...sinDato] };
}

/** El código de permiso de una clave de OSINFOR («osinfor-roja:25-PUC/…» → «25-PUC/…»), o null. */
function codigoDeClaveOsinfor(clave: string): string | null {
  const m = /^osinfor-(?:roja|pau):(.+)$/.exec(clave);
  return m ? (m[1] ?? null) : null;
}

/**
 * Lo nuevo contra la vez anterior y el estado que se guarda.
 *
 * · Primera vez (sin estado): se guarda la foto y NO se avisa nada — lo que ya
 *   estaba sancionado lo muestran el aviso del ingreso y «Revisar a todos»;
 *   esto vigila lo que CAMBIA.
 * · Un permiso al que OSINFOR no contestó conserva lo que tenía: si no, el mes
 *   que OSINFOR se cae «sale» de la lista y el siguiente «vuelve a entrar» (un
 *   aviso falso).
 * · Lo que salió de la lista (o el proveedor que se borró de la libreta) se
 *   quita sin avisar; si vuelve a entrar, avisa de nuevo.
 */
export function compararConAnterior(
  anterior: EstadoVigilante | null,
  actual: HuellasActuales,
  ctx: { ahora: string; corteSerfor: string | null },
): Comparacion {
  const claves = new Set<string>();
  for (const h of actual.huellas) {
    claves.add(h.clave);
    for (const a of h.alias) claves.add(a);
  }

  if (!anterior) {
    return {
      primeraVez: true,
      nuevas: [],
      estado: { v: 1, revisadoEn: ctx.ahora, corteSerfor: ctx.corteSerfor, claves: [...claves].sort() },
    };
  }

  const antes = new Set(anterior.claves);
  const nuevas = actual.huellas.filter((h) => ![h.clave, ...h.alias].some((k) => antes.has(k)));

  const sinDato = new Set(actual.osinforSinDato);
  for (const k of anterior.claves) {
    const codigo = codigoDeClaveOsinfor(k);
    if (codigo && sinDato.has(codigo)) claves.add(k);
  }

  return {
    primeraVez: false,
    nuevas,
    estado: { v: 1, revisadoEn: ctx.ahora, corteSerfor: ctx.corteSerfor, claves: [...claves].sort() },
  };
}

export interface MensajeVigilante {
  titulo: string;
  /** Una línea para la campana del panel. */
  cuerpo: string;
  /** Texto de WhatsApp (negritas con *). */
  whatsapp: string;
  /** HTML de Telegram (escapado). */
  telegram: string;
  /** Cuántos proveedores distintos. */
  proveedores: number;
}

const MAX_EN_MENSAJE = 8;

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Agrupa por proveedor: un renglón por persona con todo lo que entró. */
export function mensajeVigilante(
  nuevas: readonly Huella[],
  ctx: { negocio: string | null; desde: string | null; corteSerfor: string | null },
): MensajeVigilante {
  const porProveedor = new Map<string, { nombre: string; documento: string | null; detalles: string[] }>();
  for (const h of nuevas) {
    const k = `${h.documento ?? ""}|${h.nombre}`;
    const p = porProveedor.get(k) ?? { nombre: h.nombre, documento: h.documento, detalles: [] };
    if (!p.detalles.includes(h.detalle)) p.detalles.push(h.detalle);
    porProveedor.set(k, p);
  }
  const lista = [...porProveedor.values()];
  const n = lista.length;
  const titulo =
    n === 1
      ? "1 proveedor tuyo entró a la lista de sancionados"
      : `${n} proveedores tuyos entraron a la lista de sancionados`;
  const desde = diaDeLima(ctx.desde);
  const corte = fechaCorta(ctx.corteSerfor);
  const quien = (p: (typeof lista)[number]) =>
    `${p.nombre}${p.documento ? ` (${p.documento.length === 8 ? "DNI" : "RUC"} ${p.documento})` : ""}`;
  const fuente = `Fuente: Registro de Infractores de SERFOR${corte ? ` (lista al ${corte})` : ""} y mapa de OSINFOR.`;
  const donde = "Libro CTP → Cumplimiento → Revisar a todos";
  const intro = desde ? `Desde la última revisión (${desde}):` : "Desde la última revisión:";

  const renglonesWa = lista.slice(0, MAX_EN_MENSAJE).map((p) => `• *${quien(p)}*: ${p.detalles.join("; ")}.`);
  const renglonesTg = lista
    .slice(0, MAX_EN_MENSAJE)
    .map((p) => `• <b>${escHtml(quien(p))}</b>: ${escHtml(p.detalles.join("; "))}.`);
  const resto = n > MAX_EN_MENSAJE ? `…y ${n - MAX_EN_MENSAJE} más.` : null;
  const cierre = `Antes de comprarle, lee la resolución en tu panel: ${donde}.`;

  const whatsapp = [
    `🚨 *${titulo}*${ctx.negocio ? ` — ${ctx.negocio}` : ""}`,
    "",
    intro,
    ...renglonesWa,
    ...(resto ? [resto] : []),
    "",
    cierre,
    fuente,
  ].join("\n");
  const telegram = [
    `🚨 <b>${escHtml(titulo)}</b>${ctx.negocio ? ` — ${escHtml(ctx.negocio)}` : ""}`,
    "",
    escHtml(intro),
    ...renglonesTg,
    ...(resto ? [escHtml(resto)] : []),
    "",
    escHtml(cierre),
    escHtml(fuente),
  ].join("\n");

  const primero = lista[0];
  const cuerpo = primero
    ? `${quien(primero)}: ${primero.detalles[0] ?? ""}${n > 1 ? `, y ${n - 1} más` : ""}. Revísalo antes de comprarle.`
    : "";
  return { titulo, cuerpo, whatsapp, telegram, proveedores: n };
}
