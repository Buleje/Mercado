"use client";

/**
 * A qué permiso pertenece lo que trae un archivo del libro (Brandon 19-10,
 * ADR-503): se elige de los que ya tienes —«código · titular · RUC»— o se crea
 * ahí mismo, y todas las filas del archivo quedan clasificadas con él.
 *
 * El servidor sólo LLENA lo vacío: una fila que ya trae otro permiso conserva
 * el suyo y el reporte lo cuenta aparte. Por eso es seguro elegirlo aunque el
 * Excel traiga la columna Contrato a medias.
 *
 * Asignar declara el título de una guía: sólo el dueño o un admin (el servidor
 * lo exige igual). Para los demás roles se ve deshabilitado, con el motivo.
 */

import { useId, useState } from "react";
import { ChevronDown, Copy, Lock, ScrollText, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import BuscarPermiso, { rotuloDelPermiso } from "./BuscarPermiso";
import NuevoPermisoRapido, { CAMPO, revisarDocumento } from "./NuevoPermisoRapido";

export type CatalogoDePermisos = ReturnType<typeof usePermisosForestal>;

export default function AsignarPermisoDeArchivo({
  catalogo,
  valor,
  onCambiar,
  puede,
  etiqueta,
  deshabilitado,
  enTodos,
}: {
  catalogo: CatalogoDePermisos;
  valor: string | null;
  onCambiar: (contratoId: string | null) => void;
  /** `null` = todavía no se sabe el rol. */
  puede: boolean | null;
  /** «Permiso de «rolliza-a.xlsx»», para el lector de pantalla. */
  etiqueta: string;
  deshabilitado?: boolean;
  /** El atajo para los demás archivos de la sección que tienen otro permiso. */
  enTodos?: { cuantos: number; onUsar: () => void } | null;
}) {
  const [cambiando, setCambiando] = useState(false);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  /* 403 al listar = el negocio no tiene CTP: no hay permisos que elegir. */
  if (!catalogo.disponible) return null;

  if (puede === false) {
    return (
      <p className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-tertiary)]">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Solo el dueño o un admin asigna el permiso
        <InfoTip
          icono="ayuda"
          title="Permiso del archivo"
          what="Sin permiso elegido, cada fila entra con el contrato que traiga el Excel, como siempre."
        />
      </p>
    );
  }

  const elegido = valor ? catalogo.contratos.find((c) => c.id === valor) ?? null : null;

  if (elegido && !cambiando) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => setCambiando(true)}
            aria-label={`${etiqueta}: ${rotuloDelPermiso(elegido)}. Cambiar`}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-left transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
          >
            <ScrollText className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">
              <strong className="text-[var(--text-primary)]">{elegido.codigo}</strong>
              <span className="text-[var(--text-secondary)]">
                {" · "}
                {elegido.titularNombre}
                {elegido.titularDoc ? ` · ${elegido.titularDocTipo ?? "RUC"} ${elegido.titularDoc}` : ""}
                {elegido.resolucionNumero ? ` · ${elegido.resolucionNumero}` : ""}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          </button>
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => {
              onCambiar(null);
              setNota(null);
            }}
            aria-label={`Quitar el permiso de ${etiqueta}`}
            className={button({ variant: "ghost", size: "icon" })}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!elegido.titularDoc && <RucDelTitular catalogo={catalogo} contratoId={elegido.id} />}
        {nota && <p className="text-sm text-[var(--text-secondary)]">{nota}</p>}
        {enTodos && enTodos.cuantos > 0 && (
          <button
            type="button"
            disabled={deshabilitado}
            onClick={enTodos.onUsar}
            /* A 400 px el rótulo no entra en una línea: se parte en vez de salirse de la caja. */
            className={button({ variant: "ghost", className: "h-auto min-h-12 w-full justify-start whitespace-normal py-2 text-left sm:w-auto" })}
          >
            <Copy className="h-5 w-5" aria-hidden />
            Usar este permiso en {enTodos.cuantos === 1 ? "el otro archivo" : `los otros ${enTodos.cuantos} archivos`} de esta sección
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <BuscarPermiso
        contratos={catalogo.contratos}
        cargando={catalogo.cargando}
        elegido={valor}
        etiqueta={etiqueta}
        deshabilitado={deshabilitado || puede === null}
        autoFoco={cambiando}
        onElegir={(c) => {
          onCambiar(c.id);
          setCambiando(false);
          setNuevo(null);
          setNota(null);
        }}
        onNuevo={(codigo) => setNuevo(codigo)}
        onSalir={() => {
          if (nuevo === null) setCambiando(false);
        }}
      />
      {catalogo.error && <p className="mt-1 text-sm font-semibold text-[var(--data-error)]">{catalogo.error}</p>}
      {nuevo !== null && (
        <NuevoPermisoRapido
          crear={catalogo.crear}
          codigoInicial={nuevo}
          onCancelar={() => {
            setNuevo(null);
            setCambiando(false);
          }}
          onCreado={(c, yaExistia) => {
            onCambiar(c.id);
            setNuevo(null);
            setCambiando(false);
            setNota(yaExistia ? `El ${c.codigo} ya estaba en tu lista: uso ese.` : null);
          }}
        />
      )}
    </div>
  );
}

/** El permiso elegido no tiene RUC: se completa acá y queda en su ficha. */
function RucDelTitular({ catalogo, contratoId }: { catalogo: CatalogoDePermisos; contratoId: string }) {
  const idEtiqueta = useId();
  const [doc, setDoc] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisado = revisarDocumento(doc);

  const guardar = async () => {
    const d = doc.replace(/\s+/g, "");
    if (!d) return setError("Pon el RUC del titular.");
    if (revisado.error) return setError(revisado.error);
    setGuardando(true);
    setError(null);
    const r = await catalogo.actualizar(contratoId, { titularDoc: d, titularDocTipo: revisado.tipo });
    setGuardando(false);
    if (r.error) setError(r.error);
  };

  return (
    <div>
      <div className="flex items-end gap-2">
        {/* Sin <label>: un ⓘ dentro de la etiqueta abre el campo en vez del tip (infotip-no-anidado). */}
        <div className="block min-w-0 flex-1">
          <span id={idEtiqueta} className="mb-1 flex items-center gap-1 text-sm font-semibold text-[var(--data-warning)]">
            Este permiso no tiene RUC
            <InfoTip icono="ayuda" title="RUC del titular" what="Queda guardado en la ficha del permiso y sale en sus guías y reportes." />
          </span>
          <input
            aria-labelledby={idEtiqueta}
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            inputMode="numeric"
            maxLength={11}
            aria-invalid={!!revisado.error}
            placeholder="RUC del titular"
            className={CAMPO}
          />
        </div>
        <button type="button" onClick={() => void guardar()} disabled={guardando} className={button({ variant: "secondary" })}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
      {(error || revisado.error) && <p className="mt-1 text-sm font-semibold text-[var(--data-error)]">{error ?? revisado.error}</p>}
    </div>
  );
}
