"use client";

/**
 * Pestaña «Cuenta» de la ficha lateral de un fiado (M32, 17-10): todo lo del
 * cliente junto — sus compras fiadas, sus abonos con el recibo de cada uno y
 * sus gestiones y promesas — sin salir de la lista de cobranza. Tocar una
 * compra la abre en la misma ficha; cerrar la ficha vuelve a la lista.
 */
import { useMemo } from "react";
import { BlockTitle } from "@buleje/design-system";
import { Receipt } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { etiquetaGestion, type Gestion, type PromesaVigente } from "@/lib/fiados/gestion-cobranza";
import { cn } from "@/lib/utils";
import { abonosDelCliente, comprasDelCliente, gestionesDelCliente, reciboDeAbono } from "./cuenta-cliente";
import { diaLeido } from "./fechas";
import { STATUS_META, estaAbierto, type Fiado, type ReciboData } from "./tipos";

type Props = {
  selected: Fiado;
  fiados: Fiado[];
  gestiones: readonly Gestion[];
  promesa?: PromesaVigente;
  onElegir: (f: Fiado) => void;
  onVerRecibo: (r: ReciboData) => void;
};

const FILA = "flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl px-3 py-2";

function textoPromesa(p: PromesaVigente): string {
  if (p.estado === "incumplio") return "Prometió y no cumplió";
  if (p.estado === "vence-hoy") return "Prometió pagar hoy";
  return `Prometió pagar en ${p.faltan} d`;
}

export default function CuentaCliente({ selected, fiados, gestiones, promesa, onElegir, onVerRecibo }: Props) {
  const id = selected.customerId;
  const compras = useMemo(() => comprasDelCliente(fiados, id), [fiados, id]);
  const abonos = useMemo(() => abonosDelCliente(fiados, id), [fiados, id]);
  const suyas = useMemo(() => gestionesDelCliente(gestiones, id), [gestiones, id]);
  const debe = compras.filter(estaAbierto).reduce((s, f) => s + f.saldo, 0);
  const cliente = { nombre: selected.customerName || "Cliente", telefono: id };

  return (
    <div className="space-y-5" data-qa="fiado-cuenta">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-base font-bold text-[var(--text-primary)]">
          {debe > 0 ? (
            <>Debe <span className="tabular-nums text-[var(--data-error-ink)]">{formatCurrency(debe)}</span> en {compras.filter(estaAbierto).length} de {compras.length} compras</>
          ) : (
            `No debe nada · ${compras.length} ${compras.length === 1 ? "compra fiada" : "compras fiadas"}`
          )}
        </span>
        <InfoTip
          title="La cuenta entera del cliente"
          what="Todas sus compras fiadas, cada abono con su recibo y lo que se le gestionó, en un solo lugar."
          affects="El saldo de cada recibo sale del saldo de hoy hacia atrás, abono por abono."
          example="Tocas una compra y se abre aquí mismo; cierras la ficha y vuelves a la lista de cobro."
        />
        {promesa && (
          <span className={cn("rounded-full px-2 py-0.5 text-sm font-semibold", promesa.estado === "incumplio" ? "bg-[var(--data-error)]/15 text-[var(--data-error-ink)]" : "bg-[var(--data-info)]/15 text-[var(--data-info-ink)]")}>
            {textoPromesa(promesa)}
          </span>
        )}
      </div>

      <section aria-label="Compras fiadas">
        <BlockTitle className="mb-2">Compras</BlockTitle>
        <ul className="space-y-1">
          {compras.map((f) => {
            const actual = f.id === selected.id;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onElegir(f)}
                  aria-current={actual ? "true" : undefined}
                  className={cn(FILA, "min-h-12 w-full text-left hover:bg-[var(--surface-sunken)]", actual && "bg-primary/10")}
                >
                  <span className="w-20 shrink-0 text-sm text-[var(--text-secondary)]">{diaLeido(f.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{f.descripcion || "Compra fiada"}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    {estaAbierto(f) ? formatCurrency(f.saldo) : formatCurrency(f.total)}
                  </span>
                  <StatusBadge variant={STATUS_META[f.status].variant} label={STATUS_META[f.status].label} size="sm" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Abonos">
        <BlockTitle className="mb-2">Abonos</BlockTitle>
        {abonos.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Todavía no abonó nada.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {abonos.map((a) => (
              <li key={a.id} className={FILA}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold tabular-nums text-[var(--data-success-ink)]">{formatCurrency(a.monto)}</span>
                  <span className="block truncate text-sm text-[var(--text-secondary)]">
                    {[diaLeido(a.fecha), a.medio, a.nota, a.fiado.id !== selected.id ? `compra del ${diaLeido(a.fiado.createdAt)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onVerRecibo(reciboDeAbono(a, cliente))}
                  className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                  data-qa="fiado-cuenta-recibo"
                >
                  <Receipt className="h-4 w-4" aria-hidden /> Recibo
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Gestiones y promesas">
        <BlockTitle className="mb-2">Gestiones y promesas</BlockTitle>
        {suyas.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Sin gestiones anotadas.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {suyas.map((g) => (
              <li key={g.id} className={FILA}>
                <span className="w-20 shrink-0 text-sm text-[var(--text-secondary)]">{diaLeido(g.fecha)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">
                    {etiquetaGestion(g.tipo)}
                    {g.fechaPrometida && ` · pagará el ${diaLeido(g.fechaPrometida)}`}
                    {g.montoPrometido ? ` · ${formatCurrency(g.montoPrometido)}` : ""}
                  </span>
                  {(g.nota || g.usuario) && (
                    <span className="block truncate text-sm text-[var(--text-secondary)]">{[g.nota && `«${g.nota}»`, g.usuario].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
