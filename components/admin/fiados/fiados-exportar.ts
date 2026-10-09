/**
 * «Lista de cobro» impresa y Excel de deudores (menú de «Me deben»).
 * Salieron de FiadosModule sin cambiar el contenido.
 */
import { exportToExcel } from "@/lib/export-excel";
import { formatCurrency, formatDateNumeric } from "@/lib/format";
import { estaAbierto, type Fiado } from "./tipos";

function deudoresPorSaldo(fiados: Fiado[]): Fiado[] {
  return fiados.filter(estaAbierto).sort((a, b) => b.saldo - a.saldo);
}

const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export function imprimirListaCobro(fiados: Fiado[]): void {
  const deudores = deudoresPorSaldo(fiados);
  if (deudores.length === 0) return;
  const fecha = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const totalCobrar = deudores.reduce((s, f) => s + f.saldo, 0);
  const lines = deudores.map((f, i) => {
    const phone = f.customerId || "";
    const displayPhone = phone.length > 3 ? phone.slice(0, 3) + "XXXXXX" : phone;
    return `${i + 1}. ${f.customerName || f.customerId} · ${displayPhone} · ${formatCurrency(Number(f.saldo))} · ${diasDesde(f.createdAt)} dias [ ]`;
  });
  const content = [
    "═══════════════════════════════════════",
    `LISTA DE COBRO — ${fecha}`,
    "Buleje",
    "═══════════════════════════════════════",
    "",
    ...lines,
    "",
    "───────────────────────────────────────",
    `Total por cobrar: ${formatCurrency(totalCobrar)} (${deudores.length} clientes)`,
    "[ ] = marcar cuando se cobre",
    "───────────────────────────────────────",
  ].join("\n");
  const printWin = window.open("", "_blank", "width=420,height=600");
  if (printWin) {
    printWin.document.write(`<html><head><title>Lista de Cobro</title><style>body{font-family:monospace;font-size:12px;white-space:pre-wrap;padding:20px;line-height:1.6;}@media print{body{padding:10px;}}</style></head><body>${content}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => printWin.print(), 300);
  }
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
