/**
 * contactos-envio — a quién se le mandan los papeles del permiso por WhatsApp
 * (Brandon 08-10: «escribes el número o eliges un contacto»).
 *
 * Los contactos salen de lo que el negocio ya tiene —las cuentas de Adelantos,
 * el directorio forestal, los proveedores— más los números que ya se usaron
 * para enviar, que se recuerdan SIN schema (en las preferencias del panel del
 * negocio, `Settings.featureFlagsJson › admin_prefs.contactosEnvio`). Un mismo
 * número que aparece en dos fuentes es UN contacto: gana el ya usado.
 *
 * Ley 29733: cada número usado guarda DE DÓNDE salió (`fuentes`) y sólo vuelve
 * a un rol que puede leer todas esas fuentes en su módulo
 * (`guardadosVisibles`): un almacenero sin Adelantos no recibe el nombre y el
 * teléfono de una cuenta de Adelantos que eligió un admin. Los guardados de
 * antes, sin fuente, sólo los ven admin y dueño.
 *
 * El número va a `wa.me`, que exige el código de país: un celular peruano de 9
 * dígitos se guarda con «51»; uno de 10 a 15 dígitos ya lo trae.
 *
 * PURO: sin React, sin fetch, sin DOM, sin `Date.now`.
 */

import { z } from "zod";

export type FuenteContacto = "envio" | "adelantos" | "directorio" | "proveedor";

/** De dónde salió un número usado: una fuente del negocio o escrito a mano. */
export const FUENTES_GUARDADAS = ["manual", "adelantos", "directorio", "proveedor"] as const;
export type FuenteGuardada = (typeof FUENTES_GUARDADAS)[number];

export const ETIQUETA_FUENTE: Record<FuenteContacto, string> = {
  envio: "Ya enviado",
  adelantos: "Cuenta de Adelantos",
  directorio: "Directorio forestal",
  proveedor: "Proveedor",
};

/** Un contacto para elegir: nombre, número (con 51) y de dónde salió. */
export interface ContactoEnvio {
  nombre: string;
  telefono: string;
  fuente: FuenteContacto;
}

/** Lo que se guarda de cada número usado. */
export interface ContactoGuardado {
  telefono: string;
  nombre: string;
  usos: number;
  /** ISO del último envío. */
  ultimoUso: string;
  /** De dónde salió (todas las veces que se usó). Sin esto = guardado de antes: sólo admin y dueño. */
  fuentes?: FuenteGuardada[];
}

/** Cuántos números usados se recuerdan (los más recientes). */
export const TOPE_CONTACTOS_GUARDADOS = 40;
/** Cuántos días vive cada enlace (pedido de Brandon: «enlaces que vencen en 7 días»). */
export const DIAS_ENLACE = 7;
/** Hasta cuántos documentos por envío (cada uno es un enlace en el mensaje). */
export const TOPE_DOCS_ENVIO = 20;
/** Cuántos enlaces públicos crea un negocio por hora (cuenta enlaces, no pedidos: un envío trae hasta 20). */
export const TOPE_ENLACES_HORA = 100;

/**
 * El número listo para `wa.me` o `null` si no puede ser un teléfono: un
 * celular peruano de 9 dígitos (empieza con 9) recibe el «51»; uno de 10 a 15
 * dígitos ya trae su código de país y va tal cual (+1 202 555 0123 →
 * 12025550123, no 5112025550123). Lo demás (un DNI de 8 dígitos tipeado en el
 * campo del teléfono, un «-») no es número.
 */
export function normalizarTelefono(crudo: string | null | undefined): string | null {
  const d = (crudo ?? "").replace(/\D/g, "");
  if (d.length === 9) return d.startsWith("9") ? `51${d}` : null;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/** El enlace de WhatsApp de un número YA normalizado (`waLink` le volvería a poner 51 a uno de afuera). */
export function enlaceWhatsApp(telefono: string, texto: string): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}

/** El número para leer: «+51 987 654 321». */
export function telefonoLegible(t: string): string {
  const m = /^51(\d{3})(\d{3})(\d{3})$/.exec(t);
  return m ? `+51 ${m[1]} ${m[2]} ${m[3]}` : `+${t}`;
}

const guardadoSchema = z.object({
  telefono: z.string().regex(/^\d{10,15}$/),
  nombre: z.string().max(120),
  usos: z.number().int().nonnegative(),
  ultimoUso: z.string().max(40),
  fuentes: z.array(z.enum(FUENTES_GUARDADAS)).max(FUENTES_GUARDADAS.length).optional(),
});

/** Los guardados como vienen de las preferencias; lo que no se entiende se descarta. */
export function leerGuardados(crudo: unknown): ContactoGuardado[] {
  if (!Array.isArray(crudo)) return [];
  const out: ContactoGuardado[] = [];
  for (const x of crudo) {
    const r = guardadoSchema.safeParse(x);
    if (r.success) out.push(r.data);
  }
  return out;
}

