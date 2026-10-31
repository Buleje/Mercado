"use client";

/**
 * El detalle de UNA cubicación de trozas guardada, sin abrirla para valorizar
 * (Brandon 24-10: «trozas igual que madera»). Hermano de
 * `cubicador-detalle-modal` (la aserrada): arriba sus datos de papel; después
 * las cifras que se congelaron al guardar (trozas, volumen, valor: las del
 * servidor, no se recubica); abajo el patio leído por especie × diámetro,
 * especie, diámetro (rangos), largo o troza por troza.
 *
 * Volumen en la unidad de su fórmula: m³ Smalian (3 decimales) o PT Oxapampa.
 * La cubicación de trozas no guarda dueño por troza: no hay lectura «por dueño».
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FileText, FolderOpen, GitCompareArrows, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { esDeTrozas, numeroVolumen, trozaACubicada } from "@/lib/forestal/cubicacion-trozas-diferencias";
import { UNIDADES_FORMULA, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { agruparTrozasPor, resumenTrozasPorEspecie, type DimensionTrozas } from "@/lib/forestal/cubicacion-trozas-resumen";
import { formatNumber } from "@/lib/format";
import { Chip, KpiResumen } from "./resumen-tabla";
import { ChipsDeLectura, FichaDeGuardada } from "./cubicador-detalle-ficha";
import { datosDeTrozas } from "./cubicador-trozas-ficha";
import { TablaGruposTrozas, TablaTrozasUnaPorUna } from "./cubicador-trozas-detalle-tablas";
import { ESTADO_CUB, useCubicacionTrozas } from "./hooks/use-cubicaciones-trozas";

type Lectura = "especie-tipo" | DimensionTrozas | "trozas";

const LECTURAS: readonly { id: Lectura; label: string }[] = [
  { id: "especie-tipo", label: "Especie × diámetro" },
  { id: "especie", label: "Por especie" },
  { id: "tipo", label: "Por diámetro (rangos)" },
  { id: "largo", label: "Por largo" },
  { id: "trozas", label: "Troza por troza" },
];
const PRIMERA_COL: Record<DimensionTrozas, string> = { especie: "Especie", tipo: "Diámetro", largo: "Largo" };

export function DetalleTrozasModal({ id, aboveModals, puedeComparar, onClose, onAbrir, onComparar }: {
  id: string;
  /** La lista vive en otra ventana: este va encima. */
  aboveModals?: boolean;
  /** Hay otra guardada de la misma fórmula con la cual comparar. */
  puedeComparar: boolean;
  onClose: () => void;
  /** Abre la cubicación para valorizarla o anularla. */
  onAbrir: () => void;
  onComparar: () => void;
}) {
  const { cub: c, cuenta, cargando, error } = useCubicacionTrozas(id);
  const [lectura, setLectura] = useState<Lectura>("especie-tipo");
  const formula: FormulaTrozas | null = c && esDeTrozas(c.formula) ? c.formula : null;
  const filas = useMemo(() => (c && formula ? (c.trozas ?? []).map((t) => trozaACubicada(t, formula)) : []), [c, formula]);
  const bloques = useMemo(() => (formula && lectura === "especie-tipo" ? resumenTrozasPorEspecie(filas, formula) : []), [filas, formula, lectura]);
  const agrupado = useMemo(() => (formula && (lectura === "especie" || lectura === "tipo" || lectura === "largo") ? agruparTrozasPor(filas, lectura, formula) : null), [filas, formula, lectura]);
  const volLote = useMemo(() => {
    if (!formula) return 0;
    const t = agruparTrozasPor(filas, "especie", formula).total;
    return formula === "oxapampina" ? t.pt : t.m3;
  }, [filas, formula]);
  /* Soles por especie (la plata se pone por especie): sólo en la lectura por especie. */
  const valores = useMemo(() => {
    const lineas = (c?.porEspecie ?? []).filter((l) => l.monto != null);
    if (lectura !== "especie" || lineas.length === 0) return undefined;
    return new Map(lineas.map((l) => [l.nombre.trim().toLowerCase() || "sin-especie", l.monto ?? 0]));
  }, [c, lectura]);

  const ayuda = (
    <InfoTip
      what="Lo que se guardó, sin abrirlo para valorizar: sus datos, sus cifras y el patio leído por especie, diámetro, largo o troza por troza."
      affects="Las cifras de arriba son las que se congelaron al guardar; las tablas, las medidas de cada troza. Smalian va en m³ (3 decimales); Oxapampina, en PT."
      example="«Por diámetro» dice cuánta troza delgada, media y gruesa trae el lote."
    />
  );
  const estado = c ? ESTADO_CUB[c.estado] : null;

  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      icon={FileText}
      title={c ? `${c.codigo}${c.personaNombre ? ` · ${c.personaNombre}` : ""}` : "Cubicación de trozas"}
      description={c && formula ? `${UNIDADES_FORMULA[formula].nombre} · ${formatNumber(c.nTrozas)} trozas` : undefined}
      claveVentana="cubicador-trozas-detalle"
      aboveModals={aboveModals}
      ayuda={ayuda}
      footer={
        <ModalFooter>
          <button type="button" onClick={onComparar} disabled={!puedeComparar} className={button({ variant: "secondary" })} title={puedeComparar ? undefined : "Guarda otra cubicación de la misma fórmula para poder comparar"}>
            <GitCompareArrows className="h-4 w-4" aria-hidden /> Comparar con otra…
          </button>
          <button type="button" onClick={onAbrir} className={button({ variant: "accent" })} disabled={!c}>
            <FolderOpen className="h-4 w-4" aria-hidden /> Abrir para valorizar
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`} data-vista="detalle-trozas">
        {cargando && <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…</p>}
        {error && <p role="alert" className="py-6 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
        {c && formula && estado && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${estado.clase}`}>{estado.label}</span>
              {c.volumenBruto != null && <Chip>Bruto {numeroVolumen(c.volumenBruto, formula)} {UNIDADES_FORMULA[formula].volumen} · con descuentos</Chip>}
            </div>
            <FichaDeGuardada datos={datosDeTrozas(c, { cuenta, completa: true })} notas={c.notas ?? undefined} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <KpiResumen label="Trozas" value={formatNumber(c.nTrozas)} />
              <KpiResumen label="Volumen" value={numeroVolumen(c.volumen, formula)} unidad={UNIDADES_FORMULA[formula].volumen}
                hint={formula === "smalian" ? `≈ ${fmtPt(c.volumen * PT_POR_M3)} PT` : undefined} />
              <KpiResumen label="Valor" value={c.monto != null ? `S/ ${fmtSoles(c.monto)}` : "—"} hint={c.monto != null ? undefined : "Sin valorizar"} destacado={c.monto != null} />
              <KpiResumen label={`S/ por ${UNIDADES_FORMULA[formula].volumen}`} value={c.monto != null && c.volumen > 0 ? fmtSoles(c.monto / c.volumen) : "—"} hint="Promedio del lote" />
              <KpiResumen label="Especies" value={formatNumber(new Set(filas.map((t) => (t.especie ?? "").trim().toLowerCase())).size)} />
            </div>

            <section aria-label="Resúmenes de la cubicación" className="space-y-3">
              <ChipsDeLectura opciones={LECTURAS} valor={lectura} onCambiar={setLectura} etiqueta="Cómo leer el patio" />
              {filas.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-6 text-center text-sm text-[var(--text-secondary)]">Se guardó sin trozas.</p>
              ) : lectura === "trozas" ? (
                <TablaTrozasUnaPorUna trozas={c.trozas ?? []} formula={formula} />
              ) : agrupado ? (
                <TablaGruposTrozas grupos={agrupado.grupos} total={agrupado.total} formula={formula} valores={valores}
                  primeraCol={PRIMERA_COL[lectura as DimensionTrozas]} caption={`${c.codigo}: ${LECTURAS.find((l) => l.id === lectura)?.label.toLowerCase()}`} />
              ) : (
                <div className="space-y-3">
                  {bloques.map((b) => {
                    const vol = formula === "oxapampina" ? b.total.pt : b.total.m3;
                    return (
                      <div key={b.especie} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">{b.especie}</CardTitle>
                          <span className="flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums">
                            <Chip>{formatNumber(b.total.trozas)} trozas</Chip>
                            <Chip>{numeroVolumen(vol, formula)} {UNIDADES_FORMULA[formula].volumen}</Chip>
                            {bloques.length > 1 && volLote > 0 && <Chip>{fmtPct((vol / volLote) * 100)} % del lote</Chip>}
                          </span>
                        </div>
                        <TablaGruposTrozas grupos={b.tipos} total={b.total} formula={formula} primeraCol="Diámetro" caption={`Diámetros de ${b.especie}`} />
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Las tablas suman cada troza con SU descuento (hueco, %); el lote puede
                  descontar además un % general. Sin esta línea 311,22 y 305,00 no cuadraban
                  a la vista (CUB-2026-0017, medido 24-10: 311,22 × 0,98 = 305,00). */}
              {filas.length > 0 && Math.abs(volLote - c.volumen) >= (formula === "oxapampina" ? 0.01 : 0.001) && (
                <p className="text-sm text-[var(--text-secondary)]" data-cierre="descuento-del-lote">
                  Las trozas suman <b className="font-mono tabular-nums">{numeroVolumen(volLote, formula)}</b> {UNIDADES_FORMULA[formula].volumen} con
                  el descuento de cada troza; el descuento del lote {volLote > c.volumen ? "quita" : "suma"}{" "}
                  <b className="font-mono tabular-nums">{numeroVolumen(Math.abs(volLote - c.volumen), formula)}</b> → quedan{" "}
                  <b className="font-mono tabular-nums">{numeroVolumen(c.volumen, formula)}</b> {UNIDADES_FORMULA[formula].volumen}, lo que se guardó.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </AdminModal>
  );
}
