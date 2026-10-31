"use client";

/**
 * Los paquetes de esta tanda, con sus botones de editar, duplicar y quitar.
 * Movida desde `CtpRegistrarProduccionModal.tsx` (28-10); los tres botones
 * de la fila son el `IconAction` del Libro (mismos rótulos, misma acción).
 */
import { Copy, Pencil, Trash2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { IconAction } from "../ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "../ctp-tabla";
import type { RegistrarProduccion } from "./use-registrar-produccion";
import type { MaterialAConsumir } from "./tipos";

export default function PaquetesCargados({
  r,
  material,
}: {
  r: RegistrarProduccion;
  material: MaterialAConsumir;
}) {
  const { paquetes, previo, editandoId, setEditandoId, setPaquetes, cargarEnForm } = r;
  return (
    <TablaCtp altoMax="max-h-[45vh]">
      <TheadCtp>
        <tr>
          <th className="font-bold">Código paquete</th>
          <th className="font-bold">Producto</th>
          <th className="font-bold">Presentación</th>
          <th className="text-right font-bold">Cant.</th>
          <th className="text-right font-bold">Esp. (cm)</th>
          <th className="text-right font-bold">Ancho (cm)</th>
          <th className="text-right font-bold">Largo (m)</th>
          <th className="text-right font-bold">Volumen</th>
          {/* Igual al "% aprovechado" del Resumen de Producción por PMF y
              Producto oficial (Brandon, 2026-09-01): qué parte del
              consumido representa este paquete, no del acumulado — un
              número que ya se ve en Rendimiento arriba. */}
          <th className="text-right font-bold" title="Del volumen consumido por esta corrida">
            % aprov.
          </th>
          <th>
            <span className="sr-only">Quitar</span>
          </th>
        </tr>
      </TheadCtp>
      <TbodyCtp>
        {paquetes.length === 0 && (
          <FilaVacia cols={10}>
            {previo > 0
              ? "Todavía no agregaste ningún paquete. Los que cargues acá se SUMAN a los que la corrida ya declaró; los anteriores no se tocan."
              : "Todavía no agregaste ningún paquete. El volumen de la corrida es la suma de los que cargues acá."}
          </FilaVacia>
        )}
        {paquetes.map((p) => (
          <tr
            key={p.id}
            className={
              p.id === editandoId
                ? "bg-primary/10 ring-1 ring-inset ring-[var(--accent)]"
                : "hover:bg-[var(--surface-sunken)]"
            }
          >
            <td className="font-mono font-bold">{p.codigo}</td>
            <td className="text-[var(--text-secondary)]">{p.productType}</td>
            <td className="text-[var(--text-secondary)]">{p.presentacion}</td>
            <td className="text-right font-mono tabular-nums">{p.cantidad}</td>
            <td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">
              {p.espesorCm ?? "—"}
            </td>
            <td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">
              {p.anchoCm ?? "—"}
            </td>
            <td className="text-right font-mono tabular-nums text-[var(--text-tertiary)]">
              {p.largoM ?? "—"}
            </td>
            <td className="text-right font-mono font-bold tabular-nums">
              {fmtM3(p.volumenM3)}
            </td>
            <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
              {material.volumenM3 > 0
                ? `${((p.volumenM3 / material.volumenM3) * 100).toFixed(2)}%`
                : "—"}
            </td>
            <td className="text-right">
              <div className="inline-flex items-center gap-1">
                {/* Corregir sin re-tipear: el volumen del paquete 3 de 15
                    se arregla acá, no borrando y volviendo a cargar. */}
                <IconAction
                  icon={Pencil}
                  label={`Editar el paquete ${p.codigo}`}
                  onClick={() => cargarEnForm(p, "editar")}
                />
                {/* Dos atados iguales seguidos: se copia y sale con el
                    próximo código libre de la serie. */}
                <IconAction
                  icon={Copy}
                  label={`Duplicar el paquete ${p.codigo}`}
                  onClick={() => cargarEnForm(p, "duplicar")}
                />
                <IconAction
                  icon={Trash2}
                  tone="danger"
                  label={`Quitar el paquete ${p.codigo}`}
                  onClick={() => {
                    setPaquetes((prev) => prev.filter((x) => x.id !== p.id));
                    /* Si se borra el que se estaba editando, el formulario
                       tiene que salir del modo corrección o quedaría
                       apuntando a un paquete que ya no existe. */
                    if (p.id === editandoId) setEditandoId(null);
                  }}
                />
              </div>
            </td>
          </tr>
        ))}
      </TbodyCtp>
    </TablaCtp>
  );
}
