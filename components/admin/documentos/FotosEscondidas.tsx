"use client";

/**
 * «Escondidas 360 fotos de las cámaras · Ver fotos · Se guardan 30 días».
 *
 * El detector de personas y la asistencia suben fotos al Archivo todo el día
 * (en Blas, 360 de 375 documentos). Las vistas generales las dejan fuera para
 * que se vean los papeles; esta línea dice cuántas hay escondidas y deja verlas.
 * Una línea y un ⓘ, no un cartel: es información, no una alarma.
 *
 * - «Ver fotos» abre sólo las fotos del detector (o las de asistencia, si no hay
 *   otras) en una lista, con su «Quitar» para volver a los papeles.
 * - «Se guardan N días» lleva al ajuste de Cámaras donde se elige ese plazo.
 * - Sin fotos escondidas no se dibuja nada.
 */

import { EyeOff } from "@buleje/design-system/icons";
import { RUTA_VISTA_CAMARAS } from "@/components/admin/forestal/camaras/otra-pantalla-ui";
import { useRetencionPersonas } from "@/components/admin/forestal/camaras/use-retencion-personas";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TAG_FOTO_PERSONA } from "@/lib/camaras/personas-retencion";
import { etiquetaParaVerFotos, type ConteoFotosDeMaquina } from "@/lib/documents/fotos-de-maquina";

interface Props {
  conteo: ConteoFotosDeMaquina | null;
  /** Abre la lista de fotos con esa etiqueta (`label` es lo que dice el aviso de arriba). */
  onVerFotos: (etiqueta: { tag: string; label: string }) => void;
}

const ENLACE =
  "inline-flex min-h-12 items-center font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]";

const fotos = (n: number) => (n === 1 ? "1 foto" : `${n} fotos`);

export default function FotosEscondidas({ conteo, onVerFotos }: Props) {
  const hayPersonas = (conteo?.porTag[TAG_FOTO_PERSONA] ?? 0) > 0;
  // Los días se piden sólo si hay fotos de PERSONAS escondidas: es lo único que los muestra.
  const { retencion } = useRetencionPersonas(hayPersonas);
  if (!conteo || conteo.total <= 0) return null;

  const etiqueta = etiquetaParaVerFotos(conteo.porTag);

  return (
    <div
      data-testid="fotos-escondidas"
      className="flex flex-wrap items-center gap-x-3 gap-y-0 text-sm text-[var(--text-secondary)]"
    >
      <span className="inline-flex min-h-12 items-center gap-2">
        <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
        Escondidas {fotos(conteo.total)} de las cámaras
        <InfoTip
          title="Fotos de las cámaras"
          what={<span>Son las fotos que sacan solas las cámaras y la asistencia. No son papeles tuyos, por eso no salen mezcladas con ellos.</span>}
          affects={<span>Con «Ver fotos» las ves aparte, y con «Quitar» vuelves a tus papeles.</span>}
        />
      </span>

      {etiqueta && (
        <button type="button" onClick={() => onVerFotos(etiqueta)} className={ENLACE}>
          Ver fotos
        </button>
      )}

      {hayPersonas && retencion && (
        <button
          type="button"
          onClick={() => irAEnlace(RUTA_VISTA_CAMARAS)}
          className={ENLACE}
          title="Cambiar cuántos días se guardan"
        >
          Se guardan {retencion.dias === 1 ? "1 día" : `${retencion.dias} días`}
        </button>
      )}
    </div>
  );
}
