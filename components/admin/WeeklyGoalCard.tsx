/**
 * WeeklyGoalCard — la semana de lunes a domingo contra la meta semanal de
 * ventas de la base (ADR-488).
 *
 * Antes la meta semanal vivía en el localStorage de cada PC y el lunes se
 * calculaba con la zona del navegador. Ahora la ventana es la de la meta
 * (`ventanaDeMeta("semanal")`, día de Lima), la meta es la de «Metas» y los
 * días salen de `/api/goals/serie` (los pasa el calendario). Cada día va en
 * verde si cumplió la meta diaria; sin meta diaria, con intensidad según lo
 * vendido.
 */
import { CardTitle } from "@buleje/design-system";
import { CalendarDays } from "@buleje/design-system/icons";
import { BarraAvance } from "@/components/admin/metas/BarraAvance";
import { BOTON_SECUNDARIO, TEXTO_TONO, TONO_ESTADO } from "@/components/admin/metas/clases-meta";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  CLASE_TONO,
  INICIALES_SEMANA,
  diasDeLaSemana,
  montoCorto,
  tonoDelDia,
} from "@/components/admin/metas/calendario/calendario-calculos";
import { estadoDeMeta, ritmoEsperado, ventanaDeMeta } from "@/lib/admin/metas-periodo";
import type { VentasPorDia } from "@/lib/metas/logros-reglas";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const soles = (n: number) => cifraDeMeta(n, "S/");

export default function WeeklyGoalCard({
  hoy,
  dias,
  metaSemanal,
  metaDiaria,
  onPonerMeta,
}: {
  hoy: string;
  /** Ventas por día de Lima; tiene que cubrir la semana de `hoy`. */
  dias: VentasPorDia;
  metaSemanal: number | null;
  metaDiaria: number | null;
  onPonerMeta: () => void;
}) {
  const v = ventanaDeMeta("semanal", hoy);
  const semana = diasDeLaSemana(hoy);
  const total = Math.round(semana.reduce((a, f) => a + (dias[f]?.total ?? 0), 0) * 100) / 100;
  const maximo = Math.max(0, ...semana.map((f) => dias[f]?.total ?? 0));
  const esperado = metaSemanal !== null ? ritmoEsperado(metaSemanal, v, "sube") : null;
  const estado =
    metaSemanal !== null
      ? estadoDeMeta({
          avance: total,
          target: metaSemanal,
          esperado,
          sentido: "sube",
          cerrada: false,
        })
      : null;
  const falta = metaSemanal !== null ? Math.max(0, metaSemanal - total) : 0;

  return (
    <section
      aria-labelledby="metas-semana"
      className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CalendarDays
          aria-hidden="true"
          className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        />
        <CardTitle id="metas-semana" className="text-sm font-bold">
          Esta semana
        </CardTitle>
        <InfoTip
          title="Esta semana"
          what={`De lunes a domingo (${v.etiqueta}), lo vendido contra tu meta semanal de ventas.`}
          body={
            metaDiaria !== null
              ? `Un día en verde vendió al menos tu meta diaria (${soles(metaDiaria)}).`
              : "Sin meta diaria, el color más fuerte es el día que más vendiste."
          }
        />
        <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">{soles(total)}</b>
          {metaSemanal !== null && <> de {soles(metaSemanal)}</>}
        </span>
      </div>

      {metaSemanal !== null && estado ? (
        <div className="space-y-1.5">
          <BarraAvance
            avance={total}
            target={metaSemanal}
            esperado={esperado}
            estado={estado}
            etiqueta={`${soles(total)} de ${soles(metaSemanal)}`}
            ritmo={esperado !== null ? soles(esperado) : undefined}
          />
          <p className={cn("text-sm font-semibold", TEXTO_TONO[TONO_ESTADO[estado]])}>
            {estado === "cumplida"
              ? `Meta de la semana cumplida (+${soles(total - metaSemanal)})`
              : esperado !== null && total < esperado
                ? `Te faltan ${soles(falta)} hasta el domingo · vas ${soles(esperado - total)} abajo del ritmo`
                : `Te faltan ${soles(falta)} hasta el domingo`}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span>Sin meta semanal de ventas.</span>
          <button type="button" className={BOTON_SECUNDARIO} onClick={onPonerMeta}>
            Ponle una meta a la semana
          </button>
        </div>
      )}

      <ol className="grid grid-cols-7 gap-1.5" aria-label="Días de esta semana">
        {semana.map((f, i) => {
          const t = dias[f];
          const tono = tonoDelDia(f, t, hoy, metaDiaria, maximo);
          const texto = `${INICIALES_SEMANA[i]} ${f.slice(8, 10)}/${f.slice(5, 7)}: ${formatCurrency(t?.total ?? 0)}`;
          return (
            <li
              key={f}
              title={texto}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs",
                CLASE_TONO[tono],
                f === hoy && "outline outline-2 outline-offset-1 outline-[var(--accent)]",
              )}
            >
              <span className="sr-only">{texto}</span>
              <span aria-hidden="true" className="font-bold">
                {INICIALES_SEMANA[i]}
              </span>
              <span aria-hidden="true" className="tabular-nums">
                {f > hoy ? "·" : montoCorto(t?.total ?? 0)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
