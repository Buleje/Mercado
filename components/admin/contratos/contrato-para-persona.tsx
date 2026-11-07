"use client";

/**
 * «Hacer contrato» desde Equipo › Personal (19-10, «juntar pestañas gemelas»).
 *
 * La pestaña Equipo › Contratos se fue; crear sigue en UN solo lugar, este
 * módulo, que no se parte. Personal abre `?colaborador=<id>` en Plantillas:
 * este hook lee a la persona (`/api/rrhh/colaboradores/<id>`, la misma ficha
 * de RRHH), saca el parámetro de la URL para que recargar no lo repita, y
 * devuelve sus datos con las claves de las plantillas de trabajo y locación.
 * Al guardar, el contrato queda ligado a ella (`colaboradorId`).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { User, X } from "@buleje/design-system/icons";
import type { ContractTemplate } from "@/lib/contratos/plantillas";

export interface PersonaDelContrato {
  id: string;
  nombre: string;
  /** `null` si no hay o si llegó enmascarado (nivel sin permiso de ver documentos). */
  documento: string | null;
  direccion: string | null;
  puesto: string | null;
}

interface FichaApi {
  colaborador?: { id: string; nombre: string; documento: string | null; direccion: string | null; puesto?: { nombre: string } | null };
}

/** Las claves de las plantillas que reciben a la persona (trabajador o locador). */
function valorPara(clave: string, p: PersonaDelContrato): string | null {
  if (clave === "NOMBRE_TRABAJADOR" || clave === "NOMBRE_LOCADOR") return p.nombre;
  if (clave === "DNI_TRABAJADOR" || clave === "DNI_LOCADOR") return p.documento;
  if (clave === "DOMICILIO_TRABAJADOR" || clave === "DOMICILIO_LOCADOR") return p.direccion;
  if (clave === "CARGO") return p.puesto;
  return null;
}

export function useContratoParaPersona() {
  const params = useSearchParams();
  const id = params?.get("colaborador") ?? null;
  const [persona, setPersona] = useState<PersonaDelContrato | null>(null);

  useEffect(() => {
    if (!id) return;
    // El parámetro ya cumplió: fuera de la URL (recargar no vuelve a precargar).
    const url = new URL(window.location.href);
    url.searchParams.delete("colaborador");
    window.history.replaceState(window.history.state, "", url.toString());
    let vigente = true;
    fetch(`/api/rrhh/colaboradores/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`colaborador ${r.status}`);
        return r.json() as Promise<FichaApi>;
      })
      .then((d) => {
        const c = d.colaborador;
        if (!vigente || !c) return;
        setPersona({
          id: c.id,
          nombre: c.nombre,
          documento: c.documento && !c.documento.includes("•") ? c.documento : null,
          direccion: c.direccion,
          puesto: c.puesto?.nombre ?? null,
        });
      })
      .catch(() => {
        // Sin permiso o borrada: el creador sigue igual, sin precargar a nadie.
        if (vigente) setPersona(null);
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  const camposDe = useCallback(
    (tpl: ContractTemplate): Record<string, string> => {
      const datos: Record<string, string> = {};
      if (!persona) return datos;
      for (const f of tpl.fields) {
        const v = valorPara(f.key, persona);
        if (v) datos[f.key] = v;
      }
      return datos;
    },
    [persona],
  );

  return { persona, camposDe, quitar: useCallback(() => setPersona(null), []) };
}

/** La línea que dice para quién es el contrato que se está por hacer. */
export function AvisoContratoParaPersona({ persona, onQuitar }: { persona: PersonaDelContrato; onQuitar: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2 text-sm text-[var(--text-primary)]">
      <User className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      <span className="min-w-0 flex-[1_1_14rem]">
        Contrato para <strong>{persona.nombre}</strong>: elige la plantilla y sus datos se llenan solos.
      </span>
      <button type="button" onClick={onQuitar} className="ml-auto inline-flex min-h-12 items-center gap-1 rounded-xl px-3 font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]">
        <X className="h-4 w-4" aria-hidden /> Quitar
      </button>
    </div>
  );
}
