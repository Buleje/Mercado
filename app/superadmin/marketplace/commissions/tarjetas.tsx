import type { FilaNegocioComision, MovimientoComision } from "@/lib/db/comisiones-plataforma.db";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { EstadoComisionBadge, TIPO_COMISION } from "./etiquetas";

/** En el celular, cada fila de las tablas de Comisiones como tarjeta (las 7 columnas no entran en 400 px). */
const TARJETA = "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4";

export function TarjetaNegocio({ f }: { f: FilaNegocioComision }) {
  return (
    <li className={TARJETA}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-[var(--text-primary)]">{f.negocio}</span>
        <span className="font-semibold tabular-nums">{formatCurrency(f.neto)}</span>
      </div>
      <div className="mt-1 text-sm text-[var(--text-secondary)]">
        {f.movimientos} mov. · por liquidar {formatCurrency(f.porLiquidar)}
        {f.devuelto > 0 && ` · devuelto ${formatCurrency(f.devuelto)}`}
        {f.ultimo && ` · ${formatDateShort(f.ultimo)}`}
      </div>
    </li>
  );
}

export function TarjetaMovimiento({ m }: { m: MovimientoComision }) {
  return (
    <li className={TARJETA}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-[var(--text-primary)]">{m.tienda ?? m.negocio}</span>
        <span className="font-semibold tabular-nums">{formatCurrency(m.monto)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span>{formatDateShort(m.creado)}</span>
        <span>· {TIPO_COMISION[m.tipo] ?? m.tipo}</span>
        {m.tasa > 0 && (
          <span>· {m.tasa.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %</span>
        )}
        <EstadoComisionBadge estado={m.estado} />
      </div>
    </li>
  );
}
