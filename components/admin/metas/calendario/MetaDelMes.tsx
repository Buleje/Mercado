/**
 * MetaDelMes — lo vendido en el mes que se mira contra la meta mensual de
 * ventas de la base, con la marca del ritmo. Un mes que ya pasó queda cerrado
 * con su resultado. Sin meta mensual: una línea y el botón para ponerla.
 */
import { CalendarDays } from "@buleje/design-system/icons";
import { BarraAvance } from "@/components/admin/metas/BarraAvance";
import { BOTON_SECUNDARIO, TEXTO_TONO, TONO_ESTADO } from "@/components/admin/metas/clases-meta";
import { estadoDeMeta, ritmoEsperado, ventanaDeMeta } from "@/lib/admin/metas-periodo";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { cn } from "@/lib/utils";

const soles = (n: number) => cifraDeMeta(n, "S/");

function linea(
  total: number,
  meta: number,
  cerrada: boolean,
  esperado: number | null,
  hasta: string,
): string {
  if (total >= meta) return `Meta del mes cumplida (+${soles(total - meta)})`;
  const falta = soles(meta - total);
  if (cerrada) return `El mes cerró ${falta} abajo de la meta`;
  if (esperado !== null && total < esperado)
    return `Te faltan ${falta} hasta el ${hasta.slice(8, 10)}/${hasta.slice(5, 7)} · vas ${soles(esperado - total)} abajo del ritmo`;
  return `Te faltan ${falta} hasta el ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}`;
}

export function MetaDelMes({
  mes,
  hoy,
  total,
  meta,
  cargando,
  onPonerMeta,
}: {
  mes: string;
  hoy: string;
  total: number;
  meta: number | null;
  cargando: boolean;
  onPonerMeta: () => void;
}) {
  if (meta === null) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-[var(--text-tertiary)]" />
        <span className="font-semibold text-[var(--text-primary)]">Meta del mes</span>
        <span>· sin meta mensual de ventas.</span>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onPonerMeta}>
          Ponle una meta al mes
        </button>
      </div>
    );
  }
  // Un mes pasado se mide como una meta con vencimiento en ese mes: queda cerrado.
  const v = ventanaDeMeta("mensual", hoy, mes < hoy.slice(0, 7) ? `${mes}-01` : undefined);
  const esperado = v.cerrada ? null : ritmoEsperado(meta, v, "sube");
  const estado = estadoDeMeta({
    avance: cargando ? null : total,
    target: meta,
    esperado,
    sentido: "sube",
    cerrada: v.cerrada,
  });
  return (
    <div className="space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <CalendarDays
          aria-hidden="true"
          className="h-4 w-4 self-center text-[var(--accent-ink)] dark:text-[var(--accent)]"
        />
        <span className="font-semibold text-[var(--text-primary)]">Meta del mes</span>
        <span className="ml-auto tabular-nums text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">{cargando ? "…" : soles(total)}</b> de{" "}
          {soles(meta)}
        </span>
      </div>
      <BarraAvance
        avance={cargando ? null : total}
        target={meta}
        esperado={esperado}
        estado={estado}
        etiqueta={`${soles(total)} de ${soles(meta)}`}
        ritmo={esperado !== null ? soles(esperado) : undefined}
      />
      {!cargando && (
        <p className={cn("text-sm font-semibold", TEXTO_TONO[TONO_ESTADO[estado]])}>
          {linea(total, meta, v.cerrada, esperado, v.hasta)}
        </p>
      )}
    </div>
  );
}
