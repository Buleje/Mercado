"use client";

/**
 * El permiso del lote, en su detalle (Brandon 27-10: «una opción para poner a
 * qué permiso pertenece, escoger según los permisos que tengo, o crear uno
 * nuevo según el formulario de permisos»). Reúsa el buscador y el alta rápida
 * de «Importar el libro»: el mismo papel no se carga dos veces (409 → se usa
 * el que ya estaba). Guarda por `contratoId`: el código y el enlace van juntos
 * (ADR-421/431). Si las trozas del lote son de otro permiso, el servidor lo
 * rechaza con el porqué (ADR-393) y se muestra acá.
 */

import { useState } from "react";
import { ScrollText, Loader2 } from "@buleje/design-system/icons";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import BuscarPermiso, { rotuloDelPermiso } from "./serfor-import/BuscarPermiso";
import NuevoPermisoRapido from "./serfor-import/NuevoPermisoRapido";
import { Btn } from "./ctp-shared";
import type { CambiosLote } from "./hooks/use-lotes-aserrio-tipos";

export default function CtpLotePermisoCampo({
  lote,
  onEditar,
}: {
  lote: Pick<LoteAserrio, "code" | "permiso" | "piezas">;
  onEditar: (cambios: CambiosLote) => Promise<void>;
}) {
  const [cambiando, setCambiando] = useState(false);
  /* Se carga al abrir el detalle: el rótulo dice de quién es el permiso, no sólo su código. */
  const catalogo = usePermisosForestal();
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actual = lote.permiso ? (catalogo.contratos.find((c) => c.codigo === lote.permiso) ?? null) : null;

  async function guardar(contratoId: string | null) {
    setGuardando(true);
    setError(null);
    try {
      await onEditar({ contratoId });
      setCambiando(false);
      setNuevo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-[var(--rule-base)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <ScrollText className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Permiso</span>
        <span className="min-w-0 flex-1 text-sm font-bold text-[var(--text-primary)]">
          {actual ? rotuloDelPermiso(actual) : (lote.permiso ?? "Sin permiso")}
        </span>
        {guardando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-label="Guardando" />}
        {!cambiando && (
          <Btn size="sm" variant="secondary" onClick={() => setCambiando(true)} disabled={guardando}>
            {lote.permiso ? "Cambiar" : "Elegir permiso"}
          </Btn>
        )}
        {cambiando && lote.permiso && lote.piezas === 0 && (
          <Btn size="sm" variant="ghost" onClick={() => void guardar(null)} disabled={guardando}>
            Quitar permiso
          </Btn>
        )}
        {cambiando && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              setCambiando(false);
              setNuevo(null);
              setError(null);
            }}
            disabled={guardando}
          >
            Cancelar
          </Btn>
        )}
      </div>
      {cambiando && (
        <div className="mt-2">
          <BuscarPermiso
            contratos={catalogo.contratos}
            cargando={catalogo.cargando}
            elegido={actual?.id ?? null}
            etiqueta={`Permiso del lote ${lote.code}`}
            deshabilitado={guardando}
            autoFoco
            onElegir={(c) => void guardar(c.id)}
            onNuevo={(codigo) => setNuevo(codigo)}
          />
          {catalogo.error && <p className="mt-1 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{catalogo.error}</p>}
          {nuevo !== null && (
            <NuevoPermisoRapido
              crear={catalogo.crear}
              codigoInicial={nuevo}
              onCreado={(c) => void guardar(c.id)}
              onCancelar={() => setNuevo(null)}
            />
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </div>
  );
}
