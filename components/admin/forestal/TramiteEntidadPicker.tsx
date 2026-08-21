"use client";

/**
 * TramiteEntidadPicker — traer la comunidad/titular del Directorio forestal
 * (ADR-364 ronda 2, sobre ADR-317).
 *
 * Brandon pidió "un apartado donde trabaje con los datos de todas las
 * comunidades" — YA EXISTE: es el Directorio del Libro CTP (`ForestParty`,
 * `Gestión → Directorio`), que guarda razón social, documento, representante
 * Y adjuntos (los papeles de la comunidad, en el Drive). No hace falta un
 * módulo nuevo — este picker sólo CONSULTA esa libreta y copia sus tres campos
 * a los del trámite. Un titular es, en términos del Directorio, un
 * `proveedor`: "trae la madera al CTP" es exactamente eso.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Search, Users } from "@buleje/design-system/icons";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { claveBusqueda, direccionCompleta } from "@/lib/forestal/directorio";
import { Btn } from "./ctp-shared";

export interface EntidadElegida {
  nombre: string;
  ruc: string;
  representante: string;
}

export default function TramiteEntidadPicker({ onElegir }: { onElegir: (e: EntidadElegida) => void }) {
  const { partes, cargando, error } = useDirectorioForestal();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");

  const comunidades = useMemo(() => partes.filter((p) => p.roles.includes("proveedor") && p.activo), [partes]);
  const visibles = useMemo(() => {
    const k = claveBusqueda(q);
    if (!k) return comunidades;
    return comunidades.filter(
      (p) => claveBusqueda(p.nombre).includes(k) || (p.docNumero ?? "").toLowerCase().includes(k),
    );
  }, [comunidades, q]);

  return (
    <div className="relative">
      <Btn size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <Users className="h-4 w-4" />
        Traer del Directorio
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </Btn>

      {abierto && (
        <div className="absolute right-0 z-20 mt-1.5 w-80 max-w-[90vw] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className="h-9 w-full rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              placeholder="Buscar comunidad o RUC…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="mt-1.5 max-h-64 overflow-y-auto">
            {cargando ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">Cargando…</p>
            ) : error ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                El Directorio no está disponible: cargá los datos a mano.
              </p>
            ) : visibles.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">
                {comunidades.length === 0
                  ? "Todavía no hay comunidades cargadas en el Directorio."
                  : "Ninguna coincide con la búsqueda."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {visibles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onElegir({
                          nombre: p.nombre,
                          ruc: p.docTipo === "RUC" ? (p.docNumero ?? "") : "",
                          representante: p.representante ?? "",
                        });
                        setAbierto(false);
                        setQ("");
                      }}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="block font-bold text-[var(--text-primary)]">{p.nombre}</span>
                      <span className="block truncate text-[var(--text-tertiary)]">
                        {[p.docNumero, p.representante, direccionCompleta(p)].filter(Boolean).join(" · ") || "sin más datos"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-1.5 border-t border-[var(--rule-soft)] px-1 pt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Gestioná comunidades (datos y documentos) en Libro CTP → Gestión → Directorio.
          </p>
        </div>
      )}
    </div>
  );
}
