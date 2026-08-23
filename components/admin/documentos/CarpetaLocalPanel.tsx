"use client";

/**
 * CarpetaLocalPanel — vincular una carpeta del escritorio, sin instalar nada.
 *
 * El sync de la PC ya existía (ADR-307) pero pedía instalar un agente con un
 * `.ps1` y pegar una clave: para el dueño de una bodega eso es una pared. Acá la
 * carpeta se elige con el selector del sistema y listo — el permiso lo da el
 * navegador y queda guardado.
 *
 * Lo que sí o sí se muestra ANTES de tocar un archivo: qué va a pasar. Vincular
 * una carpeta vacía con un drive lleno baja todo; al revés, sube todo. Las dos
 * son válidas y sólo el dueño sabe cuál quería.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle, Check, FolderOpen, HardDriveDownload, HardDriveUpload, Link2Off,
  Loader2, Lock, Pause, Play, RefreshCw, Trash2, TriangleAlert, Info,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { useCarpetaLocal } from "@/hooks/use-carpeta-local";
import { buildChildrenMap, flattenAll } from "@/lib/documentos/folder-tree";
import type { ResultadoCiclo } from "@/lib/documentos/carpeta-local/motor";

function hace(iso: string | null): string {
  if (!iso) return "nunca";
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return "recién";
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return `hace ${Math.round(seg / 86400)} días`;
}

/** Las cuatro cifras de un ciclo, dichas como las diría una persona. */
function Cifras({ r }: { r: ResultadoCiclo }) {
  const filas: { n: number; texto: string; icono: typeof HardDriveUpload }[] = [
    { n: r.resumen.subir, texto: "subidos al panel", icono: HardDriveUpload },
    { n: r.resumen.bajar, texto: "bajados a tu carpeta", icono: HardDriveDownload },
    { n: r.resumen.borrarRemoto, texto: "a la papelera del panel", icono: Trash2 },
    { n: r.resumen.borrarLocal, texto: "borrados de tu carpeta", icono: Trash2 },
  ].filter((f) => f.n > 0);

  if (filas.length === 0 && r.resumen.conflictos === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Todo estaba igual de los dos lados.</p>;
  }
  return (
    <ul className="space-y-1">
      {filas.map((f) => (
        <li key={f.texto} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <f.icono className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
          <strong className="font-bold tabular-nums text-[var(--text-primary)]">{f.n}</strong> {f.texto}
        </li>
      ))}
      {r.resumen.conflictos > 0 && (
        <li className="flex items-center gap-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning)]">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <strong className="font-bold tabular-nums">{r.resumen.conflictos}</strong> cambiados de los dos lados: se guardaron las dos versiones
        </li>
      )}
    </ul>
  );
}

