"use client";

/**
 * El «Chequeo del libro» por secciones (26-10, Brandon: «que todo se cumpla,
 * mande advertencias de inconsistencias… para evitar multas»).
 *
 * Antes: una grilla «Requiere atención» con todo mezclado y, debajo, la lista
 * entera de lo que está en orden abierta. Ahora:
 *  · un filtro «Todo · Multa · Advertencia» con su cuenta, pegado a lo que filtra;
 *  · una sección por tema (Guías · Árboles y saldos · Plan y papeles · Plazos ·
 *    Datos del libro) con lo que falta y sus casos;
 *  · las secciones sin nada que revisar, en una línea;
 *  · lo que está en orden, plegado y agrupado por sección.
 * Lo que el servidor no pudo leer se avisa: no sale ni en rojo ni «en orden».
 */

import { AlertTriangle, CheckCircle2, ListChecks, ShieldAlert } from "@buleje/design-system/icons";
import { CardTitle, WarningAlert } from "@buleje/design-system";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import Plegable from "@/components/admin/shared/Plegable";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { LothCheck, LothNavTarget } from "@/lib/forestal/loth-compliance";
import { agruparPorSeccion, cuentaPorSeveridad, type FiltroSeveridad, type SeccionDelChequeo } from "@/lib/forestal/loth-chequeo-secciones";
import { ProblemCard, plural } from "./LothCumplimientoPiezas";

const FILTROS: readonly FiltroSeveridad[] = ["todas", "multa", "advertencia"];
const ROTULO: Record<FiltroSeveridad, string> = { todas: "Todo", multa: "Multa", advertencia: "Advertencia" };

export default function LothChequeoSecciones({
  checks,
  sinLeer,
  errorAvanzado,
  avanzadoLeido,
  onNavigate,
}: {
  checks: readonly LothCheck[];
  /** Lo que el servidor no pudo leer. */
  sinLeer: readonly string[];
  /** Los chequeos avanzados no contestaron: sólo se muestran los de siempre. */
  errorAvanzado: string | null;
  /** Ya se leyeron alguna vez: el error es de una recarga y queda el último cálculo. */
  avanzadoLeido: boolean;
  onNavigate: (target: LothNavTarget) => void;
}) {
  const [guardado, setFiltro] = useLocalStorage<FiltroSeveridad>("loth:chequeo:filtro", "todas");
  const filtro = FILTROS.includes(guardado) ? guardado : "todas";
  const cuenta = cuentaPorSeveridad(checks);
  const secciones = agruparPorSeccion(checks, filtro);
  const conProblemas = secciones.filter((s) => s.problemas.length > 0);
  const limpias = secciones.filter((s) => s.multas + s.advertencias === 0 && s.enOrden.length > 0);
  const escondidos = cuenta.todas - conProblemas.reduce((n, s) => n + s.problemas.length, 0);

  return (
    <div className="space-y-5">
      {errorAvanzado && (
        <WarningAlert
          title={avanzadoLeido ? "No se pudieron recargar los chequeos de guías, árboles, plan y plazos" : "No se pudieron leer los chequeos de guías, árboles, plan y plazos"}
          description={`${avanzadoLeido ? "Se muestra el último cálculo." : "Se muestran sólo los de siempre."} ${errorAvanzado}`}
        />
      )}
      {sinLeer.length > 0 && (
        <WarningAlert
          title={`Sin revisar: ${sinLeer.join(" · ")}`}
          description="Eso no entra al chequeo (ni como problema ni «en orden»). Si fue un error al leer, recarga en un rato."
        />
      )}

      {cuenta.todas > 0 && (
        <SegmentedControl
          value={filtro}
          onChange={setFiltro}
          size="xl"
          label="Qué mostrar"
          options={FILTROS.map((f) => ({ value: f, label: ROTULO[f], badge: cuenta[f] }))}
        />
      )}

      {conProblemas.map((s) => (
        <SeccionConProblemas key={s.id} seccion={s} onNavigate={onNavigate} />
      ))}

      {escondidos > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          {escondidos} {plural(escondidos, "punto más queda", "puntos más quedan")} fuera del filtro «{ROTULO[filtro]}».
        </p>
      )}

      {limpias.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Sin nada que revisar:</span>
          {limpias.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[var(--data-success-600)]" aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </p>
      )}

      <EnOrdenPorSeccion secciones={secciones} />
    </div>
  );
}

function SeccionConProblemas({ seccion: s, onNavigate }: { seccion: SeccionDelChequeo; onNavigate: (t: LothNavTarget) => void }) {
  const Icono = s.multas > 0 ? ShieldAlert : AlertTriangle;
  return (
    <section className="space-y-3" aria-label={s.label}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icono className={`h-5 w-5 ${s.multas > 0 ? "text-[var(--data-error-600)]" : "text-[var(--data-warning-600)]"}`} aria-hidden="true" />
        <CardTitle className="text-sm font-bold">{s.label}</CardTitle>
        <span className="flex flex-wrap items-center gap-x-3 text-sm">
          {s.multas > 0 && (
            <span className="font-semibold text-[var(--data-error-ink)]">
              {s.multas} {plural(s.multas, "puede multar", "pueden multar")}
            </span>
          )}
          {s.advertencias > 0 && (
            <span className="font-semibold text-[var(--data-warning-ink)]">
              {s.advertencias} {plural(s.advertencias, "advertencia", "advertencias")}
            </span>
          )}
          {s.enOrden.length > 0 && <span className="text-[var(--text-tertiary)]">{s.enOrden.length} en orden</span>}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {s.problemas.map((c) => (
          <ProblemCard key={c.key} check={c} onNavigate={() => onNavigate(c.navTarget)} />
        ))}
      </div>
    </section>
  );
}

/** Lo que está en orden, plegado y por sección: plegar no es esconder (la cuenta va en el título). */
function EnOrdenPorSeccion({ secciones }: { secciones: SeccionDelChequeo[] }) {
  const total = secciones.reduce((n, s) => n + s.enOrden.length, 0);
  if (total === 0) return null;
  return (
    <Plegable
      clave="loth:chequeo:en-orden"
      titulo={
        <span className="inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--data-success-600)]" aria-hidden="true" />
          <span>
            Verificaciones en orden <span className="text-[var(--text-tertiary)]">({total})</span>
          </span>
        </span>
      }
    >
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {secciones
          .filter((s) => s.enOrden.length > 0)
          .map((s) => (
            <div key={s.id} className="space-y-2">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">{s.label}</span>
              <ul className="space-y-2">
                {s.enOrden.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-hidden="true" />
                    <span className="text-[var(--text-secondary)]">{c.okTitle}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </Plegable>
  );
}
