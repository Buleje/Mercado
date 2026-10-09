"use client";

/**
 * Las dos piezas visibles de «Marcar con foto» (`use-fotos-asistencia`):
 *
 *  · `BarraFotoDeCamara` — arriba de la hoja del día, sólo hoy y con el mosaico
 *    de cámaras abierto: prender/apagar y de qué cámara sale la foto.
 *  · `FotoDeLaMarca` — en la fila de cada persona, la miniatura de la foto (la
 *    última del día) con su hora; abre la foto entera en otra pestaña.
 */

import { Camera } from "@buleje/design-system/icons";
import { InterruptorVivo } from "@/components/admin/forestal/camaras/InterruptorVivo";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { FotoAsistencia } from "@/lib/rrhh/asistencia-fotos";
import type { FotosAsistencia } from "./use-fotos-asistencia";

export function BarraFotoDeCamara({ f }: { f: FotosAsistencia }) {
  if (!f.disponible || !f.camara) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5"
      data-foto-de-camara
    >
      <InterruptorVivo activo={f.activo} onCambiar={f.setActivo} icono={Camera}>
        Foto de la cámara al marcar
      </InterruptorVivo>
      {f.camaras.length > 1 ? (
        <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="sr-only">Cámara de la foto</span>
          <select
            value={f.camara.id}
            onChange={(e) => f.setCamara(e.target.value)}
            disabled={!f.activo}
            className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            {f.camaras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{f.camara.nombre}</span>
      )}
      <InfoTip
        title="Foto de la cámara"
        what="Al marcar a alguien Presente, Tardanza o Medio día, se guarda el cuadro que muestra la cámara en ese momento."
        affects="Va al Drive (Cámaras › Asistencia › el día) y queda al lado de su marca. Cambiar la hora o la nota no saca otra."
        example="Juan llega 07:42: lo ves en el portón, tocas Presente y queda su foto de la entrada."
      />
    </div>
  );
}

export function FotoDeLaMarca({ fotos }: { fotos: readonly FotoAsistencia[] }) {
  const foto = fotos.at(-1);
  if (!foto) return null;
  const otras = fotos.length > 1 ? ` (y ${fotos.length - 1} más del día)` : "";
  return (
    <a
      href={foto.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Foto de ${foto.camara} a las ${foto.hora}${otras}`}
      aria-label={`Ver la foto de la cámara de las ${foto.hora}`}
      className="group relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-lg border border-[var(--rule-base)] pr-2 text-xs font-semibold tabular-nums text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      data-foto-marca
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- archivo del Drive servido por la API, sin optimizador */}
      <img src={foto.url} alt="" className="h-full w-12 object-cover" loading="lazy" />
      {foto.hora}
    </a>
  );
}
