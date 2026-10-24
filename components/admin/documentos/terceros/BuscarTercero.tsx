"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { CardTitle } from "@buleje/design-system";
import { Check, Loader2, Search, X } from "@buleje/design-system/icons";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { TIPOS_TERCERO, TIPO_TERCERO_LABEL, claveVinculo, idDeOtro, type NombreTercero, type TipoTercero } from "@/lib/documentos/terceros-vinculo";
import { buscarCandidatos, type Candidato } from "./use-terceros";
import { CAMPO_BUSCAR, ICONO_TERCERO } from "./compartido";

/**
 * Elegir a quién ligar la carpeta: el tipo, el buscador y la lista de
 * candidatos (o el nombre libre de «Otro»). Sirve para «Ligar a otro» y para
 * «Cambiar» un vínculo (`reemplaza` = el nombre del que se va).
 */
export default function BuscarTercero({ yaVinculados, ocupado, onElegir, titulo, reemplaza, tipoInicial = "persona", onCancelar }: {
  yaVinculados: ReadonlySet<string>;
  /** La clave que se está guardando (spinner) o null. */
  ocupado: string | null;
  onElegir: (clave: string, nombre?: NombreTercero) => void;
  titulo: string;
  reemplaza?: string;
  tipoInicial?: TipoTercero;
  onCancelar?: () => void;
}) {
  const [tipo, setTipo] = useState<TipoTercero>(tipoInicial);
  const [q, setQ] = useState("");
  const buscar = useDebounce(q, 250);
  const [res, setRes] = useState<{ clave: string; lista: Candidato[]; error: string | null } | null>(null);

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
  const idOtro = tipo === "otro" ? idDeOtro(q) : "";
  const verbo = reemplaza ? "Cambiar a" : "Ligar a";

  return (
    <section className="space-y-3" data-qa="vinculos-buscar">
      <div className="flex items-center gap-1.5">
        <CardTitle>{titulo}</CardTitle>
        <InfoTip
          what={reemplaza ? `La carpeta deja de estar ligada a ${reemplaza} y pasa a quien elijas.` : "La carpeta (con sus subcarpetas) aparece en Archivo › Terceros y en la ficha del tercero."}
          affects="No mueve ni copia nada: los papeles siguen en su carpeta. Una carpeta puede ser de varios."
          example="«Contrato del local» → Juana Pérez (Persona) y Notaría Pérez (Otro)."
        />
        {onCancelar && (
          <button type="button" onClick={onCancelar} title="Cancelar" aria-label="Cancelar el cambio" className={cn(button({ variant: "ghost", size: "icon" }), "ml-auto")}>
            <X className="h-5 w-5" />
          </button>
        )}
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
              title={TIPO_TERCERO_LABEL[t].uno}
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
          onKeyDown={(e) => { if (e.key === "Enter" && tipo === "otro" && idOtro) onElegir(claveVinculo("otro", idOtro)); }}
          aria-label={tipo === "otro" ? "Nombre del tercero" : `Buscar ${TIPO_TERCERO_LABEL[tipo].uno.toLowerCase()}`}
          placeholder={tipo === "otro" ? "Escribe el nombre, ej: Notaría Pérez" : "Busca por nombre, DNI, RUC o teléfono…"}
          className={CAMPO_BUSCAR}
        />
      </div>

      {tipo === "otro" ? (
        <button
          type="button"
          disabled={!idOtro || ocupado !== null || yaVinculados.has(claveVinculo("otro", idOtro || "_"))}
          onClick={() => onElegir(claveVinculo("otro", idOtro))}
          className={cn(button({ variant: "primary" }), "w-full gap-2")}
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {verbo} «{idOtro ? q.trim().slice(0, 34) : "…"}»
        </button>
      ) : buscando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
        </p>
      ) : res?.error ? (
        <p className="text-sm text-[var(--data-error-ink)]">{res.error}</p>
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
                  onClick={() => onElegir(c.clave, { nombre: c.nombre, detalle: c.detalle })}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-default disabled:hover:bg-transparent"
                  data-qa="vinculos-candidato"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                    {c.detalle && <span className="block truncate text-xs text-[var(--text-tertiary)]">{c.detalle}</span>}
                  </span>
                  {ocupado === c.clave ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                  ) : ya ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--data-success-ink)]">
                      <Check className="h-4 w-4" /> Ya ligada
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{reemplaza ? "Cambiar" : "Ligar"}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
