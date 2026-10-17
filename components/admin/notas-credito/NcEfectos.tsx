"use client";

import { BookOpen, Landmark, Package, Banknote, Wallet, Users, Info, type LucideIcon } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { MOTIVOS_POR_TODO } from "@/lib/notas-credito/motivos";
import type { RemanenteDocumento } from "@/lib/notas-credito/remanente";

const DEVUELVEN = new Set(["06", "07"]);

/**
 * Qué cambia al crear la nota (F13, 17-10). Medido en el código: sólo las EMITIDAS restan en el libro de
 * ventas; stock, caja, saldo del cliente y comisión se mueven por Caja › Devolución, nunca por la nota.
 */
export default function NcEfectos({ codigo, total, remanente, reembolsadoEnCaja, devueltoEnCaja }: {
  codigo: string;
  /** Total con IGV de la nota. */
  total: number;
  remanente: RemanenteDocumento | null;
  reembolsadoEnCaja: number;
  devueltoEnCaja: boolean;
}) {
  const devuelve = DEVUELVEN.has(codigo) || MOTIVOS_POR_TODO.has(codigo);
  const queda = remanente ? Math.max(0, Math.round((remanente.disponibleConIgv - total) * 100) / 100) : 0;
  const filas: Array<{ icon: LucideIcon; que: string; texto: string }> = [
    { icon: BookOpen, que: "Comprobante", texto: "Queda en borrador. Cuando la marques emitida, resta en el libro de ventas del mes." },
    {
      icon: Landmark, que: "Lo que queda",
      texto: remanente
        ? `${formatCurrency(remanente.disponibleConIgv)} → ${formatCurrency(queda)}${queda === 0 ? " (acreditada entera)" : ""}`
        : "Ajuste interno: no toca ninguna boleta ni factura.",
    },
    {
      icon: Package, que: "Stock",
      texto: devueltoEnCaja ? "No se mueve: el producto ya volvió por Caja › Devolución."
        : devuelve ? "No se mueve: si el producto vuelve, regístralo en Caja › Devolución." : "No se mueve.",
    },
    {
      icon: Banknote, que: "Caja",
      texto: reembolsadoEnCaja > 0 ? `No sale plata. Por Caja ya se devolvieron ${formatCurrency(reembolsadoEnCaja)}.`
        : devuelve ? "No sale plata: si le devuelves dinero, hazlo en Caja › Devolución." : "No sale plata.",
    },
    { icon: Wallet, que: "Saldo del cliente", texto: "No cambia." },
    { icon: Users, que: "Comisión", texto: "No cambia: sólo la bajan las devoluciones de Caja." },
    { icon: Info, que: "SUNAT", texto: "No se envía desde aquí." },
  ];
  return (
    <section data-qa="nc-efectos" aria-label="Qué cambia al crearla" className="rounded-xl border border-[var(--rule-base)] p-4">
      <div className="mb-2 flex items-center gap-1">
        <span className="text-sm font-bold text-[var(--text-primary)]">Qué cambia al crearla</span>
        <InfoTip
          title="La nota es el papel"
          what="Corrige lo cobrado ante el cliente y en el libro de ventas. No devuelve plata ni recibe producto."
          affects="La plata y el producto se mueven en Caja › Devolución; la comisión del vendedor baja con esa devolución, no con la nota."
          example="Devolución de 2 arroces: haces la devolución en Caja (vuelve el stock y sale la plata) y aquí la nota 07 por esas 2 unidades."
        />
      </div>
      <dl className="grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        {filas.map(({ icon: Icono, que, texto }) => (
          <div key={que} className="contents">
            <dt className="flex items-center gap-1.5 font-semibold text-[var(--text-secondary)]">
              <Icono className="h-4 w-4 shrink-0" aria-hidden /> {que}
            </dt>
            <dd className="mb-1 pl-6 text-[var(--text-primary)] sm:mb-0 sm:pl-0">{texto}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
