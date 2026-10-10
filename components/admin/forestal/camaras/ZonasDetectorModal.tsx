"use client";

/**
 * «Zonas que el detector ignora» de una cámara (Brandon 2026-10-08, modo
 * autónomo). Un objeto quieto que el detector confunde con una persona —el
 * poste de la entrada, una casaca colgada— sacaba una foto por minuto todo el
 * día y, si la luz lo hacía parpadear, un WhatsApp «Apareció alguien».
 *
 * Se abre desde el cuadro del mosaico (sobre el video en vivo, `aboveModals`
 * porque el mosaico ya es un diálogo) o desde «⋯» de la fila de la cámara
 * (sobre su última foto). Se guarda todo junto al tocar «Guardar»: el PUT
 * reemplaza la lista entera y el detector la toma en la próxima mirada.
 */

import { useCallback, useState } from "react";
import { EyeOff, Loader2, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  cajaIgnorada,
  MAX_ZONAS_IGNORAR,
  PARTE_DENTRO_PARA_IGNORAR,
  type ZonaIgnorada,
} from "@/lib/camaras/zonas-ignorar";
import { cn } from "@/lib/utils";
import { BTN } from "./camaras-ui";
import { useCajasDeImagen, useImagenZonas } from "./use-zonas-imagen";
import { guardarZonas, useZonasIgnorar } from "./zonas-detector";
import ZonasDibujo from "./ZonasDibujo";

interface Props {
  camaraId: string;
  nombre: string;
  /** El cuadro a marcar: base64/data URL del video o la URL de la última foto. */
  cargarImagen: () => Promise<string | null>;
  /** De dónde sale el cuadro: «Cuadro en vivo» · «Última foto · hace 3 h». */
  origen: string;
  /** Qué decir si no hay cuadro. */
  sinImagen: string;
  /** Con «Otro cuadro» (sólo tiene sentido con video en vivo). */
  renovable?: boolean;
  /** Encima de otro diálogo (el mosaico). */
  aboveModals?: boolean;
  onCerrar: () => void;
}

const BTN_PRINCIPAL =
  "inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50 max-sm:h-11";

const mismas = (a: readonly ZonaIgnorada[], b: readonly ZonaIgnorada[]) =>
  a.length === b.length && a.every((z, i) => z.x === b[i].x && z.y === b[i].y && z.w === b[i].w && z.h === b[i].h);

const pct = (n: number) => `${Math.round(n * 100)} %`;

export default function ZonasDetectorModal({
  camaraId,
  nombre,
  cargarImagen,
  origen,
  sinImagen,
  renovable = false,
  aboveModals = false,
  onCerrar,
}: Props) {
  const guardadas = useZonasIgnorar(camaraId);
  const [zonas, setZonas] = useState<ZonaIgnorada[]>(() => [...guardadas]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imagen = useImagenZonas(cargarImagen);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [cargada, setCargada] = useState<string | null>(null);
  const cajas = useCajasDeImagen(img, cargada);
  const onImagen = useCallback((el: HTMLImageElement | null) => setImg(el), []);

  const cambiado = !mismas(zonas, guardadas);
  const lleno = zonas.length >= MAX_ZONAS_IGNORAR;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const r = await guardarZonas(camaraId, zonas);
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(r.mensaje);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Zonas que el detector ignora"
      description={`${nombre}: marca lo que confunde con una persona`}
      icon={EyeOff}
      variant="wide"
      aboveModals={aboveModals}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {error && (
            <span role="alert" className="mr-auto text-sm font-semibold text-[var(--data-error-ink)]">
              {error}
            </span>
          )}
          <button type="button" onClick={onCerrar} className={cn(BTN, "h-10 max-sm:h-11")}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !cambiado}
            className={BTN_PRINCIPAL}
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar
          </button>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-3")} data-zonas-detector={camaraId}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto inline-flex min-w-0 items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            {lleno
              ? `Ya hay ${MAX_ZONAS_IGNORAR}: borra una para marcar otra.`
              : "Arrastra sobre el cuadro para marcar una zona."}
            <InfoTip
              title="Zonas que el detector ignora"
              what={`Hasta ${MAX_ZONAS_IGNORAR} rectángulos donde el detector de personas no busca. Se arrastran con el mouse o con el dedo.`}
              affects={`Una «persona» con el ${pct(PARTE_DENTRO_PARA_IGNORAR)} o más de su caja dentro de las zonas no saca foto ni manda WhatsApp. Alguien que pasa por delante, más ancho que la zona, sí cuenta.`}
              example="El poste de la entrada sale como «1 persona» todo el día: dibuja un rectángulo un poco más grande que el poste."
            />
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{origen}</span>
          {renovable && (
            <button
              type="button"
              onClick={() => void imagen.recargar()}
              disabled={imagen.estado === "cargando"}
              className={cn(BTN, "max-sm:h-11")}
              title="Tomar otro cuadro del video"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Otro cuadro
            </button>
          )}
        </div>

        <ZonasDibujo
          src={imagen.src}
          estado={imagen.estado}
          sinImagen={sinImagen}
          zonas={zonas}
          onAgregar={(z) => setZonas((prev) => (prev.length >= MAX_ZONAS_IGNORAR ? prev : [...prev, z]))}
          onBorrar={(i) => setZonas((prev) => prev.filter((_, j) => j !== i))}
          cajas={cajas}
          onImagen={onImagen}
          onCargada={setCargada}
        />

        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Zonas marcadas">
          {zonas.map((z, i) => (
            <li
              key={`${i}-${z.x}-${z.y}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 py-0.5 pl-2 pr-0.5 text-sm text-[var(--text-primary)]"
            >
              <span className="font-bold text-[var(--data-warning-ink)]">Zona {i + 1}</span>
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {pct(z.w)} × {pct(z.h)}
              </span>
              <button
                type="button"
                onClick={() => setZonas((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Borrar la zona ${i + 1}`}
                className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-secondary)] hover:text-[var(--data-error-ink)] max-sm:h-10 max-sm:w-10"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
          {zonas.length === 0 && (
            <li className="text-sm text-[var(--text-tertiary)]">Sin zonas: el detector mira todo el cuadro.</li>
          )}
          {cajas !== null && (
            <li className="ml-auto text-xs text-[var(--text-tertiary)]" aria-live="polite">
              {resumenCajas(cajas, zonas)}
            </li>
          )}
        </ul>
      </div>
    </AdminModal>
  );
}

/** «En este cuadro: 2 personas, 1 ignorada». */
function resumenCajas(cajas: readonly ZonaIgnorada[], zonas: readonly ZonaIgnorada[]): string {
  if (cajas.length === 0) return "En este cuadro el detector no ve a nadie.";
  const ignoradas = cajas.filter((c) => cajaIgnorada({ x: c.x, y: c.y, ancho: c.w, alto: c.h }, 1, 1, zonas)).length;
  const n = cajas.length;
  return `En este cuadro: ${n} ${n === 1 ? "persona" : "personas"}${ignoradas ? `, ${ignoradas} ${ignoradas === 1 ? "ignorada" : "ignoradas"}` : ""}.`;
}
