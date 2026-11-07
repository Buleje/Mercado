"use client";

/**
 * Consumos del Libro CTP: qué queda en el patio y qué entró a la sierra.
 *
 * Shell (ADR-431): título, aviso de «Solo este permiso», dos pestañas de verdad
 * —Patio y el cuadro oficial— y los toasts. Desde la compactación del libro
 * (17-10) las pestañas son las de toda vista con 2.º nivel (`PestanasDeVista`,
 * con la cifra en el rótulo) y las «Opciones» de cada una van al riel. La lógica vive en `usePatioConsumos`
 * y `useConsumosSeccion2`. Refresco no bloqueante: consumir ya no desmonta la
 * vista, y un error del cuadro no tumba el patio.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { ClipboardList, Trees } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AccionesDeLaVista, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { useApartado, type Apartado } from "./ctp-apartados";
import { CabeceraDeVista } from "./ctp-cabecera-vista";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import CtpAvisoAlcancePermiso from "./CtpAvisoAlcancePermiso";
import CtpAvisoSinOrigen from "./CtpAvisoSinOrigen";
import CtpConsumosPatio from "./CtpConsumosPatio";
import { useSeccion2Kpis } from "./CtpConsumosSeccion2Kpis";
import CtpConsumosSeccion2Barra, { CtpConsumosSeccion2Opciones } from "./CtpConsumosSeccion2Barra";
import CtpConsumosCuadro from "./CtpConsumosCuadro";
import CtpResumenPermisoModal from "./CtpResumenPermisoModal";
import { useActionToasts, ActionToasts } from "./cubicador-toasts";
import { useConsumosSeccion2 } from "./hooks/use-consumos-seccion2";
import { usePatioConsumos } from "./hooks/use-patio-consumos";
import type { LoteAProducir } from "./CtpLotesView";

/** Los ids de las pestañas: `useApartado` los valida al montar. */
const PESTANAS: readonly Apartado[] = [{ id: "patio", label: "Patio" }, { id: "seccion2", label: "Sección 2 · Consumos" }];
type IdPestana = "patio" | "seccion2";

export default function CtpConsumosView({
  period,
  onIr,
  presetLoteId,
  onPresetLoteUsado,
  onProducir,
}: {
  period: CtpPeriod;
  onIr?: (vista: string) => void;
  /** Producir con un lote (el que salió de un lote mixto): cruza a Producción. */
  onProducir?: (lote: LoteAProducir) => void;
  /** Lote que llega desde la pestaña Lotes con «Cargar» (ADR-342). */
  presetLoteId?: string | null;
  onPresetLoteUsado?: () => void;
}) {
  const idBase = useId();
  const enLibro = useEnElLibro();
  const { toasts, push, dismiss } = useActionToasts();
  const [resumenPermiso, setResumenPermiso] = useState(false);
  const abrirResumen = useCallback(() => setResumenPermiso(true), []);
  const { activo, ir } = useApartado("consumos", PESTANAS);
  /* El lote que manda Lotes lleva al patio: quedarse en el cuadro no mostraría nada. */
  const irAlPatio = useCallback(() => ir("patio"), [ir]);
  /* «Consumir» de Cámaras (ADR-480) también: el paso «Desde la cámara» vive en el
     Patio. Se mira al montar (el Patio saca los parámetros de la URL al leerlos). */
  const [desdeCamara] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("desdeCamara"));
  useEffect(() => {
    if (desdeCamara) irAlPatio();
  }, [desdeCamara, irAlPatio]);
  const s2 = useConsumosSeccion2(period);
  /* El botón de indicadores va en el encabezado del cuadro, al lado de
     «Opciones»; el panel, debajo del título (2026-09-24). */
  const kpis2 = useSeccion2Kpis(s2, period);
  const p = usePatioConsumos({ pushToast: push, presetLoteId, onPresetLoteUsado, alAplicarPreset: irAlPatio });
  /* El contador de la pestaña es el patio ENTERO (mismo criterio que «Por
     permiso»: libres + en lote). Salía de las cifras filtradas y, con un lote
     elegido, decía «Patio 0 trozas» con 44 en el patio (medido 2026-09-24). */
  const enPatio = p.porPermiso.totales.enPatio.trozas;
  const nPatio = p.lotes.cargando && p.lotes.trozas.length === 0 ? "…" : `${enPatio} ${enPatio === 1 ? "troza" : "trozas"}`;
  const nCuadro = s2.cargandoInicial ? "…" : `${s2.filas.length} ${s2.filas.length === 1 ? "consumo" : "consumos"}`;
  const pestanas: readonly PestanaDeVista<IdPestana>[] = [
    {
      id: "patio",
      label: `Patio · ${nPatio}`,
      icon: Trees,
      hint: "La madera recibida que todavía no entró a la sierra: de acá se elige lo que se consume",
    },
    {
      id: "seccion2",
      label: `Sección 2 · ${nCuadro}`,
      icon: ClipboardList,
      hint: "El cuadro oficial del libro: qué madera entró a la sierra en el período",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Dentro del libro el título se calla y el ⓘ va al riel (compactación
          17-10): el riel ya dice «Consumos». */}
      <CabeceraDeVista
        titulo="Consumos"
        info={
          <InfoTip
            title="Consumos"
            what="Qué madera queda en el patio y qué entró a la sierra en el período."
            affects="Patio: de acá se eligen las trozas que se cargan en un lote. Sección 2: el cuadro oficial del libro."
            example="Patio con 44 trozas esperando; en Sección 2, los 6 consumos del mes tal como van al formato de SERFOR."
          />
        }
      />

      {p.contratoFiltro && p.codigoPermisoActivo && (
        <CtpAvisoAlcancePermiso
          codigo={p.codigoPermisoActivo}
          acotado={["el patio", "la línea de lo que queda"]}
          sinAcotar={["el cuadro de la Sección 2", "la lista de lotes"]}
        />
      )}

      <PestanasDeVista<IdPestana>
        prefijo={`ctp-consumos${idBase.replace(/:/g, "")}`}
        etiqueta="Pestañas de Consumos"
        items={pestanas}
        activa={activo as IdPestana}
        onCambiar={ir}
      >
        {activo === "patio" ? (
          <CtpConsumosPatio
            estado={p}
            onIr={onIr}
            onProducir={onProducir}
            pushToast={push}
            onResumenPermiso={abrirResumen}
            onConsumido={() => void s2.recargar()}
          />
        ) : (
          <div className="space-y-4" aria-busy={s2.refrescando || s2.cargandoInicial || undefined}>
            {/* «Opciones» del cuadro al riel; los indicadores ya van solos. */}
            {enLibro && (
              <AccionesDeLaVista>
                <CtpConsumosSeccion2Opciones s2={s2} onResumenPermiso={abrirResumen} />
              </AccionesDeLaVista>
            )}
            <CtpAvisoSinOrigen
              corridas={s2.resumen.corridasSinOrigen}
              producidoSinOrigen={s2.resumen.producidoSinOrigen}
              onIrAProduccion={onIr ? () => onIr("produccion") : undefined}
            />
            {/* Filtros y «Opciones» dentro del marco del cuadro (2026-09-24). */}
            <CtpConsumosCuadro
              s2={s2}
              accion={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {kpis2.boton}
                  {!enLibro && <CtpConsumosSeccion2Opciones s2={s2} onResumenPermiso={abrirResumen} />}
                </div>
              }
              barra={
                <>
                  {kpis2.panel}
                  <CtpConsumosSeccion2Barra s2={s2} />
                </>
              }
            />
          </div>
        )}
      </PestanasDeVista>

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
