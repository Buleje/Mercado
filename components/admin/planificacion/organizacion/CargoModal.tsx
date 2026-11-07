"use client";

/**
 * CargoModal — alta y edición de un cargo del organigrama (ADR-497): nombre,
 * área, a quién reporta (sin ciclos: ni a sí mismo ni a alguien que tiene
 * debajo), quién lo ocupa (sugiere el equipo de RRHH; si no, texto libre) y
 * sus funciones. Se monta con `key`: cada apertura parte de `inicial`.
 */
import { useId, useMemo, useState } from "react";
import { Plus, Trash2, Users } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { CAMPO_ALTO } from "../piezas/clases";
import { useNombresEquipo } from "../piezas/use-nombres-equipo";
import { jefesPosibles, type Area, type Cargo } from "./organigrama-arbol";

const MAX_FUNCIONES = 30;

interface Props {
  abierto: boolean;
  inicial: Cargo;
  esNuevo: boolean;
  cargos: readonly Cargo[];
  areas: readonly Area[];
  onCerrar: () => void;
  onGuardar: (c: Cargo) => void;
}

export function CargoModal({ abierto, inicial, esNuevo, cargos, areas, onCerrar, onGuardar }: Props) {
  const formId = useId();
  const idNombres = useId();
  const nombres = useNombresEquipo();
  const [f, setF] = useState<Cargo>(inicial);
  const [nuevaFuncion, setNuevaFuncion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const jefes = useMemo(() => jefesPosibles(cargos, esNuevo ? null : inicial.id), [cargos, esNuevo, inicial.id]);
  const poner = <K extends keyof Cargo>(k: K, v: Cargo[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setError(null);
  };

  const agregarFuncion = () => {
    const t = nuevaFuncion.trim();
    if (!t || f.funciones.length >= MAX_FUNCIONES) return;
    poner("funciones", [...f.funciones, t]);
    setNuevaFuncion("");
  };

  const guardar = () => {
    const nombre = f.nombre.trim();
    if (!nombre) return setError("Escribe el nombre del cargo.");
    const reportaA = jefes.some((j) => j.id === f.reportaA) ? f.reportaA : "";
    onGuardar({ ...f, nombre, reportaA, persona: f.persona.trim(), funciones: f.funciones.map((x) => x.trim()).filter(Boolean) });
    onCerrar();
  };

  return (
    <AdminModal
      open={abierto}
      onClose={onCerrar}
      title={esNuevo ? "Nuevo cargo" : "Editar cargo"}
      icon={Users}
      size="md"
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

        <Field label="Cargo" required>
          <input type="text" className={CAMPO_ALTO} value={f.nombre} maxLength={160} placeholder="Encargado de tienda" onChange={(e) => poner("nombre", e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área">
            <select className={CAMPO_ALTO} value={f.areaId} onChange={(e) => poner("areaId", e.target.value)}>
              <option value="">Sin área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reporta a">
            <select className={CAMPO_ALTO} value={f.reportaA} onChange={(e) => poner("reportaA", e.target.value)}>
              <option value="">Nadie: es la cabeza</option>
              {jefes.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nombre}
                  {j.persona ? ` (${j.persona})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Quién lo ocupa" hint={nombres.length > 0 ? "Elige de tu equipo o escribe un nombre." : undefined}>
          <input type="text" className={CAMPO_ALTO} value={f.persona} maxLength={160} list={idNombres} placeholder="Nombre de la persona" onChange={(e) => poner("persona", e.target.value)} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">Funciones</legend>
          {f.funciones.map((fn, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={fn}
                maxLength={600}
                aria-label={`Función ${i + 1}`}
                className={cn(CAMPO_ALTO, "flex-1")}
                onChange={(e) => poner("funciones", f.funciones.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                type="button"
                className={button({ variant: "ghost", size: "icon" })}
                aria-label={`Borrar función ${i + 1}`}
                title="Borrar"
                onClick={() => poner("funciones", f.funciones.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nuevaFuncion}
              maxLength={600}
              enterKeyHint="done"
              aria-label="Nueva función"
              disabled={f.funciones.length >= MAX_FUNCIONES}
              placeholder="Qué hace y Enter"
              className={cn(CAMPO_ALTO, "flex-1")}
              onChange={(e) => setNuevaFuncion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarFuncion();
                }
              }}
            />
            <button type="button" className={button({ variant: "secondary", size: "icon" })} aria-label="Agregar función" title="Agregar función" disabled={!nuevaFuncion.trim()} onClick={agregarFuncion}>
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
        </fieldset>
      </form>
    </AdminModal>
  );
}
