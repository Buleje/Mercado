/**
 * Seguimiento a clientes (ADR-508) — a quién escribirle hoy: los que compraron
 * hace 3, 15 o 30 días (su ÚLTIMA compra), con el mensaje sugerido listo para
 * WhatsApp.
 *
 * Fuente de la agenda SIN regla nueva: `REGLAS_AGENDA` tiene un CHECK gemelo en
 * la base (migración 20261018_agenda_administracion) y agregar una regla
 * pediría migrar. Por eso entra como lista propia en «Hoy»
 * (`ResumenAgendaHoy.seguimientos`) y como vencimiento del día en el
 * calendario (origen `seguimiento_clienta`), los dos de sólo lectura.
 *
 * Config por negocio en `featureFlagsJson.seguimientoClientas` (sin columna):
 * `{ activo, dias, mensajes: { "3": "…", "15": "…" } }` con `{nombre}` y
 * `{producto}`. Sin config vale para cualquier negocio con los mensajes de abajo.
 *
 * Puro: lo usan la DB (arma la lista), la vista y los tests.
 */
import { z } from "zod";
import { waLink } from "@/lib/whatsapp-link";
import { sumarDias } from "./recurrencia";
import type { FechaKey } from "./tipos";

export const DIAS_SEGUIMIENTO_DEFECTO = [3, 15, 30] as const;

/** Genéricos: sirven igual a una bodega, una ferretería o una tienda de belleza. */
export const MENSAJES_SEGUIMIENTO_DEFECTO: Readonly<Record<string, string>> = {
  "3": "Hola, {nombre}. ¿Qué tal te fue con {producto}? Si algo no te convenció, cuéntame y lo vemos.",
  "15": "Hola, {nombre}. Ya van dos semanas con {producto}: ¿cómo te va? Cualquier duda, aquí estoy.",
  "30": "Hola, {nombre}. {producto} ya debe estar por acabarse. ¿Te separo otro?",
};
const MENSAJE_SIN_DIA = "Hola, {nombre}. ¿Cómo te fue con {producto}? Aquí estoy para lo que necesites.";

export const configSeguimientoSchema = z.object({
  activo: z.boolean().optional(),
  dias: z.array(z.number().int().min(1).max(180)).min(1).max(6).optional(),
  mensajes: z.record(z.string().regex(/^\d{1,3}$/), z.string().trim().min(1).max(500)).optional(),
});
export type ConfigSeguimientoGuardada = z.infer<typeof configSeguimientoSchema>;

export interface ConfigSeguimiento {
  activo: boolean;
  dias: number[];
  mensajes: Readonly<Record<string, string>>;
}

/** Nunca tira: lo que no pasa el schema vuelve al defecto. */
export function configSeguimientoDeFlags(flags: unknown): ConfigSeguimiento {
  const crudo = flags && typeof flags === "object" ? (flags as Record<string, unknown>).seguimientoClientas : undefined;
  const r = configSeguimientoSchema.safeParse(crudo ?? {});
  const g = r.success ? r.data : {};
  return {
    activo: g.activo ?? true,
    dias: [...new Set(g.dias ?? DIAS_SEGUIMIENTO_DEFECTO)].sort((a, b) => a - b),
    mensajes: { ...MENSAJES_SEGUIMIENTO_DEFECTO, ...(g.mensajes ?? {}) },
  };
}

export interface SeguimientoClienta {
  /** `seg:<celular>:<día de la compra>`: estable mientras no vuelva a comprar. */
  id: string;
  telefono: string;
  nombre: string | null;
  /** Días desde la compra (3, 15, 30…). */
  dia: number;
  compradoEl: FechaKey;
  /** El día en que toca escribirle. */
  fecha: FechaKey;
  producto: string | null;
  mensaje: string;
  /** `null` si el «celular» no trae dígitos (s/n): la fila sale igual, sin enlace. */
  whatsapp: string | null;
}

/** Última compra de un cliente con celular, como la trae la DB. */
export interface UltimaCompra {
  telefono: string;
  dia: FechaKey;
  nombre: string | null;
  producto: string | null;
}

/** Nombres de relleno que el POS o un alta rápida dejan («Cliente 1004», «Público general»): no son un nombre. */
const RELLENO = /^(cliente|clienta|consumidor|p[uú]blico|varios|general|sin|s\/n|qa)$/i;

/** Primer nombre con mayúscula inicial: «MARIA LOPEZ» → «Maria». */
function primerNombre(nombre: string | null): string | null {
  const p = nombre?.trim().split(/\s+/)[0];
  if (!p || /\d/.test(p) || RELLENO.test(p)) return null;
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** Rellena `{nombre}` y `{producto}`; sin nombre se va también la coma de antes («Hola.»). */
export function rellenarMensaje(plantilla: string, nombre: string | null, producto: string | null): string {
  const n = primerNombre(nombre);
  const conNombre = n
    ? plantilla.replace(/\{nombre\}/g, n)
    : plantilla.replace(/\{nombre\}\s*,\s*/g, "").replace(/,?\s*\{nombre\}/g, "");
  const prod = producto?.trim() || "tu compra";
  return conNombre
    .replace(/\{producto\}/g, prod)
    .replace(/^\s*([¿¡]?)([a-záéíóúñ])/, (_m, signo: string, letra: string) => signo + letra.toUpperCase())
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** El seguimiento que le toca a cada compra en cada día de `[desde, hasta]`. */
export function armarSeguimientos(compras: UltimaCompra[], cfg: ConfigSeguimiento, desde: FechaKey, hasta: FechaKey): SeguimientoClienta[] {
  if (!cfg.activo) return [];
  const salida: SeguimientoClienta[] = [];
  for (const c of compras) {
    for (const d of cfg.dias) {
      const fecha = sumarDias(c.dia, d);
      if (fecha < desde || fecha > hasta) continue;
      const mensaje = rellenarMensaje(cfg.mensajes[String(d)] ?? MENSAJE_SIN_DIA, c.nombre, c.producto);
      salida.push({
        id: `seg:${c.telefono}:${c.dia}`,
        telefono: c.telefono,
        nombre: c.nombre?.trim() || null,
        dia: d,
        compradoEl: c.dia,
        fecha,
        producto: c.producto?.trim() || null,
        mensaje,
        whatsapp: waLink(c.telefono, mensaje),
      });
    }
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dia - b.dia || (a.nombre ?? "~").localeCompare(b.nombre ?? "~"));
}
