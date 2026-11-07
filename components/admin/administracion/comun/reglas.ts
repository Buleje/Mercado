/**
 * Qué revisa cada tipo de actividad (ADR-501 §3), dicho como lo dice Brandon.
 * Una sola tabla para el selector, la lista y las plantillas.
 */
import { Axe, Bell, HandCoins, Receipt, Scale, Users, Wallet, type LucideIcon } from "@buleje/design-system/icons";
import type { CanalAgenda, ReglaAgenda, RolResponsableAgenda } from "@/lib/agenda/tipos";

export interface ReglaUi {
  label: string;
  icon: LucideIcon;
  /** Cómo sabe el panel que ya se hizo (va al ⓘ y al pie del selector). */
  comoSabe: string;
}

export const REGLA_UI: Record<ReglaAgenda, ReglaUi> = {
  asistencia: {
    label: "Llevar la asistencia",
    icon: Users,
    comoSabe: "Mira cuántas personas activas del equipo marcaron ese día.",
  },
  servicio_aserrio: {
    label: "Servicio de aserrío",
    icon: Axe,
    comoSabe: "Mira si hay corridas de aserrío registradas ese día (puedes contar sólo las de terceros).",
  },
  gastos_ingresos: {
    label: "Registrar gastos e ingresos",
    icon: Wallet,
    comoSabe: "Mira si hay gastos, ingresos, la caja cerrada o movimientos de la cuenta forestal ese día.",
  },
  adelantos: {
    label: "Revisar adelantos",
    icon: HandCoins,
    comoSabe: "Mira los adelantos abiertos y los cobros pactados para ese día.",
  },
  cuenta_tercero: {
    label: "Ver la cuenta de un tercero",
    icon: Scale,
    comoSabe: "No hay cómo saberlo solo: la marcas tú cuando la revisaste.",
  },
  facturas: {
    label: "Llevar las facturas",
    icon: Receipt,
    comoSabe: "La marcas tú. El panel te dice cuántos comprobantes hubo, como referencia.",
  },
  manual: {
    label: "Recordatorio",
    icon: Bell,
    comoSabe: "La marcas tú cuando la hiciste.",
  },
};

export const ORDEN_REGLAS: readonly ReglaAgenda[] = [
  "asistencia",
  "servicio_aserrio",
  "gastos_ingresos",
  "adelantos",
  "cuenta_tercero",
  "facturas",
  "manual",
];

export const CANAL_UI: Record<CanalAgenda, { label: string; hint: string }> = {
  campana: { label: "Campana del panel", hint: "Aparece en los avisos del panel" },
  reporte_diario: { label: "Resumen del día", hint: "Entra en el resumen que te llega cada mañana" },
  telegram: { label: "Telegram", hint: "Te llega por el bot del negocio (se conecta en Automatizaciones)" },
  n8n: { label: "n8n", hint: "Se manda a tu flujo de n8n (se conecta en Automatizaciones)" },
  google: { label: "Google Calendar", hint: "Se copia a tu Google Calendar (se conecta en Conectar)" },
};

export const ROL_UI: Record<RolResponsableAgenda, string> = {
  admin: "Administrador",
  owner: "Dueño",
  tienda_owner: "Dueño de la tienda",
  manager: "Encargado",
  cajero: "Cajero",
  almacenero: "Almacenero",
  analista: "Analista",
};
