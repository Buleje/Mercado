"use client";

/**
 * Comparar dos cubicaciones GUARDADAS (Brandon 24-10: «podré comparar con otro
 * guardado y saldrá un cuadro de diferencia en pies, m³, piezas y diferencias
 * en medidas, cada uno con su dato de cliente»).
 *
 * Distinto de Resúmenes › Comparar (el lote en pantalla contra uno guardado):
 * acá las dos están guardadas y se elige cualquiera de cada lado. Arriba
 * quién es quién; después el cuadro de totales; después cada grupo (especie,
 * tipo, medida, sección, largo, dueño) y, si una salió de la otra con
 * «Duplicar», qué fila cambió. Todo se lee B − A.
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowLeftRight, ClipboardCopy, Download, GitCompareArrows } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { DIMENSIONES_COMPARAR, diferenciasACsv, lecturaDiferencias } from "@/lib/forestal/cubicacion-diferencias";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { ETIQUETA_DIMENSION } from "@/lib/forestal/cubicacion-resumen";
import { logger } from "@/lib/logger";
import { useCompararCubicaciones } from "./hooks/use-comparar-cubicaciones";
import { ChipsDeLectura } from "./cubicador-detalle-ficha";
import { LadoDeLaComparacion } from "./cubicador-comparar-lado";
import { CuadroTotales, TablaDiferencias, TablaPiezaPorPieza } from "./cubicador-comparar-tablas";

const LECTURAS = DIMENSIONES_COMPARAR.map((d) => ({ id: d, label: ETIQUETA_DIMENSION[d] }));
const primeraCol = (label: string) => {
  const s = label.replace("Por ", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function bajar(texto: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const nombreDeArchivo = (a: string, b: string) =>
  `comparar-${[a, b].map((n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)).join("-vs-")}.csv`;

export function CompararCubicacionesModal({ lista, inicialA, aboveModals, onClose }: {
  lista: readonly CubicacionRegistro[];
  /** La de la tarjeta (A); `null` = «Comparar dos» desde la cabecera. */
  inicialA: string | null;
  aboveModals?: boolean;
  onClose: () => void;
}) {
  const s = useCompararCubicaciones(lista, inicialA);
  const [copiado, setCopiado] = useState(false);
  const { a, b, diferencias, totales } = s;
  /* La columna de soles por grupo sólo si las dos tienen precio: contra una sin precio no hay diferencia que leer. */
  const conValor = Boolean(a && b && a.valor > 0 && b.valor > 0);
  const etiquetaDim = ETIQUETA_DIMENSION[s.dim];

  const exportar: MenuAccion[] = a && b && diferencias ? [
    {
      id: "csv",
      label: "Bajar para Excel",
      hint: `El cuadro ${etiquetaDim.toLowerCase()}, con el total`,
      icon: Download,
      onSelect: () => bajar(diferenciasACsv(diferencias, primeraCol(etiquetaDim), a.nombre, b.nombre), nombreDeArchivo(a.nombre, b.nombre)),
    },
    {
      id: "copiar",
      label: copiado ? "Cuadro copiado" : "Copiar el cuadro",
      hint: "Para pegarlo en una hoja de cálculo",
      icon: ClipboardCopy,
      onSelect: () => {
        navigator.clipboard
          ?.writeText(diferenciasACsv(diferencias, primeraCol(etiquetaDim), a.nombre, b.nombre, "\t"))
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          })
          .catch((err: unknown) => logger.warn("[cubicador] no se pudo copiar el cuadro", { error: String(err) }));
      },
    },
  ] : [];

  return (
    <AdminModal
      open
      onClose={onClose}
      size="xl"
      icon={GitCompareArrows}
      title="Comparar cubicaciones"
      description={a && b ? `${a.nombre} contra ${b.nombre}` : "Elige las dos guardadas"}
      claveVentana="cubicador-comparar-guardadas"
      aboveModals={aboveModals}
      ayuda={
        <InfoTip
          what="Dos cubicaciones guardadas lado a lado: cuánto pie tablar, m³, piezas y soles tiene cada una y en qué grupo está la diferencia."
          affects="La diferencia es B menos A: verde si B tiene más, ámbar si tiene menos. Arriba, los totales con que se guardó cada una (los del cubicador); en las tablas, cada grupo redondeado como en la guía, por eso su total puede correr una milésima."
          example="Comparas la cubicación del patio con la del cliente y ves que faltan 3 piezas de 2×8×10."
        />
      }
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cerrar</button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-5`}>
        {lista.length < 2 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-8 text-center text-sm text-[var(--text-secondary)]">
            Necesitas dos cubicaciones guardadas para comparar.
          </p>
        ) : (
          <>
            <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <LadoDeLaComparacion letra="A" elegida={a} opciones={s.recientes} onElegir={s.elegirA} />
              <button
                type="button"
                onClick={s.intercambiar}
                disabled={!a || !b}
                aria-label="Intercambiar A y B"
                title="Intercambiar A y B"
                className={`${button({ variant: "secondary", size: "icon" })} justify-self-center md:mt-12`}
              >
                <ArrowLeftRight className="h-5 w-5 max-md:rotate-90" aria-hidden />
              </button>
              <LadoDeLaComparacion letra="B" elegida={b} opciones={s.recientes} onElegir={s.elegirB} />
            </div>

            {a && b && diferencias && (
              <>
                <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
                  {lecturaDiferencias(diferencias, a.nombre, b.nombre)}
                </p>

                {totales && <CuadroTotales total={totales} />}

                <section aria-label="Diferencias por grupo" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Dónde está la diferencia</CardTitle>
                    <span className="text-sm text-[var(--text-tertiary)]">
                      {diferencias.filas.length - diferencias.iguales} con cambios · {diferencias.iguales} iguales
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={s.soloCambios}
                          onChange={(e) => s.setSoloCambios(e.target.checked)}
                          className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
                        />
                        Sólo lo que cambió
                      </label>
                      <ActionMenu label="Exportar" icon={Download} size="sm" actions={exportar} title="Bajar o copiar el cuadro" />
                    </div>
                  </div>
                  <ChipsDeLectura opciones={LECTURAS} valor={s.dim} onCambiar={s.setDim} etiqueta="Comparar por" />
                  <TablaDiferencias
                    filas={s.filas}
                    total={diferencias.total}
                    primeraCol={primeraCol(etiquetaDim)}
                    conValor={conValor}
                    caption={`Diferencias ${etiquetaDim.toLowerCase()} entre ${a.nombre} y ${b.nombre}`}
                    vacio="Ningún grupo cambió: todos tienen las mismas piezas y el mismo pie tablar."
                  />
                </section>

                {s.piezaAPieza ? (
                  <section aria-label="Pieza por pieza" className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Pieza por pieza</CardTitle>
                      <span className="text-sm text-[var(--text-tertiary)]">
                        {s.piezaAPieza.enComun} en común · {s.piezaAPieza.iguales} iguales · {s.piezaAPieza.cambios.length} con cambios
                      </span>
                      <InfoTip
                        ariaLabel="Cuándo sale pieza por pieza"
                        what="Sale cuando una es copia de la otra («Duplicar»): cada fila conserva su lugar y se ve qué medida o cantidad cambió."
                        example="N° 12: largo 10 → 9 pies, −5.33 PT."
                      />
                    </div>
                    <TablaPiezaPorPieza datos={s.piezaAPieza} />
                  </section>
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    No comparten filas (ninguna es copia de la otra): se comparan por grupo.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AdminModal>
  );
}