/**
 * Recuerda un envío: el número sube primero, suma un uso y conserva el nombre
 * si no llega otro. Las fuentes se SUMAN (nunca se aflojan): un número que un
 * admin eligió de Adelantos sigue siendo de Adelantos aunque después alguien lo
 * escriba a mano. Elegirlo de «Ya enviado» (`envio`) no agrega fuente; un
 * guardado de antes (sin fuentes) sigue así.
 */
export function recordarContacto(
  lista: readonly ContactoGuardado[],
  nuevo: { telefono: string; nombre?: string | null; fuente?: FuenteContacto | "manual" },
  ahora: string,
): ContactoGuardado[] {
  const previo = lista.find((c) => c.telefono === nuevo.telefono);
  const nombre = (nuevo.nombre ?? "").trim().slice(0, 120) || previo?.nombre || "";
  const nueva = nuevo.fuente && nuevo.fuente !== "envio" ? [nuevo.fuente] : [];
  const fuentes = previo && !previo.fuentes ? undefined : [...new Set([...(previo?.fuentes ?? []), ...nueva])];
  const actualizado: ContactoGuardado = {
    telefono: nuevo.telefono,
    nombre,
    usos: (previo?.usos ?? 0) + 1,
    ultimoUso: ahora,
    ...(fuentes && fuentes.length > 0 ? { fuentes } : {}),
  };
  return [actualizado, ...lista.filter((c) => c.telefono !== nuevo.telefono)].slice(0, TOPE_CONTACTOS_GUARDADOS);
}

/**
 * Los números usados que este rol puede ver: los que salieron sólo de fuentes
 * que el rol lee en su módulo (`puedeLeer`); los de antes, sin fuente, sólo
 * admin y dueño.
 */
export function guardadosVisibles(
  guardados: readonly ContactoGuardado[],
  x: { puedeLeer: (f: FuenteGuardada) => boolean; adminODueno: boolean },
): ContactoGuardado[] {
  return guardados.filter((g) => (g.fuentes ? g.fuentes.every(x.puedeLeer) : x.adminODueno));
}

/**
 * Todos los contactos, sin repetir número: primero los ya usados (el último
 * envío arriba), después los demás por nombre. Sin teléfono usable no entra.
 */
export function unirContactos(
  guardados: readonly ContactoGuardado[],
  otros: readonly { nombre: string | null | undefined; telefono: string | null | undefined; fuente: Exclude<FuenteContacto, "envio"> }[],
): ContactoEnvio[] {
  const vistos = new Set<string>();
  const out: ContactoEnvio[] = [];
  for (const g of [...guardados].sort((a, b) => b.ultimoUso.localeCompare(a.ultimoUso))) {
    if (vistos.has(g.telefono)) continue;
    vistos.add(g.telefono);
    out.push({ nombre: g.nombre || telefonoLegible(g.telefono), telefono: g.telefono, fuente: "envio" });
  }
  const resto: ContactoEnvio[] = [];
  for (const o of otros) {
    const t = normalizarTelefono(o.telefono);
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    resto.push({ nombre: (o.nombre ?? "").trim() || telefonoLegible(t), telefono: t, fuente: o.fuente });
  }
  resto.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return [...out, ...resto];
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 15/10» de un `YYYY-MM-DD` (aritmética en UTC: es una fecha, no un instante). */
export function diaConNombre(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DIAS_SEMANA[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}

/** El día en que vencen los enlaces creados `hoy` (`YYYY-MM-DD`, Lima). */
export function venceEl(hoy: string, dias = DIAS_ENLACE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(hoy);
  if (!m) return hoy;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias));
  return d.toISOString().slice(0, 10);
}

/** El mensaje de WhatsApp: el asunto, un enlace por documento y hasta cuándo sirven. */
export function mensajeDeEnvio(o: { asunto: string; enlaces: readonly { nombre: string; url: string }[]; vence: string }): string {
  const lineas = o.enlaces.map((e, i) => `${i + 1}. ${e.nombre}\n${e.url}`);
  return [o.asunto.trim(), "", ...lineas, "", `Los enlaces vencen el ${diaConNombre(o.vence)}.`].join("\n");
}

/** El cuerpo del POST que recuerda el envío y lo deja en la auditoría de cada documento. */
export const envioSchema = z.object({
  telefono: z.string().trim().min(6).max(24),
  nombre: z.string().trim().max(120).optional(),
  documentos: z.array(z.string().trim().min(1).max(40)).min(1).max(TOPE_DOCS_ENVIO),
  /** De dónde se eligió el número (`manual` = escrito a mano): decide quién lo vuelve a ver. */
  fuente: z.enum(["envio", "adelantos", "directorio", "proveedor", "manual"]).optional(),
  /** De qué se trata («GTF 019-001-0000001 · permiso …»): va a la auditoría. */
  referencia: z.string().trim().max(160).optional(),
});
export type EnvioInput = z.infer<typeof envioSchema>;
