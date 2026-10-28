/**
 * Las piezas de la planilla de producción: el bloque con su barra de título,
 * el campo rotulado y el dato que sólo se lee. Movidas tal cual desde
 * `CtpRegistrarProduccionModal.tsx` para que cada paso las comparta.
 */
import { CardTitle } from "@buleje/design-system";
import { formatDateNumeric } from "@/lib/format";

export const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export const fmtDia = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatDateNumeric(d, { soloFecha: true });
};

/**
 * Un bloque del formulario oficial, con su barra de título.
 *
 * En la ventana de un paso, material y corrida iban plegados (se leían una vez
 * y estorbaban); con los pasos (28-10) cada uno tiene su pantalla y nada se
 * pliega: lo completado se resume en la línea de arriba de la ventana.
 */
export function Bloque({
  titulo,
  meta,
  children,
  onKeyDown,
  acciones,
}: {
  titulo: string;
  /** Contexto corto a la derecha del título: el lote, sus fechas. Antes eso era
   *  un bloque entero para tres datos que se miran de reojo. */
  meta?: string;
  children: React.ReactNode;
  /** Atajos del bloque (Enter = Añadir en el del paquete). */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  /** Un control que vive en la barra de título (el interruptor de dimensionar). */
  acciones?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--rule-base)]">
      <CardTitle
        as="h3"
        className="text-sm font-bold flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2"
      >
        <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {meta && (
          <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>
        )}
        {acciones}
      </CardTitle>
      <div className="p-3" onKeyDown={onKeyDown}>
        {children}
      </div>
    </section>
  );
}

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-bold text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

/** Un dato ya decidido: se muestra, no se edita. */
export function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="text-sm">
      <span className="mb-1 block font-bold text-[var(--text-secondary)]">{label}</span>
      <p className="flex h-11 items-center rounded-xl bg-[var(--surface-sunken)] px-2.5 font-mono tabular-nums text-[var(--text-primary)]">
        {valor}
      </p>
    </div>
  );
}
