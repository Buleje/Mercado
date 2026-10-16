/**
 * La cola «Por imprimir» del monte — lógica PURA (16-10).
 *
 * La guía se prepara en la oficina y se imprime en el talonario autocopiativo
 * que está en el monte, donde sólo hay un celular y una matricial. Cada envío
 * es un `TrabajoImpresion` (contrato en `gtf-salida-tipos.ts`):
 *
 *   pendiente ──«Ya la imprimí»──▶ impresa ──N° de hoja──▶ confirmada
 *        │                            │                  └─(no coincide)─▶ observada
 *        └────────────── N° de hoja directo ─────────────┘
 *   cualquiera (menos anulado) ──«Anular el envío»──▶ anulado
 *
 * Una guía tiene a lo sumo UN trabajo vivo (pendiente, impresa u observada).
 * Reenviar una pendiente la actualiza. Una ya impresa (impresa, observada o
 * CONFIRMADA) ya gastó su hoja del talonario: otro envío sólo con «Reimprimir
 * en otra hoja» y su motivo, que queda escrito en el trabajo nuevo.
 *
 * El control del N°: el talonario trae la numeración preimpresa y la guía se
 * numera con ella («025-001-0971772» va en la hoja N° 0971772). Si el que
 * imprimió anota otra hoja, el trabajo queda «observada» con el motivo, y la
 * oficina lo ve en la fila de la guía.
 */

import type { EstadoTrabajo, HojaSalida, TrabajoImpresion } from "./gtf-salida-tipos";

/** Lo que guarda la cola además del contrato: quién la revisó y cuándo. */
export interface TrabajoCola extends TrabajoImpresion {
  revisadaEn?: string;
  revisadaPor?: string;
}

/** El celular del monte al que va el WhatsApp (editable desde «Enviar al monte»). */
export interface ContactoMonte {
  numero: string;
  actualizado?: { en: string; por: string };
}

export interface AlmacenCola {
  contacto: ContactoMonte | null;
  trabajos: TrabajoCola[];
}

export interface Firma {
  en: string;
  por: string;
}

/** Tope de trabajos guardados: los vivos nunca se podan; de los terminados quedan los más nuevos. */
export const MAX_TRABAJOS = 300;

export const ESTADOS_VIVOS: readonly EstadoTrabajo[] = ["pendiente", "impresa", "observada"];
export const HOJAS_SALIDA: readonly HojaSalida[] = ["guia", "lista"];

export const ETIQUETA_ESTADO: Record<EstadoTrabajo, string> = {
  pendiente: "Por imprimir",
  impresa: "Impresa",
  confirmada: "Confirmada",
  observada: "Observada",
  anulado: "Anulado",
};

export const ETIQUETA_HOJA: Record<HojaSalida, string> = { guia: "Guía", lista: "Lista de trozas" };

export const esVivo = (t: Pick<TrabajoImpresion, "estado">): boolean => ESTADOS_VIVOS.includes(t.estado);

