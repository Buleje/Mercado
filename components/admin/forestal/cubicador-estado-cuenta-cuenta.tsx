"use client";

/**
 * «Su cuenta en el panel» dentro del «Estado de cuenta» de una carga: a quién
 * es (se elige sola) y cada movimiento de su cuenta con adónde va en el papel
 * — saldo anterior (por defecto), de esta carga (el adelanto que dio para
 * ella) o no va (esta misma madera ya subida a la cuenta).
 */
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CuentaDelCliente } from "./hooks/use-cuenta-del-cliente";
import { soles, type DestinoMovimiento } from "@/lib/forestal/estado-cuenta-carga";

const SELECT =
  "h-11 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

const DESTINOS: readonly { id: DestinoMovimiento; label: string }[] = [
  { id: "anterior", label: "Saldo anterior" },
  { id: "carga", label: "De esta carga" },
  { id: "fuera", label: "No va" },
];

const dia = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
};

export function CuentaDelClienteBloque({ cuenta, destinos, onDestino, otraMoneda, onNombre }: {
  /** Se eligió otra persona a mano: el papel lleva su nombre. */
  onNombre: (nombre: string) => void;
  cuenta: CuentaDelCliente;
  destinos: readonly DestinoMovimiento[];
  onDestino: (i: number, d: DestinoMovimiento) => void;
  otraMoneda: number;
}) {
  const { personas, elegida, elegir, movimientos, cargando, error } = cuenta;
  return (
    <section className="space-y-2 rounded-2xl bg-[var(--surface-sunken)] p-3" aria-label="Su cuenta en el panel" data-vista="cuenta-del-cliente">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">Su cuenta en el panel</span>
        <InfoTip
          what="Los adelantos y la cuenta forestal de esta persona. Todo lo que no sea de esta carga se junta en «Saldo anterior»."
          affects="Marca «De esta carga» el adelanto que dio para esta madera: sale en su renglón y se resta. «No va» lo deja fuera del papel."
          example="Rivers: depósitos de 10,000 y 8,000 ya descontados en el saldo anterior; el adelanto de 23,000 «De esta carga»."
        />
        <select className={`${SELECT} ml-auto w-full sm:w-64`} value={elegida?.clave ?? ""} onChange={(e) => {
            elegir(e.target.value || null);
            const p = personas.find((x) => x.clave === e.target.value);
            if (p) onNombre(p.nombre);
          }}
          aria-label="Cuenta del cliente" data-campo="cuenta-cliente">
          <option value="">Sin cuenta del panel (todo a mano)</option>
          {personas.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {cargando && <p className="text-xs text-[var(--text-secondary)]">Leyendo su cuenta…</p>}
      {elegida && !cargando && movimientos.length === 0 && !error && (
        <p className="text-xs text-[var(--text-secondary)]">{elegida.nombre} no tiene movimientos en su cuenta.</p>
      )}
      {movimientos.length > 0 && (
        <ul className="max-h-60 space-y-1 overflow-y-auto pr-1" data-movimientos={movimientos.length}>
          {movimientos.map((m, i) => (
            <li key={`${m.fecha}-${m.referencia ?? ""}-${i}`} className="grid grid-cols-[3.75rem_minmax(0,1fr)_6.5rem_9.5rem] items-center gap-2 rounded-xl bg-[var(--surface-raised)] px-2 py-1">
              <span className="text-xs tabular-nums text-[var(--text-secondary)]">{dia(m.fecha)}</span>
              <span className="min-w-0 truncate text-sm" title={m.referencia ? `${m.concepto} · ${m.referencia}` : m.concepto}>{m.concepto}</span>
              <span className={`text-right text-sm font-bold tabular-nums ${m.monto < 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : ""}`}>
                {m.monto < 0 ? "−" : "+"}{soles(m.monto).replace("S/ ", "")}{m.moneda !== "PEN" ? ` ${m.moneda}` : ""}
              </span>
              <select className={`${SELECT} h-9 text-xs`} value={destinos[i] ?? "anterior"} onChange={(e) => onDestino(i, e.target.value as DestinoMovimiento)}
                aria-label={`Adónde va: ${m.concepto}`}>
                {DESTINOS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
      {otraMoneda > 0 && <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{otraMoneda} movimiento(s) en otra moneda no se suman al total en soles.</p>}
    </section>
  );
}
