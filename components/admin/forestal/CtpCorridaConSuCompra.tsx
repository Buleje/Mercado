"use client";

/**
 * CtpCorridaConSuCompra — «Ligar con su compra» de un toque (ADR-485).
 *
 * El servidor propone de qué ingreso(s) sale la madera que a la corrida le
 * falta atribuir (misma especie, llegó el mismo día o antes, con saldo, FIFO) y
 * el operador sólo confirma. Si no hay qué proponer, dice POR QUÉ (en Blas: no
 * hay ningún ingreso de esa especie) en vez de un buscador vacío. Una guía sin
 * costo se nombra: el costo por PT sigue en «Falta» hasta cargarlo.
 */

import { AlertTriangle, CheckCircle2, Link2, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { Btn } from "./ctp-shared";
import { useCorridaCompra } from "./hooks/use-corrida-compra";

/** `AAAA-MM-DD` → `dd/mm` (date-only, sin zona horaria). */
const diaCorto = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
const sinCostoTexto = (gtfs: readonly string[]) =>
  `${gtfs.length === 1 ? "La guía" : "Las guías"} ${gtfs.join(", ")} no ${gtfs.length === 1 ? "tiene" : "tienen"} costo cargado: el costo por PT seguirá en «Falta» hasta que lo cargues en Ingresos.`;

/**
 * `pendiente` = a la corrida le falta materia prima. Vive montado aunque ya no
 * falte: al completar, la ficha relee y `pendiente` pasa a `false`; si el
 * padre lo desmontara, el «Listo» se iría antes de verse (revisión 08-10).
 */
export default function CtpCorridaConSuCompra({
  corridaId,
  pendiente = true,
  onLigada,
}: {
  corridaId: string;
  pendiente?: boolean;
  onLigada?: () => void;
}) {
  const { propuesta: p, cargando, error, ligando, ligadoM3, ligar } = useCorridaCompra(corridaId, pendiente);

  if (!pendiente && ligadoM3 == null) return null;

  if (cargando && !p) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando de qué compra salió la madera…
      </p>
    );
  }
  if (!p) return error ? <p className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p> : null;

  if (ligadoM3 != null) {
    return (
      <div className="space-y-1.5 rounded-xl border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 dark:bg-transparent">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> Listo: {fmtM3(ligadoM3)} m³ quedaron ligados a su compra.
        </p>
        {p.guiasSinCosto.length > 0 && <p className="text-xs text-[var(--text-secondary)]">{sinCostoTexto(p.guiasSinCosto)}</p>}
      </div>
    );
  }
  if (!pendiente || p.estado === "ya_atribuida") return null;

  if (p.filas.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 dark:bg-transparent">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {p.estado === "bloqueada" ? "No se le puede ligar una compra" : "No hay compra que ligar"}
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{p.motivo}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border-2 border-[var(--data-info-500)] bg-[var(--data-info-50)] p-3 dark:bg-transparent">
      <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Link2 className="h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden />
        Sale de {p.filas.length === 1 ? "esta compra" : `estas ${p.filas.length} compras`}
        <InfoTip
          title="Cómo se eligió"
          what={`Guías de ${p.especie ?? "la especie"} que llegaron el mismo día o antes que la corrida y todavía tienen saldo, la más vieja primero.`}
          affects="Al confirmar, el costo por PT de la corrida sale del costo de esas guías. Si cambiaste de idea, «Editar atribución» lo corrige."
          example="Corrida de 6,285 m³ del 01/10 → guía del 29/09 con 9,563 m³ libres: se ligan 6,285 m³."
        />
      </p>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        {p.filas.map((f) => (
          <li key={f.woodEntryId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-mono font-bold text-[var(--text-primary)]">{f.gtf}</span>
              <span className="ml-2 text-xs text-[var(--text-tertiary)]">llegó {diaCorto(f.llegada)}</span>
            </span>
            <span className="text-right font-mono tabular-nums text-[var(--text-primary)]">
              {fmtM3(f.m3)} m³
              <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                {f.costoUnitario != null ? `${f.moneda === "USD" ? "US$" : "S/"} ${formatNumber(f.costoUnitario, 2)}/m³` : "sin costo"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {p.estado === "parcial" && p.motivo && <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{p.motivo}</p>}
      {p.guiasSinCosto.length > 0 && <p className="text-xs text-[var(--text-secondary)]">{sinCostoTexto(p.guiasSinCosto)}</p>}
      {p.monedasMezcladas && (
        <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Hay guías en soles y otras en dólares: el costo por PT de la corrida no se podrá sumar mientras se mezclen monedas.
        </p>
      )}
      {error && <p className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      <div className="flex justify-end">
        <Btn
          variant="primary"
          size="sm"
          disabled={ligando}
          onClick={() => {
            void ligar().then((ok) => {
              if (ok) onLigada?.();
            });
          }}
        >
          {ligando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
          Ligar {fmtM3(p.cubreM3)} m³ a su compra
        </Btn>
      </div>
    </div>
  );
}
