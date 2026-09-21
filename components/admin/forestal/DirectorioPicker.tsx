"use client";

/**
 * Elegir a alguien del Directorio forestal, en cualquier formulario.
 *
 * La libreta de personas, comunidades y empresas **ya existe**: es
 * `ForestParty`, el Directorio del Libro CTP (`Gestión → Directorio`), con
 * roles, documento único, dirección desglosada, título habilitante, resolución,
 * ARFFS, representante legal y su DNI, logo y adjuntos. Diez pantallas del CTP
 * ya la consultan a través de `TramiteEntidadPicker`.
 *
 * Este picker existe porque aquél está acoplado a los trámites: entrega diez
 * campos elegidos (`EntidadElegida`) y deja fuera **tituloHabilitante,
 * resolucion, planManejo, arffs y representanteDni** — justamente los que el
 * Libro TH necesita para dar de alta un plan de manejo. Acá se entrega la
 * `Parte` **completa** y cada formulario toma lo que le sirve.
 *
 * Lo que NO se duplica: la libreta (`useDirectorioForestal`) y el editor
 * (`CtpParteModal`) son los mismos de siempre. Un solo editor de partes en toda
 * la app, como quedó dicho cuando se amplió el picker de trámites.
 *
 * Pendiente anotado: `TramiteEntidadPicker` podría pasar a ser un envoltorio de
 * éste. No se tocó ahora para no mover diez pantallas del CTP en el mismo paso.
 */

import { useState } from "react";
import { ChevronDown, Pencil, Plus, Search, Users } from "@buleje/design-system/icons";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import { claveBusqueda, direccionCompleta, type Parte, type RolParte } from "@/lib/forestal/directorio";
import CtpParteModal from "./CtpParteModal";

export default function DirectorioPicker({
  onElegir,
  rol = "proveedor",
  label = "Traer del Directorio",
  /** Texto de ayuda bajo el buscador, para explicar a quién se está buscando. */
  ayuda,
}: {
  onElegir: (p: Parte) => void;
  /** Qué papel se busca. También es el rol con el que se crea uno nuevo. */
  rol?: RolParte;
  label?: string;
  ayuda?: string;
}) {
  const { partes, vehiculos, cargando, error, guardarParte, marcarUso } = useDirectorioForestal();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"nuevo" | Parte | null>(null);

  const delRol = partes.filter((p) => p.roles.includes(rol) && p.activo);
  const k = claveBusqueda(q);
  const visibles = !k
    ? delRol
    : delRol.filter(
        (p) => claveBusqueda(p.nombre).includes(k) || (p.docNumero ?? "").toLowerCase().includes(k),
      );

  function elegir(p: Parte) {
    onElegir(p);
    /**
     * La libreta se ordena por lo que se usa («el destinatario de todos los
     * martes queda arriba sin que nadie lo configure»). Ese contador lo suben
     * las pantallas de guías del CTP, pero ningún picker lo hacía: elegir una
     * parte desde un formulario no contaba como uso, así que el orden sólo
     * aprendía de una parte del trabajo. Es conveniencia, no compliance: si
     * falla, la elección sigue igual.
     */
    marcarUso({ partes: [p.id] });
    setAbierto(false);
    setQ("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      >
        <Users className="h-4 w-4" />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="absolute right-0 z-20 mt-1.5 w-[22rem] max-w-[90vw] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o documento..."
              aria-label="Buscar en el Directorio"
              className="h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-600)]"
            />
          </div>
          {ayuda && <p className="mb-1.5 px-1 text-xs text-[var(--text-tertiary)]">{ayuda}</p>}

          <div className="max-h-64 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-lg border border-[var(--rule-soft)]">
            {cargando && <p className="px-3 py-4 text-sm text-[var(--text-tertiary)]">Cargando la libreta…</p>}
            {error && <p className="px-3 py-4 text-sm text-[var(--data-error-700)]">{error}</p>}
            {!cargando && !error && visibles.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                {delRol.length === 0 ? "El Directorio todavía no tiene a nadie con este papel." : "Sin resultados."}
              </p>
            )}
            {visibles.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => elegir(p)}
                  className="min-w-0 flex-1 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">
                    {[p.docNumero ? `${p.docTipo ?? "Doc"} ${p.docNumero}` : null, direccionCompleta(p)]
                      .filter(Boolean)
                      .join(" · ") || "Sin documento cargado"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setModal(p)}
                  aria-label={`Editar ${p.nombre} en el Directorio`}
                  title="Editar en el Directorio"
                  className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setModal("nuevo")}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--data-success-500)] hover:text-[var(--data-success-700)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar al Directorio
          </button>
        </div>
      )}

      {/* El MISMO editor del Directorio, no un formulario aparte */}
      {modal && (
        <CtpParteModal
          parte={modal === "nuevo" ? null : modal}
          rolInicial={rol}
          existentes={partes}
          vehiculos={vehiculos}
          onGuardar={async (datos) => {
            const guardada = await guardarParte(datos);
            setModal(null);
            // Al crear una parte nueva desde el formulario, se elige sola: el
            // paso siguiente siempre es usarla.
            if (guardada && modal === "nuevo") elegir(guardada);
          }}
          onUsarExistente={(existente) => {
            // El duplicado se resuelve en un clic: se cierra el alta y se sigue
            // con la ficha que ya estaba, que es lo que el aviso pedía hacer.
            setModal(null);
            elegir(existente);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
