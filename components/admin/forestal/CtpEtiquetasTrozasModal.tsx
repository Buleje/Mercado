"use client";

/**
 * CtpEtiquetasTrozasModal — antes de imprimir las etiquetas QR de las trozas
 * (ADR-436), lo que hay que saber y elegir:
 *
 *   - cuántas van (sólo las que HOY están en el patio) y cuántas ya tenían
 *     etiqueta, con la fecha de la última — reimprimir gasta stickers;
 *   - cuántas no tienen código de planta: el servidor les da el siguiente
 *     correlativo libre si se deja tildado, y ese número sale en la etiqueta;
 *   - si hay códigos repetidos en el patio: una etiqueta con «118» no distingue
 *     cuál de las dos piezas es;
 *   - el formato (A4, rollo 50×30 o 100×50, testa A6) y el código de barras.
 *
 * Lo abren la lista de trozas (lo tildado) y la fila de una guía (sus piezas).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@buleje/design-system";
import { AlertTriangle, Loader2, QrCode } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useGenerarEtiquetasTrozas } from "@/hooks/use-imprimir-etiquetas-trozas";
import { diaDeEtiqueta, type TrozaEtiquetable } from "@/lib/forestal/ctp-troza-etiquetas";
import { TAB_LIBRO_CTP } from "@/lib/forestal/ctp-troza-url";
import CtpEtiquetasFormatos, { useFormatoEtiquetaRecordado } from "./CtpEtiquetasFormatos";
import { Btn, ModalFooter } from "./ctp-shared";
import { useImprimirMarcadores } from "./hooks/use-imprimir-marcadores";

export interface CtpEtiquetasTrozasModalProps {
  /** Las trozas candidatas (lo tildado, o las piezas de una guía). */
  ids: readonly string[];
  /** De dónde vienen, para el subtítulo («Guía 001-0012345»). */
  contexto?: string;
  onClose: () => void;
  /** Se imprimió: la vista relee (sello de impresión y códigos nuevos). */
  onListo?: (trozas: TrozaEtiquetable[]) => void;
  /** Abierto desde otro modal. */
  aboveModals?: boolean;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function Casilla({ checked, onChange, children, ayuda }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; ayuda?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-2">
      <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
        <span>{children}</span>
      </label>
      {ayuda}
    </div>
  );
}