export default function CarpetaLocalPanel({
  tenantId, documentos, carpetas, onCambios,
}: {
  tenantId: string;
  documentos: DbDocument[];
  carpetas: DbDocumentFolder[];
  onCambios: () => void;
}) {
  const c = useCarpetaLocal({ tenantId, documentos, carpetas, onCambios });
  const [destino, setDestino] = useState<string | null>(null);
  const filas = useMemo(() => flattenAll(buildChildrenMap(carpetas)), [carpetas]);
  const carpetaDestino = c.vinculo?.folderIdRaiz
    ? carpetas.find((f) => f.id === c.vinculo!.folderIdRaiz)
    : null;
  /**
   * La carpeta del panel con la que se emparejó puede haberse borrado. Si pasa,
   * el sync bajaría a la carpeta local un drive entero que no corresponde: se
   * avisa y se pide re-vincular en vez de seguir como si nada.
   */
  const destinoPerdido = !!c.vinculo?.folderIdRaiz && !carpetaDestino;
  const nombreDestino = c.vinculo?.folderIdRaiz
    ? carpetaDestino?.name ?? "una carpeta que ya no está"
    : "todo el drive";

  if (!c.soportado) {
    return (
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <span>
            Este navegador no deja elegir una carpeta de tu PC. Funciona en <strong>Chrome, Edge, Brave y Opera</strong>.
            Con Firefox o Safari, usá el agente de Windows de más abajo.
          </span>
        </p>
      </div>
    );
  }

  // ── Sin vincular ──
  if (!c.vinculo) {
    return (
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
          <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          Vincular una carpeta de tu PC
        </CardTitle>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Elegís una carpeta del escritorio y queda emparejada con el drive: lo que edites, agregues o borres de
          un lado pasa al otro. No hay que instalar nada — sincroniza mientras tengas el panel abierto.
        </p>

        <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Emparejar con
        </label>
        <select
          value={destino ?? ""}
          onChange={(e) => setDestino(e.target.value || null)}
          className="mt-1 h-12 w-full max-w-md rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)]"
        >
          <option value="">Todo el drive</option>
          {filas.map(({ folder, depth }) => (
            <option key={folder.id} value={folder.id}>{`${"└ ".repeat(depth)}${folder.name}`}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void c.vincular(destino)}
          className="mt-3 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-[filter] hover:brightness-110"
        >
          <FolderOpen className="h-4 w-4" /> Elegir la carpeta…
        </button>
        {c.error && <p className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{c.error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <FolderOpen className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="truncate">{c.vinculo.nombre}</span>
            {c.vinculo.pausado && (
              <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                en pausa
              </span>
            )}
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Emparejada con <strong className="font-bold text-[var(--text-secondary)]">{nombreDestino}</strong> ·
            última vez: {hace(c.vinculo.ultimaSync)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void c.sincronizar()}
            disabled={
              c.estado === "sincronizando" || c.estado === "planificando" || c.estado === "sin-permiso" || destinoPerdido
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", c.estado === "sincronizando" && "animate-spin")} />
            Sincronizar ahora
          </button>
          <button
            type="button"
            onClick={() => void c.alternarPausa()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            {c.vinculo.pausado ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {c.vinculo.pausado ? "Reanudar" : "Pausar"}
          </button>
          <button
            type="button"
            onClick={() => void c.desvincular()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <Link2Off className="h-3.5 w-3.5" /> Desvincular
          </button>
        </div>
      </div>

      {destinoPerdido && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            La carpeta del panel con la que estaba emparejada ya no existe. La sincronización queda detenida
            para no mezclar archivos: desvinculá y volvé a elegir con qué carpeta emparejarla.
          </p>
        </div>
      )}

      {c.estado === "sin-permiso" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 p-3">
          <Lock className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning)]" />
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            El navegador pide permiso de nuevo cada vez que volvés a abrir el panel. Es un click.
          </p>
          <button
            type="button"
            onClick={() => void c.darPermiso()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--data-warning-500)] px-3 text-xs font-bold text-white hover:brightness-110"
          >
            Dar permiso a la carpeta
          </button>
        </div>
      )}

      {c.paso && (
        <div className="mt-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <span className="tabular-nums">{c.paso.hechas + 1}/{c.paso.total}</span>
            <span className="truncate">{c.paso.ruta}</span>
          </p>
        </div>
      )}

      {/* Plan del primer ciclo: se muestra y se confirma antes de tocar nada. */}
      {c.plan && (
        <div className="mt-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-bold text-[var(--text-primary)]">Esto es lo que va a pasar:</p>
          <div className="mt-2"><Cifras r={c.plan} /></div>
          {c.plan.cortado && (
            <p className="mt-2 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning)]">
              La carpeta tiene demasiados archivos: se van a sincronizar los primeros 5.000.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void c.sincronizar()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
            >
              <Check className="h-4 w-4" /> Hacerlo
            </button>
            <button
              type="button"
              onClick={c.descartarPlan}
              className="inline-flex h-10 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Ahora no
            </button>
          </div>
        </div>
      )}

      {!c.plan && c.estado === "listo" && !c.vinculo.ultimaSync && (
        <button
          type="button"
          onClick={() => void c.planificar()}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border-2 border-primary px-4 text-sm font-bold text-primary hover:bg-primary/10"
        >
          Ver qué va a pasar antes de sincronizar
        </button>
      )}

      {c.ultimo && !c.plan && (
        <div className="mt-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {c.ultimo.resumen.total > 0 ? "Lo último que se movió" : "Última sincronización"}
          </p>
          <Cifras r={c.ultimo} />
          {c.ultimo.conflictos.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {c.ultimo.conflictos.slice(0, 5).map((x) => (
                <li key={x.ruta} className="truncate text-xs text-[var(--text-tertiary)]">
                  {x.ruta} → se guardó también <strong className="font-bold">{x.copia}</strong>
                </li>
              ))}
            </ul>
          )}
          {c.ultimo.rutasRepetidas.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {c.ultimo.rutasRepetidas.length} documento(s) del panel tienen un nombre que ya usa otro en la
              misma carpeta y no se bajaron: renombralos para que entren.
            </p>
          )}
          {c.ultimo.errores.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {c.ultimo.errores.slice(0, 5).map((e) => (
                <li key={e.ruta} className="truncate text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {e.ruta}: {e.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {c.error && (
        <p className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{c.error}</p>
      )}

      <p className="mt-3 text-xs text-[var(--text-tertiary)]">
        Mientras el panel esté abierto se revisa sola cada minuto. Si borrás un archivo en tu PC, el documento va
        a la papelera del panel (recuperable); si lo borrás en el panel, el archivo se borra de tu carpeta.
      </p>
    </div>
  );
}