const ESTADOS: readonly EstadoTrabajo[] = ["pendiente", "impresa", "confirmada", "observada", "anulado"];
const texto = (v: unknown, max = 200): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/** Lee lo guardado sin confiar en su forma: un trabajo roto se descarta, no tumba la cola. */
export function normalizarAlmacen(v: unknown): AlmacenCola {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const c = o.contacto as Record<string, unknown> | null | undefined;
  const numero = texto(c?.numero, 20);
  const contacto: ContactoMonte | null = numero
    ? { numero, ...(c?.actualizado && typeof c.actualizado === "object" ? { actualizado: c.actualizado as Firma } : {}) }
    : null;
  const trabajos: TrabajoCola[] = [];
  for (const t of Array.isArray(o.trabajos) ? o.trabajos : []) {
    const r = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const id = texto(r.id, 64);
    const gtfId = texto(r.gtfId, 64);
    const numeroGuia = texto(r.numeroGuia, 60);
    const estado = ESTADOS.find((e) => e === r.estado);
    if (!id || !gtfId || !numeroGuia || !estado) continue;
    const hojas = (Array.isArray(r.hojas) ? r.hojas : []).filter((h): h is HojaSalida => HOJAS_SALIDA.includes(h as HojaSalida));
    trabajos.push({
      id,
      gtfId,
      numeroGuia,
      titular: texto(r.titular) ?? "",
      hojas: hojas.length ? [...new Set(hojas)] : ["guia"],
      perfilId: texto(r.perfilId, 64) ?? "monte",
      estado,
      creadoEn: texto(r.creadoEn, 40) ?? "",
      creadoPor: texto(r.creadoPor, 120) ?? "",
      ...opcional("impresaEn", texto(r.impresaEn, 40)),
      ...opcional("impresaPor", texto(r.impresaPor, 120)),
      ...opcional("fotoDocId", texto(r.fotoDocId, 64)),
      ...opcional("numeroHoja", texto(r.numeroHoja, 20)),
      ...opcional("observacion", texto(r.observacion, 300)),
      ...opcional("revisadaEn", texto(r.revisadaEn, 40)),
      ...opcional("revisadaPor", texto(r.revisadaPor, 120)),
      ...opcional("reimpresion", texto(r.reimpresion, 200)),
      ...opcional("reimpresionDe", texto(r.reimpresionDe, 64)),
    });
  }
  return { contacto, trabajos };
}

function opcional<K extends string>(k: K, v: string | undefined): Partial<Record<K, string>> {
  return v ? ({ [k]: v } as Record<K, string>) : {};
}

/** El correlativo de la guía (el N° de hoja que le toca): el último grupo de dígitos. «025-001-0971772» → «0971772». */
export function correlativoDeGuia(numero: string): string | null {
  const m = /(\d+)\D*$/.exec(numero.trim());
  return m ? m[1] : null;
}

/** Desde 6 dígitos un grupo ya es el correlativo entero: lo de antes es la serie («025-001-0971772»). */
const DIGITOS_CORRELATIVO = 6;

/**
 * Lo que el que imprimió escribió o la IA leyó, limpio: el N° del final, con
 * los dígitos que vienen partidos por espacios o guiones unidos («0971 772» y
 * «0971-772» → «0971772»). Un N° de guía entero deja sólo su correlativo.
 */
export function limpiarNumeroHoja(v: string): string {
  const m = /(\d+(?:(?:\s*[-–]\s*|\s+)\d+)*)\D*$/.exec(v.trim());
  if (!m) return "";
  const grupos = m[1].split(/\D+/);
  const ultimo = grupos[grupos.length - 1];
  return grupos.length > 1 && ultimo.length >= DIGITOS_CORRELATIVO ? ultimo : grupos.join("");
}

const sinCeros = (s: string): string => s.replace(/^0+(?=\d)/, "");

export interface ControlHoja {
  coincide: boolean;
  /** Por qué no coincide, en palabras del monte. */
  observacion?: string;
}

/** ¿La hoja del talonario es la de la guía? Los ceros a la izquierda no cuentan (0971772 = 971772). */
export function controlarHoja(numeroGuia: string, numeroHoja: string): ControlHoja {
  const hoja = limpiarNumeroHoja(numeroHoja);
  const guia = correlativoDeGuia(numeroGuia);
  if (!hoja) return { coincide: false, observacion: "No se anotó el N° de la hoja" };
  if (!guia) return { coincide: true };
  if (sinCeros(hoja) === sinCeros(guia)) return { coincide: true };
  return { coincide: false, observacion: `La hoja dice ${hoja}, la guía es ${guia}` };
}

export interface DatosNuevoTrabajo {
  gtfId: string;
  numeroGuia: string;
  titular: string;
  hojas: readonly HojaSalida[];
  perfilId: string;
  /** «Reimprimir en otra hoja» (la hoja se dañó): sin motivo no se gasta otra hoja del talonario. */
  reimprimir?: { motivo: string };
}

