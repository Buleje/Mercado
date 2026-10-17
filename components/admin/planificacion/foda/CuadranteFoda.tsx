"use client";

/**
 * CuadranteFoda — una de las cuatro cajas del FODA (ADR-497): sus puntos, cada
 * uno editable en su lugar, el impacto que cambia con un toque (alto → medio →
 * bajo) y la papelera. Se agrega escribiendo y presionando Enter. Las preguntas
 * que ayudan a llenarlo van en su ⓘ.
 */
import { useId, useState } from "react";
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CuadranteFoda as ClaveCuadrante } from "@/lib/planificacion/secciones";
import { cn } from "@/lib/utils";
import { CAJA_TONO, CAMPO_ALTO, EN_LUGAR, PASTILLA, PASTILLA_TONO, TEXTO_TONO, type Tono } from "../piezas/clases";
import { CUADRANTE, NOMBRE_IMPACTO, SIGUIENTE_IMPACTO, type PuntoFoda } from "./foda-config";

const MAX_PUNTOS = 40;

interface Props {
  clave: ClaveCuadrante;
  puntos: readonly PuntoFoda[];
  puedeEditar: boolean;
  onAgregar: (texto: string) => void;
  onEditar: (id: string, cambio: Partial<Omit<PuntoFoda, "id">>) => void;
  /** `avisar` = con «Deshacer» (el que se vacía al escribir se va sin aviso). */
  onBorrar: (id: string, avisar: boolean) => void;
}

export function CuadranteFoda({ clave, puntos, puedeEditar, onAgregar, onEditar, onBorrar }: Props) {
  const info = CUADRANTE[clave];
  const Icono = info.icono;
  const idCampo = useId();
  const [nuevo, setNuevo] = useState("");
  const lleno = puntos.length >= MAX_PUNTOS;

  const agregar = () => {
    const texto = nuevo.trim();
    if (!texto || lleno) return;
    onAgregar(texto);
    setNuevo("");
  };

  return (
    <section aria-label={info.nombre} className={cn("rounded-xl border border-t-4 border-[var(--rule-base)] p-3 sm:p-4", CAJA_TONO[info.tono])}>
      <div className="mb-2 flex items-center gap-2">
        <Icono aria-hidden className={cn("size-5 shrink-0", TEXTO_TONO[info.tono])} />
        <span className={cn("text-base font-bold", TEXTO_TONO[info.tono])}>{info.nombre}</span>
        <span className="text-sm text-[var(--text-tertiary)] tabular-nums">{puntos.length}</span>
        <InfoTip title={`${info.nombre} · ${info.origen}`} what={info.preguntas} example={info.ejemplo} />
        <span className={cn(PASTILLA, PASTILLA_TONO.neutro, "ml-auto")}>{info.origen === "interna" ? "De adentro" : "De afuera"}</span>
      </div>

      {puntos.length === 0 && !puedeEditar && <p className="py-2 text-sm text-[var(--text-tertiary)]">Todavía sin {info.nombre.toLowerCase()}.</p>}

      <ul className="space-y-1">
        {puntos.map((p, i) => (
          <li key={p.id} className="flex items-start gap-1 rounded-lg bg-[var(--surface-raised)]/70">
            {puedeEditar ? (
              <textarea
                rows={1}
                value={p.texto}
                maxLength={600}
                aria-label={`${info.nombre}: punto ${i + 1}`}
                className={cn(EN_LUGAR, "min-h-12 flex-1")}
                onChange={(e) => onEditar(p.id, { texto: e.target.value })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) onBorrar(p.id, false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <span className="flex-1 px-2 py-3 text-sm leading-snug text-[var(--text-primary)]">{p.texto}</span>
            )}
            <PastillaImpacto punto={p} tono={info.tono} puedeEditar={puedeEditar} onCambiar={() => onEditar(p.id, { impacto: SIGUIENTE_IMPACTO[p.impacto] })} />
            {puedeEditar && (
              <button
                type="button"
                className={button({ variant: "ghost", size: "icon" })}
                aria-label={`Borrar «${p.texto.slice(0, 40)}»`}
                title="Borrar"
                onClick={() => onBorrar(p.id, true)}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {puedeEditar && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={idCampo} className="sr-only">
            Agregar a {info.nombre}
          </label>
          <input
            id={idCampo}
            type="text"
            value={nuevo}
            maxLength={600}
            enterKeyHint="done"
            disabled={lleno}
            placeholder={lleno ? `Llegaste a ${MAX_PUNTOS}` : `${info.placeholder} y Enter`}
            className={cn(CAMPO_ALTO, "flex-1 bg-[var(--surface-raised)]")}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              }
            }}
          />
          <button
            type="button"
            className={button({ variant: "secondary", size: "icon" })}
            aria-label={`Agregar a ${info.nombre}`}
            title="Agregar"
            disabled={!nuevo.trim() || lleno}
            onClick={agregar}
          >
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}

interface PropsImpacto {
  punto: PuntoFoda;
  /** El alto se pinta con el color del cuadrante; medio y bajo, en gris. */
  tono: Tono;
  puedeEditar: boolean;
  onCambiar: () => void;
}

function PastillaImpacto({ punto, tono: tonoCuadrante, puedeEditar, onCambiar }: PropsImpacto) {
  const tono = punto.impacto === "alto" ? PASTILLA_TONO[tonoCuadrante] : PASTILLA_TONO.neutro;
  const pastilla = (
    <span className={cn(PASTILLA, tono, punto.impacto === "bajo" && "text-[var(--text-tertiary)]")}>{NOMBRE_IMPACTO[punto.impacto]}</span>
  );
  if (!puedeEditar) return <span className="flex h-12 shrink-0 items-center px-1">{pastilla}</span>;
  return (
    <button
      type="button"
      onClick={onCambiar}
      className="flex h-12 shrink-0 items-center rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
      aria-label={`Impacto ${NOMBRE_IMPACTO[punto.impacto].toLowerCase()}; toca para cambiarlo a ${NOMBRE_IMPACTO[SIGUIENTE_IMPACTO[punto.impacto]].toLowerCase()}`}
      title="Toca para cambiar el impacto"
    >
      {pastilla}
    </button>
  );
}
