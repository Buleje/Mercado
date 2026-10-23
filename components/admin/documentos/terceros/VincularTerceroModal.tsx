"use client";

import { useEffect, useState } from "react";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CardTitle } from "@buleje/design-system";
import { Check, Link2Off, Loader2, Search, UserPlus } from "@buleje/design-system/icons";
import { useDebounce } from "@/hooks/use-debounce";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import {
  TIPOS_TERCERO, TIPO_TERCERO_LABEL, claveVinculo, idDeOtro, leerVinculo, nombrePorDefecto, vinculosDeCarpeta,
  type NombreTercero, type TipoTercero,
} from "@/lib/documentos/terceros-vinculo";
import { buscarCandidatos, pedirNombres, type Candidato } from "./use-terceros";
import { CAMPO_BUSCAR, ICONO_TERCERO } from "./compartido";

/**
 * «Vincular a un tercero…» (clic derecho o «⋯» de una carpeta). El vínculo es
 * una etiqueta de la carpeta (ADR-502, sin schema): `vincular`/`desvincular`
 * llaman a `bulkFolders` (addTags/removeTags), que ya valida rol y CSRF.
 */
export default function VincularTerceroModal({ carpeta, onClose, onCambiar }: {
  /** La carpeta como está AHORA (se relee de la lista tras cada cambio). */
  carpeta: DbDocumentFolder;
  onClose: () => void;
  onCambiar: (accion: "addTags" | "removeTags", clave: string) => Promise<unknown>;
}) {
  const [tipo, setTipo] = useState<TipoTercero>("persona");
  const [q, setQ] = useState("");
  const buscar = useDebounce(q, 250);
  const [res, setRes] = useState<{ clave: string; lista: Candidato[]; error: string | null } | null>(null);
  const [nombres, setNombres] = useState<Record<string, NombreTercero>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vinculos = vinculosDeCarpeta(carpeta);
  const yaVinculados = new Set(vinculos);

  // Los nombres de lo que ya está vinculado (la etiqueta guarda sólo el id).
  useEffect(() => {
    let vivo = true;
    pedirNombres()
      .then((r) => { if (vivo) setNombres(r.nombres ?? {}); })
      .catch((err: unknown) => logger.warn("[archivo.vincular] sin nombres", { error: String(err) }));
    return () => { vivo = false; };
  }, []);

  const pedido = `${tipo}|${buscar.trim()}`;
  useEffect(() => {
    if (tipo === "otro") return;
    let vivo = true;
    buscarCandidatos(tipo, buscar.trim())
      .then((lista) => { if (vivo) setRes({ clave: pedido, lista, error: null }); })
      .catch((err: unknown) => {
        if (vivo) setRes({ clave: pedido, lista: [], error: err instanceof Error ? err.message : "No se pudo buscar." });
      });
    return () => { vivo = false; };
  }, [tipo, buscar, pedido]);
  const buscando = tipo !== "otro" && res?.clave !== pedido;

  const cambiar = async (accion: "addTags" | "removeTags", clave: string, nombre?: NombreTercero) => {
    setOcupado(clave);
    setError(null);
    try {
      await onCambiar(accion, clave);
      if (nombre) setNombres((n) => ({ ...n, [clave]: nombre }));
      if (accion === "addTags" && tipo === "otro") setQ("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Prueba de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  const idOtro = tipo === "otro" ? idDeOtro(q) : "";
  return (
    <AdminModal
      open
      onClose={onClose}
      title={vinculos.length > 0 ? "Terceros vinculados" : "Vincular a un tercero"}
      description={carpeta.name}
      icon={UserPlus}
      size="md"
      claveVentana="vincular-tercero"
      footer={
        <ModalFooter error={error}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Listo</button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-5", MODAL_BODY)}>
        {vinculos.length > 0 && (
          <section className="space-y-2">
            <CardTitle>Vinculada a</CardTitle>
            <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
              {vinculos.map((clave) => {
                const v = leerVinculo(clave);
                if (!v) return null;
                const Icono = ICONO_TERCERO[v.tipo];
                return (
                  <li key={clave} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <Icono className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
                    <span className="min-w-0 flex-[1_1_10rem]">
                      <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                        {nombres[clave]?.nombre ?? nombrePorDefecto(v.tipo, v.id)}
                      </span>
                      <span className="block text-xs text-[var(--text-tertiary)]">{TIPO_TERCERO_LABEL[v.tipo].uno}</span>
                    </span>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() => void cambiar("removeTags", clave)}
                      className={cn(button({ variant: "secondary", size: "md" }), "ml-auto gap-2")}
                    >
                      {ocupado === clave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
                      Desvincular
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center gap-1.5">
            <CardTitle>{vinculos.length > 0 ? "Vincular a otro" : "¿De quién son estos papeles?"}</CardTitle>
            <InfoTip
              what="La carpeta (con sus subcarpetas) aparece en Archivo › Terceros, bajo el nombre que elijas."
              affects="No mueve ni copia nada: los papeles siguen en su carpeta. Una carpeta puede ser de varios."
              example="«Contrato del local» → Juana Pérez (Persona) y Notaría Pérez (Otro)."
            />
          </div>
          <div role="radiogroup" aria-label="Tipo de tercero" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TIPOS_TERCERO.map((t) => {
              const Icono = ICONO_TERCERO[t];
              const activo = t === tipo;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => { setTipo(t); setQ(""); }}
                  className={cn(
                    "flex h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-bold transition-colors",
                    activo
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
                  )}
                >
                  <Icono className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 truncate">{TIPO_TERCERO_LABEL[t].uno}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && tipo === "otro" && idOtro) void cambiar("addTags", claveVinculo("otro", idOtro)); }}
              aria-label={tipo === "otro" ? "Nombre del tercero" : `Buscar ${TIPO_TERCERO_LABEL[tipo].uno.toLowerCase()}`}
              placeholder={tipo === "otro" ? "Escribe el nombre, ej: Notaría Pérez" : "Busca por nombre, DNI, RUC o teléfono…"}
              className={CAMPO_BUSCAR}
            />
          </div>

          {tipo === "otro" ? (
            <button
              type="button"
              disabled={!idOtro || ocupado !== null || yaVinculados.has(claveVinculo("otro", idOtro || "_"))}
              onClick={() => void cambiar("addTags", claveVinculo("otro", idOtro))}
              className={cn(button({ variant: "primary" }), "w-full gap-2")}
            >
              <UserPlus className="h-4 w-4" />
              Vincular a «{idOtro ? q.trim().slice(0, 34) : "…"}»
            </button>
          ) : buscando ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </p>
          ) : res?.error ? (
            <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{res.error}</p>
          ) : (res?.lista.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">
              {buscar.trim() ? `No encontré a nadie con «${buscar.trim()}».` : `Todavía no hay ${TIPO_TERCERO_LABEL[tipo].varios.toLowerCase()} cargados.`}
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
              {res?.lista.map((c) => {
                const ya = yaVinculados.has(c.clave);
                return (
                  <li key={c.clave}>
                    <button
                      type="button"
                      disabled={ya || ocupado !== null}
                      onClick={() => void cambiar("addTags", c.clave, { nombre: c.nombre, detalle: c.detalle })}
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                        {c.detalle && <span className="block truncate text-xs text-[var(--text-tertiary)]">{c.detalle}</span>}
                      </span>
                      {ocupado === c.clave ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                      ) : ya ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                          <Check className="h-4 w-4" /> Vinculado
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">Vincular</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminModal>
  );
}