export type ResultadoCrear =
  | { ok: true; almacen: AlmacenCola; trabajo: TrabajoCola; reenviado: boolean }
  | { ok: false; error: "ya_impresa"; trabajo: TrabajoCola };

/** El vivo de esa guía, si lo hay. */
export const vivoDeGuia = (alm: AlmacenCola, gtfId: string): TrabajoCola | undefined =>
  alm.trabajos.find((t) => t.gtfId === gtfId && esVivo(t));

/**
 * Lo que ya salió del talonario para esa guía: el vivo ya impreso (impresa u
 * observada) o, sin vivo, la confirmada más nueva. Con una pendiente viva no
 * hay nada impreso que cuidar: se reenvía. Anulados no cuentan.
 */
export function impresaDeGuia<T extends TrabajoImpresion>(trabajos: readonly T[], gtfId: string): T | undefined {
  const deLaGuia = trabajos.filter((t) => t.gtfId === gtfId);
  const vivo = deLaGuia.find(esVivo);
  if (vivo) return vivo.estado === "pendiente" ? undefined : vivo;
  return deLaGuia
    .filter((t) => t.estado === "confirmada")
    .sort((a, b) => (b.impresaEn ?? b.creadoEn).localeCompare(a.impresaEn ?? a.creadoEn))[0];
}

const MOTIVO_MIN = 3;

/**
 * Mete la guía en la cola. Una pendiente se actualiza (reenvío). Si ya se
 * imprimió (impresa, observada o confirmada) frena con `ya_impresa`: otro
 * envío gastaría OTRA hoja numerada del talonario. Sólo «Reimprimir en otra
 * hoja», con motivo, crea uno nuevo: el impreso vivo se anula con ese motivo
 * y la confirmada queda como está (fue la hoja que salió).
 */
export function crearTrabajo(alm: AlmacenCola, datos: DatosNuevoTrabajo, firma: Firma, nuevoId: string): ResultadoCrear {
  const hojas = HOJAS_SALIDA.filter((h) => datos.hojas.includes(h));
  const vivo = vivoDeGuia(alm, datos.gtfId);
  if (vivo?.estado === "pendiente") {
    const trabajo: TrabajoCola = { ...vivo, hojas: hojas.length ? hojas : vivo.hojas, perfilId: datos.perfilId, numeroGuia: datos.numeroGuia, titular: datos.titular };
    return { ok: true, almacen: reemplazar(alm, trabajo), trabajo, reenviado: true };
  }
  const impresa = impresaDeGuia(alm.trabajos, datos.gtfId);
  const motivo = datos.reimprimir?.motivo.trim().slice(0, 200) ?? "";
  if (impresa && motivo.length < MOTIVO_MIN) return { ok: false, error: "ya_impresa", trabajo: impresa };
  const base =
    impresa && esVivo(impresa)
      ? reemplazar(alm, { ...impresa, estado: "anulado", revisadaEn: firma.en, revisadaPor: firma.por, observacion: `Reimpresa en otra hoja: ${motivo}` })
      : alm;
  const trabajo: TrabajoCola = {
    id: nuevoId,
    gtfId: datos.gtfId,
    numeroGuia: datos.numeroGuia,
    titular: datos.titular,
    hojas: hojas.length ? hojas : ["guia"],
    perfilId: datos.perfilId,
    estado: "pendiente",
    creadoEn: firma.en,
    creadoPor: firma.por,
    ...(impresa ? { reimpresion: motivo, reimpresionDe: impresa.id } : {}),
  };
  return { ok: true, almacen: podar({ ...base, trabajos: [trabajo, ...base.trabajos] }), trabajo, reenviado: false };
}

/**
 * Cierra los envíos vivos de las guías que ya no se imprimen (anulada o
 * borrada después de mandarla): pasan a «anulado» con el motivo y dejan de
 * verse en el monte. `motivos`: gtfId → «La guía se anuló».
 */
