/**
 * «Exportar historial» del menú de Turnos: los turnos que deja ver el filtro,
 * uno por fila. Salió de TurnosModule (10-10) sin cambiar ninguna columna.
 */
import { exportToExcel } from "@/lib/export-excel";
import { formatDateNumeric, formatTime } from "@/lib/format";
import { duracionHoras, turnoConAlerta, type Turno } from "./tipos";

export function exportarTurnos(turnos: Turno[], nombreDe: (t: Turno) => string): void {
  const rows = turnos.map((t) => ({
    Cajero: nombreDe(t),
    Fecha: formatDateNumeric(t.abrioEn),
    "Hora inicio": formatTime(t.abrioEn),
    "Hora fin": t.cerroEn ? formatTime(t.cerroEn) : "—",
    "Duración (h)": Number(duracionHoras(t).toFixed(2)),
    "Efectivo inicial (S/)": t.inicioEfectivo,
    "Ventas (S/)": Number(t.ventasTotal.toFixed(2)),
    "Efectivo final (S/)": t.cierreEfectivo ?? "",
    "Diferencia (S/)": t.diferencia ?? "",
    Estado: t.cerradoPorSistema ? "Cerrado por el sistema" : turnoConAlerta(t) ? "Diferencia alta" : t.diferencia == null ? "Sin dato de caja" : "Cuadrado",
  }));
  const hoy = new Date();
  exportToExcel(rows, `turnos-${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`, "Turnos")
    .catch((err) => console.warn("[Turnos] exportar Excel", err));
}
