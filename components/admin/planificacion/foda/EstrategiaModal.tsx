"use client";

/**
 * EstrategiaModal — alta y edición de una estrategia (ADR-497): el cruce (FO,
 * DO, FA, DA), qué se va a hacer, los puntos del FODA que usa (sólo los de sus
 * dos cuadrantes) y en qué quedó. Se monta con `key`: cada apertura parte de
 * `inicial`.
 */
import { useId, useState } from "react";
import { Compass } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { ESTADOS_ESTRATEGIA, type DatosSeccion } from "@/lib/planificacion/secciones";
import { cn } from "@/lib/utils";
import { AREA_TEXTO, TEXTO_TONO, claseChip } from "../piezas/clases";
import { CUADRANTE, ESTADO_ESTRATEGIA, NOMBRE_IMPACTO, ORDEN_MATRIZ, TIPO, type Estrategia, type TipoEstrategia } from "./foda-config";

const MAX_USA = 12;

interface Props {
  abierto: boolean;
  /** La que se edita, o el borrador de una nueva (con el cruce sugerido). */
  inicial: Estrategia;
  esNueva: boolean;
  foda: DatosSeccion<"foda">;
  onCerrar: () => void;
  onGuardar: (e: Estrategia) => void;
}

const idsDelTipo = (foda: DatosSeccion<"foda">, t: TipoEstrategia) => new Set(TIPO[t].cruza.flatMap((c) => foda[c].map((p) => p.id)));

export function EstrategiaModal({ abierto, inicial, esNueva, foda, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const [f, setF] = useState<Estrategia>(inicial);
  const [error, setError] = useState<string | null>(null);
  const info = TIPO[f.tipo];

  const elegirTipo = (t: TipoEstrategia) => {
    const validos = idsDelTipo(foda, t);
    setF((p) => ({ ...p, tipo: t, usa: p.usa.filter((id) => validos.has(id)) }));
  };
  const alternar = (id: string) =>
    setF((p) => ({ ...p, usa: p.usa.includes(id) ? p.usa.filter((x) => x !== id) : [...p.usa, id].slice(0, MAX_USA) }));

  const guardar = () => {
    const texto = f.texto.trim();
    if (!texto) return setError("Escribe qué vas a hacer.");
    const validos = idsDelTipo(foda, f.tipo);
    onGuardar({ ...f, texto, usa: f.usa.filter((id) => validos.has(id)) });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={esNueva ? "Nueva estrategia" : "Editar estrategia"}
      icon={Compass}
      size="lg"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })}>
            {esNueva ? "Agregar" : "Guardar cambios"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={cn(MODAL_BODY, "space-y-5")}
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <Field label="Qué cruza" hint={info.significado}>
          {() => (
            <div role="radiogroup" aria-label="Qué cruza" className="flex flex-wrap gap-2">
              {ORDEN_MATRIZ.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={f.tipo === t} className={claseChip(f.tipo === t)} onClick={() => elegirTipo(t)}>
                  <span className="font-mono">{t}</span> {TIPO[t].nombre}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Qué vas a hacer" required>
          <textarea
            className={AREA_TEXTO}
            value={f.texto}
            maxLength={600}
            placeholder={info.ejemplo.split("→ ")[1] ?? ""}
            onChange={(e) => {
              setF((p) => ({ ...p, texto: e.target.value }));
              setError(null);
            }}
          />
        </Field>

        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            Puntos del FODA que usa <span className="font-normal text-[var(--text-tertiary)]">({f.usa.length} de {MAX_USA} como máximo)</span>
          </legend>
          {info.cruza.map((c) => (
            <div key={c} className="rounded-xl border border-[var(--rule-soft)] p-2">
              <span className={cn("block px-2 pb-1 text-sm font-semibold", TEXTO_TONO[CUADRANTE[c].tono])}>{CUADRANTE[c].nombre}</span>
              {foda[c].length === 0 ? (
                <span className="block px-2 py-2 text-sm text-[var(--text-tertiary)]">Sin {CUADRANTE[c].nombre.toLowerCase()} en tu FODA.</span>
              ) : (
                foda[c].map((p) => {
                  const marcado = f.usa.includes(p.id);
                  return (
                    <label key={p.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-[var(--surface-sunken)]">
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-[var(--accent)]"
                        checked={marcado}
                        disabled={!marcado && f.usa.length >= MAX_USA}
                        onChange={() => alternar(p.id)}
                      />
                      <span className="flex-1 text-sm text-[var(--text-primary)]">{p.texto}</span>
                      <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{NOMBRE_IMPACTO[p.impacto]}</span>
                    </label>
                  );
                })
              )}
            </div>
          ))}
        </fieldset>

        <Field label="En qué quedó">
          {() => (
            <div role="radiogroup" aria-label="En qué quedó" className="flex flex-wrap gap-2">
              {ESTADOS_ESTRATEGIA.map((e) => (
                <button key={e} type="button" role="radio" aria-checked={f.estado === e} className={claseChip(f.estado === e)} onClick={() => setF((p) => ({ ...p, estado: e }))}>
                  {ESTADO_ESTRATEGIA[e].nombre}
                </button>
              ))}
            </div>
          )}
        </Field>
      </form>
    </AdminModal>
  );
}