export function cerrarPorGuiaCaida(alm: AlmacenCola, motivos: ReadonlyMap<string, string>, firma: Firma): { almacen: AlmacenCola; cambiados: number } {
  let cambiados = 0;
  const trabajos = alm.trabajos.map((t) => {
    const motivo = esVivo(t) ? motivos.get(t.gtfId) : undefined;
    if (!motivo) return t;
    cambiados++;
    return { ...t, estado: "anulado" as const, revisadaEn: firma.en, revisadaPor: firma.por, observacion: motivo };
  });
  return { almacen: cambiados ? { ...alm, trabajos } : alm, cambiados };
}

export type AccionTrabajo =
  | { tipo: "impresa" }
  | { tipo: "foto"; fotoDocId: string }
  | { tipo: "confirmar"; numeroHoja: string; fotoDocId?: string }
  | { tipo: "anular"; motivo?: string };

export type ResultadoAccion =
  | { ok: true; almacen: AlmacenCola; trabajo: TrabajoCola }
  | { ok: false; error: "no_existe" | "estado"; mensaje: string };

/** Desde qué estados vale cada acción. */
const DESDE: Record<AccionTrabajo["tipo"], readonly EstadoTrabajo[]> = {
  impresa: ["pendiente", "impresa"],
  foto: ["pendiente", "impresa", "observada", "confirmada"],
  confirmar: ["pendiente", "impresa", "observada"],
  anular: ["pendiente", "impresa", "observada", "confirmada"],
};

const NO_SE_PUEDE: Record<AccionTrabajo["tipo"], string> = {
  impresa: "Ese envío ya no está por imprimir.",
  foto: "Ese envío está anulado.",
  confirmar: "Ese envío ya se cerró: no se puede confirmar otra vez.",
  anular: "Ese envío ya está anulado.",
};

export function aplicarAccion(alm: AlmacenCola, id: string, accion: AccionTrabajo, firma: Firma): ResultadoAccion {
  const actual = alm.trabajos.find((t) => t.id === id);
  if (!actual) return { ok: false, error: "no_existe", mensaje: "Ese envío ya no está en la cola." };
  if (!DESDE[accion.tipo].includes(actual.estado)) return { ok: false, error: "estado", mensaje: NO_SE_PUEDE[accion.tipo] };
  let t: TrabajoCola = { ...actual };
  switch (accion.tipo) {
    case "impresa":
      if (t.estado === "impresa") return { ok: true, almacen: alm, trabajo: t };
      t = { ...t, estado: "impresa", impresaEn: firma.en, impresaPor: firma.por };
      break;
    case "foto":
      /* La foto de la hoja impresa dice que ya se imprimió: un pendiente pasa a impresa. */
      t = { ...t, fotoDocId: accion.fotoDocId, ...(t.estado === "pendiente" ? { estado: "impresa" as const, impresaEn: firma.en, impresaPor: firma.por } : {}) };
      break;
    case "confirmar": {
      const control = controlarHoja(t.numeroGuia, accion.numeroHoja);
      t = {
        ...t,
        estado: control.coincide ? "confirmada" : "observada",
        numeroHoja: limpiarNumeroHoja(accion.numeroHoja) || accion.numeroHoja.trim().slice(0, 20),
        impresaEn: t.impresaEn ?? firma.en,
        impresaPor: t.impresaPor ?? firma.por,
        revisadaEn: firma.en,
        revisadaPor: firma.por,
        ...(accion.fotoDocId ? { fotoDocId: accion.fotoDocId } : {}),
      };
      if (control.observacion) t.observacion = control.observacion;
      else delete t.observacion;
      break;
    }
    case "anular":
      t = { ...t, estado: "anulado", revisadaEn: firma.en, revisadaPor: firma.por, ...(accion.motivo?.trim() ? { observacion: accion.motivo.trim().slice(0, 300) } : {}) };
      break;
  }
  return { ok: true, almacen: reemplazar(alm, t), trabajo: t };
}

