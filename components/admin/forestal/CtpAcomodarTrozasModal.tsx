"use client";

/**
 * «Acomodar trozas en su especie» (ADR-435) — vista previa y confirmación.
 *
 * Una guía con varias especies tiene una fila por especie, pero sus trozas
 * llegaron a colgar todas de una sola (en Blas, 29 de 46 del permiso de
 * Huánuco). Acá se ve, antes de tocar nada, qué troza pasa de qué fila a cuál
 * y cómo queda cada fila contra lo que declara; con un clic se acomoda.
 *
 * Se abre desde la ficha de la guía (una guía) y desde «Opciones» de Ingresos
 * (todas). Mover una troza es un acto explícito: nada se acomoda solo.
 */

import { ArrowLeftRight, Check, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { nTrozas } from "@/lib/forestal/acomodar-trozas";
import { useAcomodarTrozas, type AlcanceAcomodoCliente, type ResultadoAcomodo } from "@/hooks/use-acomodar-trozas";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import CtpAcomodarTrozasGuia from "./CtpAcomodarTrozasGuia";

export default function CtpAcomodarTrozasModal({
  alcance,
  descripcion,
  aboveModals = false,
  onClose,
  onAcomodado,
}: {
  alcance: AlcanceAcomodoCliente;
  /** «Guía 010-001-0000005» o «Todas las guías de varias especies». */
  descripcion: string;
  /** Se abre desde otro modal (la ficha de la guía): tiene que quedar encima. */
  aboveModals?: boolean;
  onClose: () => void;
  /** Después de mover: para que quien la abrió relea sus trozas. */
  onAcomodado?: (r: ResultadoAcomodo) => void;
}) {
  const { plan, cargando, aplicando, error, resultado, aplicar } = useAcomodarTrozas(alcance);
  const t = plan?.totales;
  const unaGuia = "woodEntryId" in alcance;
  /* En tanda se listan sólo las guías con algo que decir: las que ya estaban
     en orden no aportan nada y alargan el scroll. */
  const guias = (plan?.guias ?? []).filter(
    (g) => resultado || unaGuia || g.mover.length > 0 || g.quietas.length > 0 || g.sinFila.length > 0,
  );

  const confirmar = async () => {
    const r = await aplicar();
    if (r) onAcomodado?.(r);
  };

  return (
    <AdminModal
      open
      onClose={aplicando ? () => {} : onClose}
      variant="wide"
      icon={ArrowLeftRight}
      title="Acomodar trozas en su especie"
      description={descripcion}
      aboveModals={aboveModals}
      footer={
        <ModalFooter
          error={error}
          nota={
            t && !resultado ? (
              <span className="font-mono tabular-nums">
                {t.guias} guía{t.guias === 1 ? "" : "s"} · {nTrozas(t.trozas)}
              </span>
            ) : undefined
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={aplicando}>
            {resultado ? "Cerrar" : "Cancelar"}
          </Btn>
          {!resultado && (
            <Btn variant="primary" onClick={() => void confirmar()} disabled={cargando || aplicando || !t || t.mover === 0}>
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
              {t && t.mover > 0 ? `Acomodar ${nTrozas(t.mover)}` : "Acomodar"}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {cargando && (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Revisando las trozas de cada fila…
          </p>
        )}

        {t && !cargando && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            {resultado ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
                <span>
                  Listo: <b className="text-[var(--text-primary)]">{nTrozas(resultado.movidas)}</b> en su fila (
                  <span className="font-mono tabular-nums">{fmtM3(resultado.m3Movidos)} m³</span>).{" "}
                  <b className="text-[var(--text-primary)]">
                    {t.filasQueCuadranAntes} de {t.filas}
                  </b>{" "}
                  filas tienen las trozas que declaran.
                  {resultado.yaNoSePudieron > 0 && ` ${nTrozas(resultado.yaNoSePudieron)} ya no se pudieron mover (cambiaron mientras mirabas).`}
                </span>
              </span>
            ) : t.mover > 0 ? (
              <span>
                Pasan a su fila <b className="text-[var(--text-primary)]">{nTrozas(t.mover)}</b> (
                <span className="font-mono tabular-nums">{fmtM3(t.m3Mover)} m³</span>) de {t.guiasConCambios} guía
                {t.guiasConCambios === 1 ? "" : "s"}. Filas que cuadran: <b className="text-[var(--text-primary)]">{t.filasQueCuadranAntes}</b>{" "}
                → <b className="text-[var(--text-primary)]">{t.filasQueCuadranDespues}</b> de {t.filas}.
              </span>
            ) : (
              <span>
                {t.guias === 0
                  ? "No hay guías de varias especies: nada que acomodar."
                  : "Cada troza ya está en la fila de su especie."}
              </span>
            )}
            <InfoTip
              icono="ayuda"
              title="Qué hace «Acomodar»"
              what="Una guía con varias especies tiene una fila por especie. Cada troza pasa a la fila de SU especie dentro de la misma guía, para que el consumo y el descuento del permiso le sumen a la especie correcta."
              affects="No cambia lo declarado (m³ ni piezas de cada fila) ni lo que ya se consumió. No mueve trozas que ya entraron a una corrida o salieron despachadas, ni filas de un mes cerrado o con el costo congelado: esas se listan con su motivo."
              example="Guía 0000005: sus 7 trozas estaban en la fila de Copal. Después, Cachimbo tiene sus 5, Shimbillo la suya y Copal la suya."
            />
          </div>
        )}

        {guias.map((g) => (
          <CtpAcomodarTrozasGuia key={g.guia} guia={g} soloAhora={resultado != null} abierta={unaGuia} />
        ))}
      </ModalBody>
    </AdminModal>
  );
}
