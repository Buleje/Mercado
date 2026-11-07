/**
 * Lo que ve el CLIENTE al abrir el enlace público de una cotización.
 *
 * Lista blanca: sólo salen los campos de abajo. Nada de ids, `createdBy`,
 * `customerId`, `productoId`, costos ni márgenes. Los totales salen como están
 * guardados (los calculó el servidor al crearla): acá no se recalcula nada.
 *
 * La cotización se lee con el `tenantId` DEL TOKEN y el id del token juntos en el
 * WHERE: un token de un negocio nunca muestra la cotización de otro.
 */
import { CotizacionesDB } from "@/lib/db/cotizaciones.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import { igvRateFromSettings } from "@/lib/tax";
import { numeroWhatsapp, puedeAceptarse } from "./aceptacion";
import { leerAceptacion } from "./aceptar-publico";
import { verificarTokenCotizacion } from "./enlace-token";
import { vigenciaVencida } from "./vigencia";

export interface ItemPublico {
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento: number;
  subtotal: number;
}

export interface CotizacionPublica {
  numero: string;
  fecha: string;
  validoHasta: string;
  /** Sigue abierta pero pasó su vigencia (o el negocio ya la marcó vencida). */
  vencida: boolean;
  estado: string;
  cliente: { nombre: string; ruc: string | null };
  items: ItemPublico[];
  subtotal: number;
  igv: number;
  total: number;
  tasaIgv: number;
  /** Las notas que también salen impresas en el PDF de la cotización. */
  notas: string | null;
  /** El cliente puede aceptarla desde el enlace (estado que lo permite y vigencia sin terminar). Tramo 2. */
  aceptable: boolean;
  /** Si la aceptó desde el enlace: quién y cuándo (del registro de actividad). */
  aceptacion: { nombre: string; el: string } | null;
  /** Celular del negocio para «Pedir un cambio» (dígitos con 51), o `null` si no hay. */
  whatsapp: string | null;
  negocio: {
    nombre: string;
    ruc: string | null;
    logoUrl: string | null;
    telefono: string | null;
    direccion: string | null;
    pie: string | null;
  };
}

/** Estados donde la vigencia todavía importa (aceptada, rechazada o convertida ya no «vence»). */
const ABIERTAS = new Set(["BORRADOR", "ENVIADA", "VENCIDA"]);

/** `null` = enlace no válido (alterado, vencido, de otro negocio o la cotización ya no existe). */
export async function leerCotizacionPublica(token: string, ahora: number = Date.now()): Promise<CotizacionPublica | null> {
  const v = verificarTokenCotizacion(token, ahora);
  if (!v.valido) return null;

  const cot = await CotizacionesDB.getById(v.cotizacionId, v.tenantId).catch((err) => {
    logger.error("[cotizacion-publica] leer la cotización falló", { error: String(err) });
    return null;
  });
  if (!cot || cot.tenantId !== v.tenantId) return null;

  const fueAceptada = cot.status === "ACEPTADA" || cot.status === "CONVERTIDA";
  const [membrete, ajustes, aceptacion] = await Promise.all([
    MembreteDB.del(v.tenantId).catch((err) => {
      logger.warn("[cotizacion-publica] sin membrete", { error: String(err) });
      return null;
    }),
    SettingsDB.get(v.tenantId).catch((err) => {
      logger.warn("[cotizacion-publica] sin ajustes: IGV por defecto", { error: String(err) });
      return null;
    }),
    fueAceptada ? leerAceptacion(v.tenantId, v.cotizacionId) : Promise.resolve(null),
  ]);

  return {
    numero: cot.numero,
    fecha: cot.createdAt,
    validoHasta: cot.validoHasta,
    vencida: ABIERTAS.has(cot.status) && (cot.status === "VENCIDA" || vigenciaVencida(cot.validoHasta, ahora)),
    estado: cot.status,
    cliente: { nombre: cot.clienteNombre, ruc: cot.clienteRuc ?? null },
    items: cot.items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnit: i.precioUnit,
      descuento: i.descuento,
      subtotal: i.subtotal,
    })),
    subtotal: cot.subtotal,
    igv: cot.igv,
    total: cot.total,
    tasaIgv: igvRateFromSettings(ajustes?.taxRate),
    notas: cot.notas?.trim() || null,
    aceptable: puedeAceptarse(cot.status, cot.validoHasta, ahora),
    aceptacion,
    whatsapp: numeroWhatsapp(membrete?.telefono),
    negocio: {
      nombre: membrete?.nombre?.trim() || "Cotización",
      ruc: membrete?.ruc ?? null,
      logoUrl: membrete?.logoUrl ?? null,
      telefono: membrete?.telefono ?? null,
      direccion: membrete?.direccion ?? null,
      pie: membrete?.pie ?? null,
    },
  };
}
