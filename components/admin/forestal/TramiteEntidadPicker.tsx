"use client";

/**
 * TramiteEntidadPicker — traer un emisor del Directorio forestal y, si no
 * existe todavía, crearlo sin salir del trámite (ADR-317; ampliado
 * 2026-08-25).
 *
 * Brandon pidió "un apartado donde trabaje con los datos de todas las
 * comunidades" — YA EXISTE: es el Directorio del Libro CTP (`ForestParty`,
 * `Gestión → Directorio`). Este picker CONSULTA esa libreta y copia sus
 * campos a los del trámite. Un titular es, en términos del Directorio, un
 * `proveedor`: "trae la madera al CTP" es exactamente eso.
 *
 * 2026-08-25, dos rondas de ampliación sobre la versión original —
 *   1. El picker entrega TODOS los campos de la parte (documento, DNI,
 *      dirección desglosada), no sólo nombre/RUC/representante:
 *      `CAMPO_A_EMISOR` en `TramiteCamposPanel` decide cuáles aplican según
 *      los campos que tenga ESTE formato (entidad, o firmante/membrete en
 *      "Quién firma").
 *   2. "+ Nuevo emisor" abre el MISMO modal completo que usa el Directorio
 *      (`CtpParteModal`: roles, lookup SUNAT/RENIEC, dirección, título
 *      habilitante/resolución/plan de manejo/ARFFS, **logo** y **adjuntos**)
 *      en vez de un formulario compacto aparte — Brandon: "que sea más
 *      completo, más campos y que sea un modal (ahí también guardaré logo y
 *      demás cosas)". Un solo editor de partes en toda la app, no dos.
 */

import { useState } from "react";
import { ChevronDown, Plus, Search, Users } from "@buleje/design-system/icons";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { claveBusqueda, direccionCompleta, type DocTipo, type Parte } from "@/lib/forestal/directorio";
import { Btn } from "./ctp-shared";
import CtpParteModal from "./CtpParteModal";

export interface EntidadElegida {
  nombre: string;
  docTipo: DocTipo | null;
  docNumero: string;
  representante: string;
  direccion: string;
  region: string;
  provincia: string;
  distrito: string;
  telefono: string;
  email: string;
}

const inputCls =
  "h-9 w-full rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function TramiteEntidadPicker({ onElegir }: { onElegir: (e: EntidadElegida) => void }) {
  const { partes, cargando, error, guardarParte } = useDirectorioForestal();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [creando, setCreando] = useState(false);

  const comunidades = partes.filter((p) => p.roles.includes("proveedor") && p.activo);
  const k = claveBusqueda(q);
  const visibles = !k
    ? comunidades
    : comunidades.filter((p) => claveBusqueda(p.nombre).includes(k) || (p.docNumero ?? "").toLowerCase().includes(k));

  function elegir(p: Parte) {
    onElegir({
      nombre: p.nombre,
      docTipo: p.docTipo,
      docNumero: p.docNumero ?? "",
      representante: p.representante ?? "",
      direccion: p.direccion ?? "",
      region: p.region ?? "",
      provincia: p.provincia ?? "",
      distrito: p.distrito ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
    });
    setAbierto(false);
    setQ("");
  }

  return (
    <div className="relative">
      <Btn size="sm" variant="secondary" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <Users className="h-4 w-4" />
        Usar un emisor guardado
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </Btn>

      {abierto && (
        <div className="absolute right-0 z-20 mt-1.5 w-80 max-w-[90vw] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              className={`${inputCls} pl-8`}
              placeholder="Buscar emisor o documento…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="mt-1.5 max-h-56 overflow-y-auto">
            {cargando ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">Cargando…</p>
            ) : error ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                El Directorio no está disponible: cargá los datos a mano.
              </p>
            ) : visibles.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">
                {comunidades.length === 0 ? "Todavía no hay emisores guardados." : "Ninguno coincide con la búsqueda."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {visibles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => elegir(p)}
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

          <button
            type="button"
            onClick={() => {
              setCreando(true);
              setAbierto(false);
            }}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo emisor
          </button>

          <p className="mt-1.5 border-t border-[var(--rule-soft)] px-1 pt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Gestioná todos los emisores en Libro CTP → Gestión → Directorio.
          </p>
        </div>
      )}

      {/* Mismo editor completo que usa el Directorio — roles, lookup SUNAT/
          RENIEC, título habilitante, LOGO y documentos adjuntos — para no
          tener dos formularios de "parte" en la app que puedan divergir. */}
      {creando && (
        <CtpParteModal
          parte={null}
          rolInicial="proveedor"
          onGuardar={async (input) => {
            const parte = await guardarParte(input);
            elegir(parte);
          }}
          onClose={() => setCreando(false)}
        />
      )}
    </div>
  );
}
