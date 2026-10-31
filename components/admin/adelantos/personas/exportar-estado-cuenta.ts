/**
 * El PDF «Estado de cuenta» de una persona (botón PDF de su ficha). Salió de
 * `FichaPersonaModal` (30-10) sin cambiar nada, cuando la ficha pasó las 300
 * líneas al sumar la línea de la foto del DNI.
 */

import { saldoDeLaCuenta, type MovimientoCuenta } from "@/lib/adelantos/estado-cuenta";
import { formatDate } from "@/lib/format";
import { fmtMon, fmtMonedas } from "../shared";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

export async function exportarEstadoDeCuenta(
  persona: Pick<BeneficiarioConSaldo, "nombre" | "documento" | "telefono">,
  movimientos: readonly MovimientoCuenta[],
): Promise<void> {
  const { abrirPapel } = await import("@/lib/documentos/membrete-papel");
  const papel = await abrirPapel({ tipo: "Estado de cuenta" });
  papel.linea(persona.nombre, { tam: 12, negrita: true, alto: 6 });
  if (persona.documento) papel.linea(`Doc: ${persona.documento}`, { tam: 9, alto: 5 });
  if (persona.telefono) papel.linea(`Tel: ${persona.telefono}`, { tam: 9, alto: 5 });
  papel.y += 2;
  papel.tabla({
    head: [["Fecha", "Concepto", "Monto", "Saldo"]],
    body: movimientos.map((m) => [
      formatDate(m.fecha),
      m.concepto,
      `${m.monto >= 0 ? "+" : "−"}${fmtMon(Math.abs(m.monto), m.moneda)}`,
      fmtMon(m.saldo, m.moneda),
    ]),
    foot: [["", "", "Saldo pendiente", fmtMonedas(saldoDeLaCuenta(movimientos))]],
  });
  papel.cerrar(`estado-cuenta-${persona.nombre.replace(/\s+/g, "-")}.pdf`);
}
