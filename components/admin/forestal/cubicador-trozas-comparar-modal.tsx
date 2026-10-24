"use client";

/**
 * Comparar dos cubicaciones de TROZAS guardadas (Brandon 24-10: «trozas igual
 * que madera»; ejemplo: lo que midió el monte contra lo que mediste en el
 * patio). Hermano de `cubicador-comparar-modal` (la aserrada): arriba quién es
 * quién; después el cuadro de totales; después cada grupo (especie, diámetro,
 * largo) y, si comparten códigos de troza, qué troza cambió. Todo se lee B − A.
 *
 * Sólo se comparan dos de la MISMA fórmula (Smalian en m³ con Smalian; PT
 * Oxapampa con Oxapampa): mezclar m³ con PT no dice nada.
 */
import { CardTitle } from "@buleje/design-system";
import { ArrowLeftRight, GitCompareArrows, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { Casilla } from "@/components/ui-system/Casilla";
import {
  DIMENSIONES_COMPARAR_TROZAS, cambioTrozas, lecturaDiferenciasTrozas,
} from "@/lib/forestal/cubicacion-trozas-diferencias";
import { ETIQUETA_DIMENSION_TROZAS } from "@/lib/forestal/cubicacion-trozas-resumen";
import { ChipsDeLectura } from "./cubicador-detalle-ficha";
import { LadoDeLasTrozas } from "./cubicador-trozas-comparar-lado";
import { CuadroTotalesTrozas, TablaDiferenciasTrozas, TablaTrozaPorTroza } from "./cubicador-trozas-comparar-tablas";
import { useCompararTrozas } from "./hooks/use-comparar-trozas";
import { useCubicacionesTrozas, type CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";

const LECTURAS = DIMENSIONES_COMPARAR_TROZAS.map((d) => ({
  id: d,
  label: d === "tipo" ? "Por diámetro (rangos)" : ETIQUETA_DIMENSION_TROZAS[d],
}));
const primeraCol = (d: (typeof DIMENSIONES_COMPARAR_TROZAS)[number]) => (d === "especie" ? "Especie" : d === "tipo" ? "Diámetro" : "Largo");

function Cuerpo({ lista, inicialA }: { lista: readonly CubicacionTrozas[]; inicialA: string | null }) {
  const s = useCompararTrozas(lista, inicialA);
  const { resumenA, resumenB, diferencias, totales, formula } = s;

  if (s.recientes.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-8 text-center text-sm text-[var(--text-secondary)]">
        Necesitas dos cubicaciones de trozas guardadas para comparar.
      </p>
    );
  }
  return (
    <>
      <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <LadoDeLasTrozas letra="A" elegida={resumenA} opciones={s.recientes} onElegir={s.elegirA} />
        <button
          type="button"
          onClick={s.intercambiar}
          disabled={!resumenA || !resumenB}
          aria-label="Intercambiar A y B"
          title="Intercambiar A y B"
          className={`${button({ variant: "secondary", size: "icon" })} justify-self-center md:mt-12`}
        >
          <ArrowLeftRight className="h-5 w-5 max-md:rotate-90" aria-hidden />
        </button>
        <LadoDeLasTrozas letra="B" elegida={resumenB} opciones={s.opcionesB} onElegir={s.elegirB} />
      </div>

      {resumenA && resumenB && !s.comparables && (
        <p role="status" className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]">
          Una está en m³ Smalian y la otra en PT Oxapampa: no se pueden comparar mezcladas. Elige dos de la misma fórmula.
        </p>
      )}
      {s.error && <p role="alert" className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{s.error}</p>}
      {s.cargando && <p className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo las medidas…</p>}

      {resumenA && resumenB && formula && diferencias && totales && (
        <>
          <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
            {lecturaDiferenciasTrozas(diferencias, resumenA.codigo, resumenB.codigo, formula)}
          </p>

          <CuadroTotalesTrozas total={totales} formula={formula} />

          <section aria-label="Diferencias por grupo" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Dónde está la diferencia</CardTitle>
              <span className="text-sm text-[var(--text-tertiary)]">
                {diferencias.filas.filter(cambioTrozas).length} con cambios · {diferencias.iguales} iguales
              </span>
              <span className="ml-auto">
                <Casilla etiqueta="Sólo lo que cambió" checked={s.soloCambios} onChange={(e) => s.setSoloCambios(e.target.checked)} />
              </span>
            </div>
            <ChipsDeLectura opciones={LECTURAS} valor={s.dim} onCambiar={s.setDim} etiqueta="Comparar por" />
            <TablaDiferenciasTrozas
              filas={s.filas}
              total={diferencias.total}
              primeraCol={primeraCol(s.dim)}
              formula={formula}
              caption={`Diferencias ${LECTURAS.find((l) => l.id === s.dim)?.label.toLowerCase()} entre ${resumenA.codigo} y ${resumenB.codigo}`}
              vacio="Ningún grupo cambió: todos tienen las mismas trozas y el mismo volumen."
            />
          </section>

          {s.trozaATroza ? (
            <section aria-label="Troza por troza" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Troza por troza</CardTitle>
                <span className="text-sm text-[var(--text-tertiary)]">
                  {s.trozaATroza.enComun} en común · {s.trozaATroza.iguales} iguales · {s.trozaATroza.cambios.length} con cambios
                </span>
                <InfoTip
                  ariaLabel="Cuándo sale troza por troza"
                  what="Sale cuando las dos tienen trozas con el mismo código: la misma troza medida en el monte y en el patio. Se ve qué diámetro o largo cambió."
                  example="T-0412: Ø 50 → 48 cm, largo 5 → 4,8 m, −0,114 m³."
                />
              </div>
              <TablaTrozaPorTroza datos={s.trozaATroza} formula={formula} />
              {(s.trozaATroza.sinCodigoA > 0 || s.trozaATroza.sinCodigoB > 0) && (
                <p className="text-sm text-[var(--text-tertiary)]">
                  Sin código no se pueden emparejar: {s.trozaATroza.sinCodigoA} en A y {s.trozaATroza.sinCodigoB} en B. Esas cuentan en los grupos de arriba.
                </p>
              )}
            </section>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">
              No comparten códigos de troza: se comparan por grupo.
            </p>
          )}
        </>
      )}
    </>
  );
}

