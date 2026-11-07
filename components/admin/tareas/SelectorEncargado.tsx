"use client";

/**
 * El encargado de una tarea se ELIGE del personal (OPER-6): escrito a mano
 * salían «Jhon», «John» y «Jhon P.» para la misma persona y después no había
 * cómo ver sus tareas. Sigue guardando el mismo texto (`assignedTo`), sin
 * cambiar la base, y «Otra persona…» deja escribir un nombre que no está.
 *
 * Se monta sólo con el formulario abierto: la lista se pide al abrirlo, no
 * cada vez que entras a Tareas. Sin acceso al personal (403) o sin nadie
 * cargado, queda el campo de texto de siempre.
 */

import { useMemo, useState } from "react";
import { Field } from "@/components/admin/shared/Field";
import { useRrhhColaboradores } from "@/hooks/use-rrhh-colaboradores";
import { nombresDelEquipo } from "@/lib/admin/tareas-buscar";
import { CLASE_CAMPO_TAREA, CLASE_ROTULO_TAREA } from "./tareas-shared";

const OTRA = "__otra__";

export default function SelectorEncargado({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colaboradores, loading } = useRrhhColaboradores({}, true);
  const nombres = useMemo(() => nombresDelEquipo(colaboradores), [colaboradores]);
  const [pidioOtra, setPidioOtra] = useState(false);
  // Un nombre que no está en la lista (escrito a mano antes) se muestra en el
  // campo de texto, no se pierde ni se cambia por otro.
  const otra = pidioOtra || (value !== "" && !nombres.includes(value));

  if (nombres.length === 0) {
    return (
      <Field label="Asignado a" labelClassName={CLASE_ROTULO_TAREA}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={loading ? "Cargando el equipo…" : "Nombre del encargado"}
          className={CLASE_CAMPO_TAREA}
        />
      </Field>
    );
  }

  return (
    <Field label="Asignado a" labelClassName={CLASE_ROTULO_TAREA}>
      {(id) => (
        <div className="space-y-2">
          <select
            id={id}
            value={otra ? OTRA : value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTRA) {
                setPidioOtra(true);
                onChange("");
              } else {
                setPidioOtra(false);
                onChange(v);
              }
            }}
            className={CLASE_CAMPO_TAREA}
          >
            <option value="">Sin asignar</option>
            {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value={OTRA}>Otra persona…</option>
          </select>
          {otra && (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Escribe su nombre"
              aria-label="Nombre de la otra persona"
              className={CLASE_CAMPO_TAREA}
            />
          )}
        </div>
      )}
    </Field>
  );
}
