"use client";

/**
 * Consumos del Libro CTP: qué queda en el patio y qué entró a la sierra.
 *
 * Shell (ADR-431): título, aviso de «Solo este permiso», dos pestañas de verdad
 * —Patio y el cuadro oficial— y los toasts. La lógica vive en `usePatioConsumos`
 * y `useConsumosSeccion2`. Refresco no bloqueante: consumir ya no desmonta la
 * vista, y un error del cuadro no tumba el patio.
 */

import { useCallback, useId, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpApartados, { CtpApartadoPanel, useApartado, type Apartado } from "./ctp-apartados";
import CtpAvisoAlcancePermiso from "./CtpAvisoAlcancePermiso";
import CtpAvisoSinOrigen from "./CtpAvisoSinOrigen";
import CtpConsumosPatio from "./CtpConsumosPatio";
import CtpConsumosSeccion2Kpis from "./CtpConsumosSeccion2Kpis";
import CtpConsumosSeccion2Barra, { CtpConsumosSeccion2Opciones } from "./CtpConsumosSeccion2Barra";
import CtpConsumosCuadro from "./CtpConsumosCuadro";
import CtpResumenPermisoModal from "./CtpResumenPermisoModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import { useConsumosSeccion2 } from "./hooks/use-consumos-seccion2";
import { usePatioConsumos } from "./hooks/use-patio-consumos";

/** Los ids de las pestañas: `useApartado` los valida al montar. */
const PESTANAS: readonly Apartado[] = [{ id: "patio", label: "Patio" }, { id: "seccion2", label: "Sección 2 · Consumos" }];

export default function CtpConsumosView({
  period,
  onIr,
  presetLoteId,
  onPresetLoteUsado,
}: {
  period: CtpPeriod;
  onIr?: (vista: string) => void;
  /** Lote que llega desde la pestaña Lotes con «Cargar» (ADR-342). */
  presetLoteId?: string | null;
  onPresetLoteUsado?: () => void;
}) {
  const idBase = useId();
  const { toasts, push, dismiss } = useActionToasts();
  const [resumenPermiso, setResumenPermiso] = useState(false);
  const abrirResumen = useCallback(() => setResumenPermiso(true), []);
  const { activo, ir } = useApartado("consumos", PESTANAS);
  /* El lote que manda Lotes lleva al patio: quedarse en el cuadro no mostraría nada. */
  const irAlPatio = useCallback(() => ir("patio"), [ir]);
  const s2 = useConsumosSeccion2(period);
  const p = usePatioConsumos({ pushToast: push, presetLoteId, onPresetLoteUsado, alAplicarPreset: irAlPatio });
  /* El contador de la pestaña es el patio ENTERO (mismo criterio que «Por
     permiso»: libres + en lote). Salía de las cifras filtradas y, con un lote
     elegido, decía «Patio 0 trozas» con 44 en el patio (medido 2026-09-24). */
  const enPatio = p.porPermiso.totales.enPatio.trozas;
  const apartados: Apartado[] = [
    {
      id: "patio",
      label: "Patio",
      hint: "La madera recibida que todavía no entró a la sierra: de acá se elige lo que se consume",
      contador: p.lotes.cargando && p.lotes.trozas.length === 0 ? "…" : enPatio,
      unidad: enPatio === 1 ? "troza" : "trozas",
    },
    {
      id: "seccion2",
      label: "Sección 2 · Consumos",
      hint: "El cuadro oficial del libro: qué madera entró a la sierra en el período",
      contador: s2.cargandoInicial ? "…" : s2.filas.length,
      unidad: s2.filas.length === 1 ? "consumo" : "consumos",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Título y apartados en UNA fila (2026-09-24): las pestañas eran un
          renglón propio entre el subtítulo y el contenido. */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {/* El subtítulo pasó al ⓘ (Brandon 2026-09-24: «mucho texto por todos
            lados»): a la vista queda el título; la explicación, a un toque. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <SectionTitle as="h2">Consumos</SectionTitle>
          <InfoTip
            title="Consumos"
            what="Qué madera queda en el patio y qué entró a la sierra en el período."
            affects="Patio: de acá se eligen las trozas que se cargan en un lote. Sección 2: el cuadro oficial del libro."
            example="Patio con 44 trozas esperando; en Sección 2, los 6 consumos del mes tal como van al formato de SERFOR."
          />
        </div>
        <CtpApartados apartados={apartados} activo={activo} onIr={ir} idBase={idBase} etiqueta="Apartados de Consumos" />
      </header>

      {p.contratoFiltro && p.codigoPermisoActivo && (
        <CtpAvisoAlcancePermiso
          codigo={p.codigoPermisoActivo}
          acotado={["el patio", "«Por permiso»", "los indicadores del patio"]}
          sinAcotar={["el cuadro de la Sección 2", "la lista de lotes"]}
        />
      )}

      <CtpApartadoPanel idBase={idBase} id={activo}>
        {activo === "patio" ? (
          <CtpConsumosPatio
            estado={p}
            onIr={onIr}
            pushToast={push}
            onResumenPermiso={abrirResumen}
            onConsumido={() => void s2.recargar()}
          />
        ) : (
          <div className="space-y-4" aria-busy={s2.refrescando || s2.cargandoInicial || undefined}>
            <CtpAvisoSinOrigen
              corridas={s2.resumen.corridasSinOrigen}
              producidoSinOrigen={s2.resumen.producidoSinOrigen}
              onIrAProduccion={onIr ? () => onIr("produccion") : undefined}
            />
            <CtpConsumosSeccion2Kpis s2={s2} period={period} />
            {/* Filtros y «Opciones» dentro del marco del cuadro (2026-09-24). */}
            <CtpConsumosCuadro
              s2={s2}
              accion={<CtpConsumosSeccion2Opciones s2={s2} onResumenPermiso={abrirResumen} />}
              barra={<CtpConsumosSeccion2Barra s2={s2} />}
            />
          </div>
        )}
      </CtpApartadoPanel>

      <ActionToasts toasts={toasts} onDismiss={dismiss} />

      <CtpResumenPermisoModal
        open={resumenPermiso}
        onClose={() => setResumenPermiso(false)}
        trozas={p.lotes.trozas}
        lotes={p.lotes.lotes}
      />
    </div>
  );
}