export default function CtpEtiquetasTrozasModal({ ids, contexto, onClose, onListo, aboveModals }: CtpEtiquetasTrozasModalProps) {
  const [formato, setFormato] = useFormatoEtiquetaRecordado();
  const [barras, setBarras] = useState(true);
  const [fichaEnQr, setFichaEnQr] = useState(true);
  const [asignar, setAsignar] = useState(true);
  const [soloSinEtiqueta, setSoloSinEtiqueta] = useState(false);
  const { errorCarga, resumen, generar, generando: generandoEtiquetas, errorGenerar: errorEtiquetas, resultado } = useGenerarEtiquetasTrozas(ids, soloSinEtiqueta);
  /* «Marcador A4 · cámara» (ADR-480): otra salida para las mismas trozas. */
  const [marcadorA4, setMarcadorA4] = useState(false);
  const marcadores = useImprimirMarcadores();
  const generando = generandoEtiquetas || marcadores.imprimiendo;
  const errorGenerar = marcadorA4 ? marcadores.error : errorEtiquetas;

  /* «Solo las nuevas» arranca prendido cuando hay de las dos: reimprimir lo que
     ya está pegado en la madera es gastar stickers. Si TODAS ya tienen, se deja
     apagado — si no, el botón diría «0» sin explicar por qué. Una sola vez. */
  const inicializado = useRef(false);
  useEffect(() => {
    if (!resumen || inicializado.current) return;
    inicializado.current = true;
    const ya = resumen.yaEtiquetadas.length;
    if (ya > 0 && ya < resumen.enPatio.length) setSoloSinEtiqueta(true);
  }, [resumen]);

  const alGenerar = async () => {
    if (marcadorA4) {
      if (resumen) await marcadores.imprimir(resumen.aImprimir);
      return;
    }
    const r = await generar({ formato, barras, fichaEnQr, asignarCodigo: asignar, soloSinEtiqueta });
    if (!r) return;
    onListo?.(r.trozas);
    const partes = [
      r.asignados.length > 0 ? `${plural(r.asignados.length, "número nuevo", "números nuevos")}` : "",
      r.omitidas.length > 0 ? `${plural(r.omitidas.length, "omitida", "omitidas")}` : "",
    ].filter(Boolean);
    toast.success(`${plural(r.impresas, "etiqueta lista", "etiquetas listas")}`, {
      description: [contexto, ...partes, "se abrió en una pestaña nueva"].filter(Boolean).join(" · "),
    });
    // Sin nada que mirar, se cierra; con omitidas o sin correlativo, queda abierto para leerlo.
    if (r.omitidas.length === 0 && (r.sinCodigoNuevo?.length ?? 0) === 0 && r.repetidos.length === 0) onClose();
  };

  const n = resumen?.aImprimir.length ?? 0;
  const rutaRepetidos = `/admin?tab=${TAB_LIBRO_CTP}&vista=trozas`;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Imprimir etiquetas"
      description={contexto ?? plural(ids.length, "troza elegida", "trozas elegidas")}
      icon={QrCode}
      variant="wide"
      aboveModals={aboveModals}
      footer={
        <ModalFooter>
          <Btn onClick={onClose}>Cerrar</Btn>
          <Btn variant="primary" disabled={!resumen || n === 0 || generando} onClick={() => void alGenerar()}>
            {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            {marcadorA4 ? "Imprimir marcadores" : "Generar etiquetas"}{n > 0 ? ` (${n})` : ""}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {errorCarga && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            No se pudo leer el patio: {errorCarga}
          </p>
        )}
        {!resumen && !errorCarga && (
          <p className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Revisando qué trozas siguen en el patio…
          </p>
        )}

        {resumen && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatCard density="compact" label="Van" value={n} subValue={resumen.fuera > 0 ? `${resumen.fuera} fuera del patio` : "en el patio"} />
              <StatCard
                density="compact"
                label="Con etiqueta"
                value={resumen.yaEtiquetadas.length}
                subValue={resumen.ultimaEtiqueta ? `última: ${diaDeEtiqueta(resumen.ultimaEtiqueta)}` : "ninguna"}
              />
              <StatCard density="compact" label="Sin código" value={resumen.sinCodigo.length} subValue="de planta" emphasis={resumen.sinCodigo.length > 0 ? "warning" : "neutral"} />
            </div>

            {resumen.enPatio.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-secondary)]">
                Ninguna de estas trozas sigue en el patio: ya se aserraron, salieron o no llegaron.
              </p>
            )}

            {resumen.repetidos.length > 0 && (
              <div role="status" className="flex gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3 text-sm text-[var(--text-primary)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
                <p>
                  <b>Códigos repetidos:</b>{" "}
                  {resumen.repetidos.slice(0, 6).map((r) => `${r.codigo} (${r.piezas} piezas)`).join(", ")}
                  {resumen.repetidos.length > 6 && ` y ${resumen.repetidos.length - 6} más`}. La etiqueta no distingue cuál es cuál.{" "}
                  <a href={rutaRepetidos} className="font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]">
                    Corregir en Trozas
                  </a>
                </p>
              </div>
            )}

            <div className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] px-3">
              {resumen.yaEtiquetadas.length > 0 && (
                <Casilla checked={soloSinEtiqueta} onChange={setSoloSinEtiqueta}>
                  Solo las que no tienen etiqueta ({resumen.enPatio.length - resumen.yaEtiquetadas.length})
                </Casilla>
              )}
              {resumen.sinCodigo.length > 0 && (
                <Casilla
                  checked={asignar}
                  onChange={setAsignar}
                  ayuda={
                    <InfoTip
                      title="Número correlativo"
                      what="Les da el siguiente número libre del patio y lo guarda como código de planta. Sale en la etiqueta: píntalo también en la testa."
                      affects="Si lo apagas, la etiqueta lleva el código del bosque."
                    />
                  }
                >
                  Asignarles número correlativo ({resumen.sinCodigo.length})
                </Casilla>
              )}
              <Casilla
                checked={fichaEnQr}
                onChange={setFichaEnQr}
                ayuda={
                  <InfoTip
                    title="Dos QR"
                    what="El QR grande lleva la ficha escrita: código, especie, m³, medidas, N° de registro, GTF, titular y permiso. Cualquier celular la lee con la cámara, sin internet."
                    affects="El QR chico abre la troza en el sistema: es el que escaneas para armar lotes. Si lo apagas, queda un solo QR, el del sistema."
                  />
                }
              >
                Ficha en el QR (sin internet)
              </Casilla>
              <Casilla
                checked={barras}
                onChange={setBarras}
                ayuda={<InfoTip title="Código de barras" what="Barras Code 128 del código, para la pistola lectora de la balanza o del almacén." />}
              >
                Código de barras
              </Casilla>
            </div>

            <CtpEtiquetasFormatos
              valor={formato}
              onCambio={setFormato}
              conFicha={fichaEnQr}
              marcadorA4={{ activo: marcadorA4, onCambio: setMarcadorA4 }}
            />
          </>
        )}

        {errorGenerar && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {errorGenerar}
          </p>
        )}

        {resultado && (resultado.omitidas.length > 0 || (resultado.sinCodigoNuevo?.length ?? 0) > 0 || resultado.asignados.length > 0) && (
          <div role="status" className="space-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
            <p className="font-bold text-[var(--text-primary)]">{plural(resultado.impresas, "etiqueta impresa", "etiquetas impresas")}</p>
            {resultado.asignados.length > 0 && (
              <p>
                Números nuevos: <span className="font-bold tabular-nums text-[var(--text-primary)]">{resultado.asignados.map((a) => a.codigo).join(", ")}</span>
              </p>
            )}
            {(resultado.sinCodigoNuevo?.length ?? 0) > 0 && (
              <p>{plural(resultado.sinCodigoNuevo!.length, "pieza de un mes cerrado salió", "piezas de un mes cerrado salieron")} con el código del bosque, sin número nuevo.</p>
            )}
            {resultado.omitidas.length > 0 && (
              <ul className="space-y-0.5">
                {resultado.omitidas.map((o) => (
                  <li key={o.id}>
                    <b className="text-[var(--text-primary)]">Omitida:</b> {o.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
