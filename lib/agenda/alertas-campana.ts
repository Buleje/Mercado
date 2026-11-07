/**
 * Agenda (ADR-501 §4) — lo que la campana «Ahora» muestra de la agenda. Puro y sin
 * imports de servidor: el servidor arma las alertas dentro de `ResumenAgendaHoy`
 * (`GET /api/admin/agenda/hoy`) y el cliente las saca con `alertasDeAgenda`.
 *
 * Enganche (lo hace el hilo principal en use-alertas-consolidadas.ts):
 *   if (puedePedir("/api/admin/agenda/hoy", rol)) leer("/api/admin/agenda/hoy", fresco)
 *   …  ...alertasDeAgenda(respuesta)
 *
 * Tres tipos, con id estable por día (la campana no repite lo mismo):
 *  · `agenda-vencida:<actividadId>:<fecha>` (critical): pendiente de hoy cuya hora ya pasó.
 *  · `agenda-hoy:<fecha>` (warning): las demás pendientes de hoy, agrupadas.
 *  · `agenda-atrasadas:<fecha>` (warning): atrasadas de los últimos 7 días, agrupadas.
 */
import type { AlertaAgenda, FechaKey, OcurrenciaDTO } from "./tipos";

const HREF_HOY = "/admin?tab=administracion&vista=hoy";
const MAX_NOMBRES = 3;

function nombres(os: OcurrenciaDTO[]): string {
  const unicos = [...new Set(os.map((o) => o.nombre))];
  const vistos = unicos.slice(0, MAX_NOMBRES).join(", ");
  const resto = unicos.length - MAX_NOMBRES;
  return resto > 0 ? `${vistos} y ${resto} más` : vistos;
}

const abierta = (o: OcurrenciaDTO) => o.estado === "pendiente" || o.estado === "parcial";

/** Lo arma el servidor (motor.resumirHoy). `ahoraHora` = «HH:MM» de Lima. */
export function armarAlertasAgenda(
  r: { fecha: FechaKey; hoy: OcurrenciaDTO[]; atrasadas: OcurrenciaDTO[] },
  ahoraHora: string,
): AlertaAgenda[] {
  const alertas: AlertaAgenda[] = [];
  const abiertas = r.hoy.filter(abierta);
  const vencidas = abiertas.filter((o) => o.hora !== null && o.hora <= ahoraHora);
  const resto = abiertas.filter((o) => !vencidas.includes(o));

  for (const o of vencidas) {
    alertas.push({
      id: `agenda-vencida:${o.actividadId}:${o.fecha}`,
      categoria: "sistema",
      severity: "critical",
      title: `${o.nombre}: era a las ${o.hora}`,
      description: o.detalle ?? "Todavía no está hecha.",
      action: { label: "Abrir", href: o.href },
    });
  }
  if (resto.length > 0) {
    alertas.push({
      id: `agenda-hoy:${r.fecha}`,
      categoria: "sistema",
      severity: "warning",
      title: resto.length === 1 ? "Hoy te toca 1 actividad" : `Hoy te tocan ${resto.length} actividades`,
      description: nombres(resto),
      action: { label: "Ver Hoy", href: HREF_HOY },
      cantidad: resto.length,
    });
  }
  if (r.atrasadas.length > 0) {
    alertas.push({
      id: `agenda-atrasadas:${r.fecha}`,
      categoria: "sistema",
      severity: "warning",
      title: r.atrasadas.length === 1 ? "1 actividad atrasada" : `${r.atrasadas.length} actividades atrasadas`,
      description: nombres(r.atrasadas),
      action: { label: "Ver Hoy", href: HREF_HOY },
      cantidad: r.atrasadas.length,
    });
  }
  return alertas;
}

function esAlerta(x: unknown): x is AlertaAgenda {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    a.categoria === "sistema" &&
    (a.severity === "critical" || a.severity === "warning") &&
    typeof a.title === "string" &&
    typeof a.description === "string"
  );
}

/** Lo usa el cliente con la respuesta cruda de `/api/admin/agenda/hoy`. Nunca lanza. */
export function alertasDeAgenda(json: unknown): AlertaAgenda[] {
  if (!json || typeof json !== "object") return [];
  const lista = (json as { alertas?: unknown }).alertas;
  return Array.isArray(lista) ? lista.filter(esAlerta) : [];
}
