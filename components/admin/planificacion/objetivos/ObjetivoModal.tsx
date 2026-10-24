"use client";

/**
 * ObjetivoModal — alta y edición de un objetivo con todos sus campos
 * (ADR-497): qué, área, plazo, fechas, responsable, cómo se mide, avance,
 * estado, la estrategia de donde sale, sus acciones y una nota. Se monta con
 * `key`: cada apertura parte de `inicial`.
 */
import { useId, useState } from "react";
import { Flag } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { ESTADOS_OBJETIVO, PLAZOS } from "@/lib/planificacion/secciones";
import { cn, limaDateKey } from "@/lib/utils";
import { AREA_TEXTO, CAMPO_ALTO, claseChip } from "../piezas/clases";
import { sumarMeses } from "../piezas/fechas";
import { useNombresEquipo } from "../piezas/use-nombres-equipo";
import { AccionesEditor } from "./AccionesEditor";
import { ESTADO_OBJETIVO, MESES_PLAZO, NOMBRE_PLAZO, type Objetivo } from "./objetivos-config";

interface Props {
  abierto: boolean;
  inicial: Objetivo;
  esNuevo: boolean;
  /** Áreas ya usadas (organigrama y otros objetivos), para sugerir. */
  areas: readonly string[];
  onCerrar: () => void;
  onGuardar: (o: Objetivo) => void;
}

export function ObjetivoModal({ abierto, inicial, esNuevo, areas, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const idNombres = useId();
  const idAreas = useId();
  const nombres = useNombresEquipo();
  const { datos: estrategias } = useSeccionPlan("estrategias");
  const [f, setF] = useState<Objetivo>(inicial);
  const [error, setError] = useState<string | null>(null);
  const poner = <K extends keyof Objetivo>(k: K, v: Objetivo[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  };

  const guardar = () => {
    const titulo = f.titulo.trim();
    if (!titulo) return setError("Escribe qué quieres lograr.");
    if (f.inicio && f.fin && f.fin < f.inicio) return setError("La fecha de fin es anterior a la de inicio.");
    onGuardar({ ...f, titulo, acciones: f.acciones.filter((a) => a.texto.trim()) });
    onCerrar();
  };

  const sugerirFin = () => poner("fin", sumarMeses(f.inicio || limaDateKey(), MESES_PLAZO[f.plazo]));

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={esNuevo ? "Nuevo objetivo" : "Editar objetivo"}
      icon={Flag}
      size="lg"
      footer={
        <ModalFooter error={error}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })}>
            {esNuevo ? "Agregar" : "Guardar cambios"}
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
        <datalist id={idNombres}>
          {nombres.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id={idAreas}>
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>

        <Field label="Qué quieres lograr" required>
          <input type="text" className={CAMPO_ALTO} value={f.titulo} maxLength={160} placeholder="Vender S/ 30 000 al mes" onChange={(e) => poner("titulo", e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área">
            <input type="text" className={CAMPO_ALTO} value={f.area} maxLength={160} list={idAreas} placeholder="Ventas" onChange={(e) => poner("area", e.target.value)} />
          </Field>
          <Field label="Responsable">
            <input type="text" className={CAMPO_ALTO} value={f.responsable} maxLength={160} list={idNombres} placeholder="Quién lo empuja" onChange={(e) => poner("responsable", e.target.value)} />
          </Field>
        </div>

        <Field label="Plazo">
          {() => (
            <div role="radiogroup" aria-label="Plazo" className="flex flex-wrap gap-2">
              {PLAZOS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={f.plazo === p} className={claseChip(f.plazo === p)} onClick={() => poner("plazo", p)}>
                  {NOMBRE_PLAZO[p]}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empieza">
            <input type="date" className={CAMPO_ALTO} value={f.inicio} onChange={(e) => poner("inicio", e.target.value)} />
          </Field>
          <Field
            label="Termina"
            hint={
              !f.fin ? (
                <button type="button" className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]" onClick={sugerirFin}>
                  Poner {MESES_PLAZO[f.plazo]} meses después
                </button>
              ) : undefined
            }
          >
            <input type="date" className={CAMPO_ALTO} value={f.fin} min={f.inicio || undefined} onChange={(e) => poner("fin", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cómo se mide">
            <input type="text" className={CAMPO_ALTO} value={f.indicador} maxLength={160} placeholder="Ventas del mes" onChange={(e) => poner("indicador", e.target.value)} />
          </Field>
          <Field label="Meta">
            <input type="text" className={CAMPO_ALTO} value={f.meta} maxLength={160} placeholder="S/ 30 000" onChange={(e) => poner("meta", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Avance (%)" hint="Vacío = sale de las acciones hechas.">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              className={CAMPO_ALTO}
              value={f.avance ?? ""}
              placeholder="De las acciones"
              onChange={(e) => {
                const n = e.target.value === "" ? null : Math.round(Number(e.target.value));
                poner("avance", n === null || Number.isNaN(n) ? null : Math.min(100, Math.max(0, n)));
              }}
            />
          </Field>
          <Field label="Sale de la estrategia">
            <select className={CAMPO_ALTO} value={f.estrategiaId} onChange={(e) => poner("estrategiaId", e.target.value)}>
              <option value="">Ninguna</option>
              {estrategias.items.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.tipo} · {e.texto.slice(0, 70)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="En qué quedó">
          {() => (
            <div role="radiogroup" aria-label="En qué quedó" className="flex flex-wrap gap-2">
              {ESTADOS_OBJETIVO.map((e) => (
                <button key={e} type="button" role="radio" aria-checked={f.estado === e} className={claseChip(f.estado === e)} onClick={() => poner("estado", e)}>
                  {ESTADO_OBJETIVO[e].nombre}
                </button>
              ))}
            </div>
          )}
        </Field>

        <AccionesEditor acciones={f.acciones} onCambiar={(a) => poner("acciones", a)} listaNombres={idNombres} />

        <Field label="Nota">
          <textarea className={AREA_TEXTO} value={f.nota} maxLength={600} onChange={(e) => poner("nota", e.target.value)} />
        </Field>
      </form>
    </AdminModal>
  );
}
