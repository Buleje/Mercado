"use client";

/**
 * El botón del aviso «plan sin permiso» de Extracción (ADR-455).
 *
 *   · Con un permiso del MISMO código (`permisoSugerido`, la regla de
 *     `permisoGemeloDelPlan`): «Unir», un clic.
 *   · Sin gemelo: «Elegir su permiso» abre la lista de permisos del negocio. Un
 *     permiso que ya es de OTRO plan no se ofrece: unirlo acá le quitaría su
 *     plan a aquel.
 *
 * Las escrituras son las de «Unirlos» en Plan de Manejo (`loth-plan-unir`). Al
 * terminar, el evento de ventana hace que la vista vuelva a leer y el aviso se
 * va solo; el toast dice con qué permiso quedó.
 *
 * Sólo lo ven los roles que las rutas dejan escribir (el almacenero ve la
 * Extracción pero no puede unir).
 */

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Link2 } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import type { Contrato } from "@/lib/forestal/contratos";
import { Btn } from "./ctp-shared";
import { puedeUnirPlanPermiso, unirPlanConPermiso } from "./loth-plan-unir";

export interface PermisoSugerido {
  contratoId: string;
  codigo: string;
}

/** Los permisos que se pueden elegir para ESTE plan: libres o ya suyos, por código. */
export function permisosElegibles(contratos: readonly Contrato[], planId: string): Contrato[] {
  return contratos
    .filter((c) => !c.planId || c.planId === planId)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es"));
}

export default function LothExtraccionUnir({ planId, sugerido }: { planId: string; sugerido: PermisoSugerido | null }) {
  const rol = useMiRol();
  const idLista = useId();
  const [eligiendo, setEligiendo] = useState(false);
  const [elegido, setElegido] = useState("");
  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La lista sólo se pide al abrir «Elegir su permiso»; para «Unir» basta `actualizar`.
  const permisos = usePermisosForestal({ activo: eligiendo });
  /* El botón que abre se va y el que cierra también: el foco pasa a la lista al
     abrir y vuelve al botón al cancelar (si no, cae al <body>). */
  const enfocarLista = useRef(false);
  const abierto = useRef(false);
  useEffect(() => {
    // `Btn` no reenvía `ref`: se busca por id.
    if (!eligiendo && abierto.current) document.getElementById(`${idLista}-abrir`)?.focus();
    abierto.current = eligiendo;
  }, [eligiendo, idLista]);

  if (!puedeUnirPlanPermiso(rol)) return null;

  async function unir(contratoId: string, codigo: string) {
    setUniendo(true);
    setError(null);
    try {
      const { pendiente } = await unirPlanConPermiso(planId, contratoId, permisos.actualizar);
      toast.success(`Plan unido al permiso ${codigo}.`);
      if (pendiente) toast.warning(`El plan quedó unido, pero el permiso no guardó su plan: ${pendiente}`);
      setEligiendo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUniendo(false);
    }
  }

  if (sugerido) {
    return (
      <>
        <Btn
          size="sm"
          variant="primary"
          className="shrink-0"
          onClick={() => void unir(sugerido.contratoId, sugerido.codigo)}
          disabled={uniendo}
          aria-busy={uniendo}
          title={`Unir este plan con el permiso ${sugerido.codigo}`}
        >
          <Link2 className="h-4 w-4" aria-hidden /> {uniendo ? "Uniendo…" : "Unir"}
        </Btn>
        {error && (
          <p role="alert" className="order-last basis-full text-sm font-semibold text-[var(--data-error-ink)]">
            {error}
          </p>
        )}
      </>
    );
  }

  const lista = permisosElegibles(permisos.contratos, planId);
  const elegidoOk = lista.find((c) => c.id === elegido) ?? null;
  return (
    <>
      {!eligiendo && (
        <Btn
          id={`${idLista}-abrir`}
          size="sm"
          className="shrink-0"
          onClick={() => {
            enfocarLista.current = true;
            setEligiendo(true);
          }}
        >
          {/* «su»: la banda del libro ya tiene un «Elegir permiso» (el permiso de trabajo) y
              el QA en el navegador clicó ése — medido 29-09. */}
          <Link2 className="h-4 w-4" aria-hidden /> Elegir su permiso
        </Btn>
      )}
      {eligiendo && (
        <div id={idLista} className="order-last flex basis-full flex-wrap items-center gap-2 pt-1">
          {!permisos.disponible ? (
            <p className="text-sm text-[var(--text-secondary)]">Los permisos no están habilitados en este negocio.</p>
          ) : permisos.cargando && permisos.contratos.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Cargando los permisos…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No hay un permiso libre: créalo en el Directorio o suelta el de otro plan.
            </p>
          ) : (
            <>
              <label className="sr-only" htmlFor={`${idLista}-sel`}>
                Permiso para unir con este plan
              </label>
              <select
                ref={(el) => {
                  if (el && enfocarLista.current) {
                    enfocarLista.current = false;
                    el.focus();
                  }
                }}
                id={`${idLista}-sel`}
                value={elegido}
                onChange={(ev) => setElegido(ev.target.value)}
                className="h-9 min-w-0 max-w-full flex-1 basis-56 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              >
                <option value="">Elige un permiso…</option>
                {lista.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo}
                    {c.titularNombre ? ` · ${c.titularNombre}` : ""}
                    {c.estado !== "vigente" ? ` (${c.estado})` : ""}
                  </option>
                ))}
              </select>
              <Btn
                size="sm"
                variant="primary"
                onClick={() => elegidoOk && void unir(elegidoOk.id, elegidoOk.codigo)}
                disabled={!elegidoOk || uniendo}
                aria-busy={uniendo}
              >
                {uniendo ? "Uniendo…" : "Unir"}
              </Btn>
            </>
          )}
          <Btn size="sm" variant="ghost" onClick={() => setEligiendo(false)} disabled={uniendo}>
            Cancelar
          </Btn>
          {(error || permisos.error) && (
            <p role="alert" className="basis-full text-sm font-semibold text-[var(--data-error-ink)]">
              {error ?? permisos.error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