export function CompararTrozasModal({ inicialA, aboveModals, onClose }: {
  /** La de la fila (A); `null` = «Comparar dos» desde la cabecera de la lista. */
  inicialA: string | null;
  aboveModals?: boolean;
  onClose: () => void;
}) {
  const { lista, cargando, error } = useCubicacionesTrozas({});
  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      icon={GitCompareArrows}
      title="Comparar cubicaciones de trozas"
      description="Dos guardadas de la misma fórmula, lado a lado"
      claveVentana="cubicador-trozas-comparar"
      aboveModals={aboveModals}
      ayuda={
        <InfoTip
          what="Dos cubicaciones de trozas guardadas lado a lado: cuántas trozas, cuánto m³ (o PT Oxapampa) y cuántos soles tiene cada una, y en qué grupo está la diferencia."
          affects="La diferencia es B menos A: verde si B tiene más, ámbar si tiene menos. Sólo se comparan dos de la misma fórmula. Si comparten códigos de troza, se ve cuál cambió."
          example="Comparas lo que midió el monte con lo que mediste en el patio y ves que la T-0412 bajó de 0,982 a 0,868 m³."
        />
      }
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cerrar</button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`} data-vista="comparar-trozas">
        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…</p>
        ) : error ? (
          <p role="alert" className="py-6 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
        ) : lista ? (
          <Cuerpo lista={lista} inicialA={inicialA} />
        ) : null}
      </div>
    </AdminModal>
  );
}