function reemplazar(alm: AlmacenCola, t: TrabajoCola): AlmacenCola {
  return { ...alm, trabajos: alm.trabajos.map((x) => (x.id === t.id ? t : x)) };
}

/** Los vivos se quedan todos; de los terminados, los más nuevos hasta el tope. */
export function podar(alm: AlmacenCola, max = MAX_TRABAJOS): AlmacenCola {
  if (alm.trabajos.length <= max) return alm;
  const vivos = alm.trabajos.filter(esVivo);
  const cupo = Math.max(0, max - vivos.length);
  const terminados = alm.trabajos
    .filter((t) => !esVivo(t))
    .sort((a, b) => (b.revisadaEn ?? b.creadoEn).localeCompare(a.revisadaEn ?? a.creadoEn))
    .slice(0, cupo);
  const quedan = new Set([...vivos, ...terminados].map((t) => t.id));
  return { ...alm, trabajos: alm.trabajos.filter((t) => quedan.has(t.id)) };
}

/** Lo que la fila de la oficina muestra por guía: el vivo, si no el último confirmado. Anulados, nada. */
export function trabajoDeLaFila(trabajos: readonly TrabajoImpresion[]): Map<string, TrabajoImpresion> {
  const m = new Map<string, TrabajoImpresion>();
  for (const t of trabajos) {
    if (t.estado === "anulado") continue;
    const ya = m.get(t.gtfId);
    if (!ya || (esVivo(t) && !esVivo(ya)) || (esVivo(t) === esVivo(ya) && t.creadoEn > ya.creadoEn)) m.set(t.gtfId, t);
  }
  return m;
}

/**
 * Un celular del monte para `wa.me`: sólo dígitos con código de país. Un
 * celular peruano de 9 dígitos (empieza con 9) gana el 51. null = no sirve.
 */
export function normalizarCelular(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return `51${d}`;
  if (/^\d{10,15}$/.test(d)) return d;
  return null;
}

/** El mensaje del WhatsApp: qué guía, en qué hoja y dónde abrirla (la cola, con sesión). Una reimpresión va en otra hoja. */
export function mensajeAlMonte(numeroGuia: string, enlace: string, reimpresion?: string): string {
  if (reimpresion) return `Guía ${numeroGuia} — reimprimir en otra hoja (${reimpresion}) · ábrela aquí: ${enlace}`;
  const hoja = correlativoDeGuia(numeroGuia);
  return `Guía ${numeroGuia} — imprimir en la hoja N° ${hoja ?? numeroGuia} · ábrela aquí: ${enlace}`;
}

/** `wa.me` con el texto; sin número abre WhatsApp para elegir el chat. */
export function enlaceWhatsApp(numero: string | null, mensaje: string): string {
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensaje)}`;
}

/** El enlace a la cola del panel, parado en ese trabajo. Exige sesión: el PDF nunca va en un enlace público. */
export function enlaceCola(origen: string, trabajoId: string): string {
  return `${origen.replace(/\/$/, "")}/admin?tab=loth-libro-operaciones&vista=monte&trabajo=${encodeURIComponent(trabajoId)}`;
}

/** La ruta de la salida (carril salida, ver `gtf-salida-tipos.ts`). */
export function rutaSalida(o: { gtfId: string; formato: "pdf" | "escp"; perfilId: string; hoja: HojaSalida; prueba?: boolean }): string {
  const q = new URLSearchParams({ gtfId: o.gtfId, formato: o.formato, perfil: o.perfilId, hoja: o.hoja });
  /* La hoja de prueba (cruces a 10 mm del borde, sin valores) para calibrar esa impresora. */
  if (o.prueba) q.set("prueba", "1");
  return `/api/admin/forestal/loth/gtf-matricial/salida?${q.toString()}`;
}
