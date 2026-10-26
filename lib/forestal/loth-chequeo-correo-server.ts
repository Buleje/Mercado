/**
 * loth-chequeo-correo-server — junta lo que el aviso del chequeo del Libro TH
 * necesita de UN negocio: el dueño (correo, celular) y su interruptor, el
 * chequeo avanzado con los ajustes de fábrica y el registro de lo ya avisado. Lo usan el cron
 * `loth-chequeo-correo` (envía y sella) y la vista previa del dueño (sólo lee).
 *
 * El chequeo corre con `verPapeles: true`: el correo va al dueño, que ve todos
 * los papeles del plan. Los ajustes del navegador (días de preliminar,
 * licencia) no viajan al servidor: el correo usa los de fábrica.
 */
import "server-only";
import { ForestLothChequeoDB } from "@/lib/db/forest-loth-chequeo.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { avisoCorreoActivo } from "@/lib/avisos-correo";
import { chequeoAvanzado } from "./loth-chequeo-server";
import { AJUSTES_CHEQUEO_DEFECTO, type ChequeoAvanzado } from "./loth-chequeo-tipos";
import {
  armarCorreoChequeo,
  campanaDelChequeo,
  mensajeWhatsAppChequeo,
  planearCorreoChequeo,
  type CampanaDelChequeo,
  type CorreoChequeo,
  type PlanCorreoChequeo,
  type RegistroAvisados,
} from "./loth-chequeo-correo";

/** La URL absoluta del panel para los enlaces del correo. */
export function baseDelPanel(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://buleje.pe").replace(/\/+$/, "");
}

export interface DestinoDelCorreo {
  negocio: string | null;
  /** `Tenant.ownerEmail`; `null` = no hay a dónde mandarlo. */
  correo: string | null;
  /** El interruptor «forestal» de Avisos por correo (fail-open). Sólo apaga el correo. */
  activo: boolean;
  /** `Tenant.ownerPhone` en dígitos (9 o más, como `loth-plan-vencimiento`); `null` = sin WhatsApp. */
  telefono: string | null;
}

/** A quién le llegaría y si el interruptor lo deja salir. */
export async function destinoDelCorreoChequeo(tenantId: string): Promise<DestinoDelCorreo> {
  if (!tenantId) throw new Error("tenantId is required");
  const [contacto, activo] = await Promise.all([TenantsDB.contactoDelDueno(tenantId), avisoCorreoActivo(tenantId, "forestal")]);
  /* `contactoDelDueno` también busca por slug: se exige que sea ESTE tenant. */
  const propio = contacto && contacto.id === tenantId ? contacto : null;
  const telefono = propio?.ownerPhone?.replace(/\D/g, "") ?? "";
  return { negocio: propio?.name ?? null, correo: propio?.ownerEmail?.trim() || null, activo, telefono: telefono.length >= 9 ? telefono : null };
}

export interface CorreoDelDia {
  chequeo: ChequeoAvanzado;
  registro: RegistroAvisados;
  plan: PlanCorreoChequeo;
  /** El correo con lo nuevo (lo que saldría); `null` = no hay nada nuevo. */
  correo: CorreoChequeo | null;
  /** Lo mismo para la campana y el WhatsApp; `null` = no hay nada nuevo. */
  campana: CampanaDelChequeo | null;
  whatsapp: string | null;
}

/** El chequeo de hoy y lo que el correo diría. Sólo lee: ni envía ni toca el registro. */
export async function correoDelChequeoDeHoy(tenantId: string, negocio: string | null, ahora: number = Date.now()): Promise<CorreoDelDia> {
  if (!tenantId) throw new Error("tenantId is required");
  const [chequeo, registro] = await Promise.all([
    chequeoAvanzado(tenantId, { ajustes: AJUSTES_CHEQUEO_DEFECTO, verPapeles: true, ahora }),
    ForestLothChequeoDB.avisadosPorCorreo(tenantId),
  ]);
  const plan = planearCorreoChequeo({ checks: chequeo.checks, sinLeer: chequeo.sinLeer, registro, hoy: chequeo.hoy });
  if (plan.nuevos.length === 0) return { chequeo, registro, plan, correo: null, campana: null, whatsapp: null };
  const base = baseDelPanel();
  return {
    chequeo,
    registro,
    plan,
    correo: armarCorreoChequeo({ negocio, avisos: plan.nuevos, checks: chequeo.checks, sinLeer: chequeo.sinLeer, base }),
    campana: campanaDelChequeo(plan.nuevos),
    whatsapp: mensajeWhatsAppChequeo(plan.nuevos, base),
  };
}
