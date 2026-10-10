/**
 * «Lista de cobro» en PDF y Excel de deudores (menú «Más» de «Me deben»).
 */
import { exportToExcel } from "@/lib/export-excel";
import { formatCurrency, formatDateNumeric } from "@/lib/format";
import type { Gestion, PromesaVigente } from "@/lib/fiados/gestion-cobranza";
import type { DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import { estaAbierto, type Fiado } from "./tipos";

function deudoresPorSaldo(fiados: Fiado[]): Fiado[] {
  return fiados.filter(estaAbierto).sort((a, b) => b.saldo - a.saldo);
}

const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/**
 * El celular tapado, «912XXXXXX»: la lista sale en papel de la tienda y el
 * número entero es un dato personal (Ley 29733). Con los tres primeros el
 * cobrador distingue a dos clientes del mismo nombre; para escribirle, el panel.
 * Se había perdido al pasar la lista a PDF (10-10).
 */
export function telefonoTapado(telefono: string | null | undefined): string {
  const digitos = (telefono ?? "").replace(/\D/g, "").slice(-9);
  return digitos.length > 3 ? `${digitos.slice(0, 3)}XXXXXX` : "—";
}

/**
 * La lista de cobro para salir a cobrar, en PDF: un cliente por fila, del más
 * atrasado al menos, con su última gestión, lo que prometió y una casilla
 * para marcar a mano lo cobrado.
 *
 * Hasta el 10-10 había dos: «Lista de cobro» (texto impreso, sin promesas) en
 * el menú y «PDF» en Cobranza. Quedó ésta, que trae todo.
 */
export async function exportarListaDeCobro(
  deudores: readonly DeudorCobranza[],
  ultimas: ReadonlyMap<string, Gestion>,
  promesas: ReadonlyMap<string, PromesaVigente>,
): Promise<void> {
  if (deudores.length === 0) return;
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const total = deudores.reduce((s, d) => s + d.saldo, 0);
  doc.setFontSize(16);
  doc.text("Lista de cobro", 14, 18);
  doc.setFontSize(10);
  doc.text(`Por cobrar: ${formatCurrency(total)} · ${deudores.length} clientes · ${formatDateNumeric(new Date())}`, 14, 25);
  autoTable(doc, {
    startY: 31,
    head: [["Cliente", "Saldo", "Atraso", "Última gestión", "Prometió", "Celular", "Cobrado"]],
    body: deudores.map((d) => {
      const u = ultimas.get(d.id);
      const p = promesas.get(d.id);
      return [
        d.nombre,
        formatCurrency(d.saldo),
        d.dias > 0 ? `${d.dias} días` : "al día",
        u ? `${u.tipo} ${formatDateNumeric(u.fecha)}` : "—",
        p?.gestion.fechaPrometida ? formatDateNumeric(p.gestion.fechaPrometida) : "—",
        telefonoTapado(d.telefono),
        "[   ]",
      ];
    }),
  });
  doc.save(`lista-de-cobro-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportarDeudores(fiados: Fiado[]): void {
  const deudores = deudoresPorSaldo(fiados);
  if (deudores.length === 0) return;
  const rows = deudores.map((f) => ({
    Nombre: f.customerName || f.customerId,
    "Teléfono": f.customerId,
    "Monto original (S/)": Number(Number(f.total ?? 0).toFixed(2)),
    "Saldo pendiente (S/)": Number(Number(f.saldo ?? 0).toFixed(2)),
    "Fecha inicio": formatDateNumeric(f.createdAt),
    "Días": diasDesde(f.createdAt),
    Estado: f.status === "VENCIDO" ? "Vencido" : "Activo",
  }));
  exportToExcel(rows, `deudores-${new Date().toISOString().slice(0, 10)}`, "Deudores");
}
