/**
 * lib/caja/reporte-impreso.ts — el HTML de «Imprimir reporte» de la pestaña Caja.
 *
 * Se abre con `window.open("")` + `document.write`, en el origen del panel: todo
 * texto que venga de la base tiene que ir escapado. El medio de pago lo podía
 * mandar un cajero como texto libre (`<img src=x onerror=…>`) y se escribía tal
 * cual en la ventana que abre el admin (revisión de seguridad F4). Ahora la ruta
 * valida el medio contra una lista fija, y acá se escapa TODO lo interpolado con
 * el mismo `escapeHtml` del correo — defensa en las dos puntas.
 *
 * Los números son los de la pantalla (`cuentasDeCajaParaPantalla`): el mismo
 * esperado que el cierre.
 *
 * PURO y client-safe.
 */
import { escapeHtml } from "@/lib/email/escape-html";
import { cuentasDeCajaParaPantalla } from "@/lib/caja/cuentas-de-pantalla";
import { medioDeMovimiento, type MovimientoDeCaja } from "@/lib/caja/saldo-esperado";
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";

export interface CajaParaReporte {
  openingAmount: number;
  movements: ReadonlyArray<MovimientoDeCaja>;
}

export function htmlReporteDeCaja(
  caja: CajaParaReporte,
  textos: { fecha: string; hora: string },
  formato: (n: number) => string,
  /** El parte del servidor: suma «de dónde vino el efectivo» y el cuadre con ventas. */
  parte?: ParteDelDia | null,
  /** Nombre del negocio que va en el papel. */
  negocio = "Buleje",
): string {
  const e = escapeHtml;
  const lineasOrigen = (parte?.porOrigen ?? [])
    .filter((l) => l.clave !== "apertura" && (l.entraEfectivo || l.saleEfectivo))
    /* Un origen puede tener entrada Y salida (cambio +50 / −20): las dos líneas,
       igual que el parte de WhatsApp, para que el papel sume el esperado. */
    .flatMap((l) => [
      ...(l.entraEfectivo ? [`  ${e(l.etiqueta)}: +${e(formato(l.entraEfectivo))}`] : []),
      ...(l.saleEfectivo ? [`  ${e(l.etiqueta)}: -${e(formato(l.saleEfectivo))}`] : []),
    ])
    .join("\n");
  const c = parte?.conciliacion;
  const bloqueParte = parte
    ? `<div class="sep"></div>
<p class="bold">DE DONDE VINO EL EFECTIVO</p>
<pre>${lineasOrigen || "  Sin movimientos en efectivo"}</pre>
<p class="bold">CUADRE CON VENTAS</p>
<p>Sistema: ${c?.ventasSistema.n ?? 0} ventas · ${e(formato(c?.ventasSistema.total ?? 0))}</p>
<p>En caja: ${c?.ventasEnCaja.n ?? 0} ventas · ${e(formato(c?.ventasEnCaja.total ?? 0))}</p>
<p>${c?.cuadra ? "Cuadra" : `Sin pasar por caja: ${c?.sinCaja.n ?? 0} (${e(formato(c?.sinCaja.total ?? 0))})`}</p>`
    : "";
  const cuentas = cuentasDeCajaParaPantalla(caja.openingAmount, caja.movements, formato);
  const ventas = caja.movements.filter((m) => m.type === "venta");
  const totalVentas = ventas.reduce((s, m) => s + m.amount, 0);
  const porMedio = new Map<string, number>();
  for (const v of ventas) {
    const medio = medioDeMovimiento(v.method);
    porMedio.set(medio, (porMedio.get(medio) ?? 0) + v.amount);
  }
  const lineasPorMedio = [...porMedio]
    .map(([medio, total]) => {
      const pct = totalVentas > 0 ? ((total / totalVentas) * 100).toFixed(0) : "0";
      return `  ${e(medio.charAt(0).toUpperCase() + medio.slice(1))}: ${e(formato(total))} (${pct}%)`;
    })
    .join("\n");
  const retirosEnEfectivo = caja.movements.filter(
    (m) => m.type === "egreso" && medioDeMovimiento(m.method) === "efectivo",
  ).length;

  return `
<html><head><title>Reporte de Caja</title>
<style>body{font-family:monospace;font-size:12px;max-width:380px;margin:0 auto;padding:20px}h1{font-size:14px;text-align:center;margin:0}p{margin:4px 0}.sep{border-top:1px dashed #999;margin:8px 0}.center{text-align:center}.bold{font-weight:bold}.sign{margin-top:40px;border-top:1px solid #333;width:200px;display:inline-block;text-align:center;padding-top:4px;font-size:10px}</style>
</head><body>
<h1>REPORTE DE CAJA</h1>
<p class="center bold">${e(negocio || "Buleje")}</p>
<p class="center">Fecha: ${e(textos.fecha)}</p>
<div class="sep"></div>
<p class="bold">APERTURA</p>
<p>Efectivo inicial: ${e(formato(Number(caja.openingAmount)))}</p>
<p>Hora: ${e(textos.hora)}</p>
<div class="sep"></div>
<p class="bold">VENTAS DEL DIA</p>
<p>Total ventas: ${e(formato(totalVentas))} (${ventas.length} transacciones)</p>
<p>Por metodo:</p>
<pre>${lineasPorMedio}</pre>
<div class="sep"></div>
<p class="bold">MOVIMIENTOS</p>
<p>Retiros: ${e(formato(cuentas.totalOut))} (${retirosEnEfectivo})</p>
<p>Ingresos extra: ${e(formato(cuentas.totalIn))}</p>
<div class="sep"></div>
<p class="bold">CIERRE</p>
<p>Efectivo esperado: ${e(formato(cuentas.expectedCash))}</p>
${cuentas.fueraDelCajon ? `<p>${e(cuentas.fueraDelCajon)}</p>` : ""}
${bloqueParte}
<div class="sep"></div>
<p style="margin-top:30px">Firma cajero: ___________________</p>
<p>Firma supervisor: _______________</p>
</body></html>`;
}
