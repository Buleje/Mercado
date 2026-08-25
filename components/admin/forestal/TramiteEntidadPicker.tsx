"use client";

/**
 * TramiteEntidadPicker — traer un emisor del Directorio forestal y, si no
 * existe todavía, crearlo sin salir del trámite (ADR-364 ronda 2, sobre
 * ADR-317; ampliado 2026-08-25).
 *
 * Brandon pidió "un apartado donde trabaje con los datos de todas las
 * comunidades" — YA EXISTE: es el Directorio del Libro CTP (`ForestParty`,
 * `Gestión → Directorio`), que guarda razón social, documento (RUC/DNI/CE),
 * representante y dirección. No hace falta un módulo nuevo — este picker
 * CONSULTA esa libreta y copia sus campos a los del trámite. Un titular es,
 * en términos del Directorio, un `proveedor`: "trae la madera al CTP" es
 * exactamente eso.
 *
 * 2026-08-25: dos ampliaciones sobre la versión anterior —
 *   1. El picker ahora entrega TODOS los campos de la parte (documento, DNI,
 *      dirección desglosada), no sólo nombre/RUC/representante: `datos-de-
 *      emisor` en `TramiteCamposPanel` decide cuáles aplican según los campos
 *      que tenga ESTE formato (entidad, o firmante/membrete en "Quién firma").
 *   2. "+ Nuevo emisor" crea la parte sin salir del trámite, con el mismo
 *      autocompletado SUNAT/RENIEC por documento que ya usa el Directorio —
 *      Brandon: "que me permita escoger... y pueda crear ahí mismo".
 */

import { useState } from "react";
import { ChevronDown, Loader2, Plus, Search, Users } from "@buleje/design-system/icons";
import { useDirectorioForestal, consultarDocumento } from "@/hooks/use-directorio-forestal";
import { claveBusqueda, direccionCompleta, DOC_TIPOS, type DocTipo } from "@/lib/forestal/directorio";
import { Btn } from "./ctp-shared";

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
  const [nuevo, setNuevo] = useState({ nombre: "", docTipo: "RUC" as DocTipo, docNumero: "", representante: "", direccion: "", region: "", provincia: "", distrito: "" });
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avisoNuevo, setAvisoNuevo] = useState<string | null>(null);

  const comunidades = partes.filter((p) => p.roles.includes("proveedor") && p.activo);
  const k = claveBusqueda(q);
  const visibles = !k
    ? comunidades
    : comunidades.filter((p) => claveBusqueda(p.nombre).includes(k) || (p.docNumero ?? "").toLowerCase().includes(k));

  function elegir(p: (typeof partes)[number]) {
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

  async function buscarDocumento() {
    if (!nuevo.docNumero.trim()) return;
    setBuscando(true);
    setAvisoNuevo(null);
    try {
      const encontrado = await consultarDocumento(nuevo.docTipo, nuevo.docNumero);
      if (!encontrado) {
        setAvisoNuevo(`No se encontró ese ${nuevo.docTipo} — cargá los datos a mano.`);
        return;
      }
      setNuevo((p) => ({
        ...p,
        nombre: encontrado.nombre || p.nombre,
        direccion: encontrado.direccion ?? p.direccion,
        region: encontrado.region ?? p.region,
        provincia: encontrado.provincia ?? p.provincia,
        distrito: encontrado.distrito ?? p.distrito,
      }));
    } catch (err) {
      setAvisoNuevo(err instanceof Error ? err.message : String(err));
    } finally {
      setBuscando(false);
    }
  }

  async function guardarNuevo() {
    if (!nuevo.nombre.trim()) {
      setAvisoNuevo("Ponele un nombre o razón social.");
      return;
    }
    setGuardando(true);
    setAvisoNuevo(null);
    try {
      const parte = await guardarParte({
        roles: ["proveedor"],
        nombre: nuevo.nombre.trim(),
        docTipo: nuevo.docTipo,
        docNumero: nuevo.docNumero.trim() || undefined,
        representante: nuevo.representante.trim() || undefined,
        direccion: nuevo.direccion.trim() || undefined,
        region: nuevo.region.trim() || undefined,
        provincia: nuevo.provincia.trim() || undefined,
        distrito: nuevo.distrito.trim() || undefined,
      });
      elegir(parte);
      setCreando(false);
      setNuevo({ nombre: "", docTipo: "RUC", docNumero: "", representante: "", direccion: "", region: "", provincia: "", distrito: "" });
    } catch (err) {
      setAvisoNuevo(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
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
          {!creando ? (
            <>
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
                onClick={() => setCreando(true)}
                className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus className="h-3.5 w-3.5" /> Nuevo emisor
              </button>

              <p className="mt-1.5 border-t border-[var(--rule-soft)] px-1 pt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                Gestioná todos los emisores en Libro CTP → Gestión → Directorio.
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <p className="px-1 text-xs font-bold text-[var(--text-primary)]">Nuevo emisor</p>
              <div className="flex gap-1.5">
                <select
                  className={`${inputCls} w-24 shrink-0`}
                  value={nuevo.docTipo}
                  onChange={(e) => setNuevo((p) => ({ ...p, docTipo: e.target.value as DocTipo }))}
                >
                  {DOC_TIPOS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  className={inputCls}
                  placeholder="N° de documento"
                  value={nuevo.docNumero}
                  onChange={(e) => setNuevo((p) => ({ ...p, docNumero: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => void buscarDocumento()}
                  disabled={buscando || !nuevo.docNumero.trim()}
                  title="Buscar en SUNAT/RENIEC"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                >
                  {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </button>
              </div>
              <input
                className={inputCls}
                placeholder="Razón social o nombre *"
                value={nuevo.nombre}
                onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
              />
              <input
                className={inputCls}
                placeholder="Representante legal"
                value={nuevo.representante}
                onChange={(e) => setNuevo((p) => ({ ...p, representante: e.target.value }))}
              />
              <input
                className={inputCls}
                placeholder="Dirección"
                value={nuevo.direccion}
                onChange={(e) => setNuevo((p) => ({ ...p, direccion: e.target.value }))}
              />
              <div className="flex gap-1.5">
                <input
                  className={inputCls}
                  placeholder="Región"
                  value={nuevo.region}
                  onChange={(e) => setNuevo((p) => ({ ...p, region: e.target.value }))}
                />
                <input
                  className={inputCls}
                  placeholder="Provincia"
                  value={nuevo.provincia}
                  onChange={(e) => setNuevo((p) => ({ ...p, provincia: e.target.value }))}
                />
              </div>
              {avisoNuevo && <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{avisoNuevo}</p>}
              <div className="flex gap-1.5 pt-1">
                <Btn size="sm" variant="secondary" onClick={() => { setCreando(false); setAvisoNuevo(null); }}>
                  Cancelar
                </Btn>
                <Btn size="sm" variant="dark" disabled={guardando} onClick={() => void guardarNuevo()}>
                  {guardando ? "Guardando…" : "Guardar y usar"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
