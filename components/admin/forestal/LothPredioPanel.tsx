"use client";

/**
 * LothPredioPanel — la IDENTIDAD y el CONTORNO del predio.
 *
 *   · el CONTORNO DEL PREDIO. El plano pide dos polígonos —el del inmueble
 *     completo y el exacto del área trabajada— y antes se dibujaba uno solo.
 *     Sin el marco no se puede mostrar que el área declarada cae adentro.
 *   · la IDENTIDAD del predio (nombre, sector, comunidad), que no vive en la
 *     carátula del libro: ésa llega hasta distrito/provincia/departamento.
 *
 * El checklist del plano, que antes iba arriba de esto bajo un mismo título,
 * es su propio bloque (`LothPlanoRequisitos`). Las cuatro acciones sobre el
 * contorno van en un menú «Contorno» —se usan una vez por predio—; a la vista
 * queda guardar, que es lo que pide el formulario.
 */

import { useState } from "react";
import { MapPin, Copy, Square, Trash2, Upload } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { hasPredio, type LothCartografia, type LothPredio } from "@/lib/forestal/loth-cartografia";
import { polygonAreaHa, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { Btn, Field, I } from "./ctp-shared";

/** Nombre y contorno en una línea, para la cabecera del bloque plegado. */
export function resumenPredio(predio: LothPredio): string {
  const nombre = predio.nombre.trim() || "Sin nombre";
  const contorno = hasPredio(predio)
    ? `${predio.vertices.length} vértices · ${polygonAreaHa(predio.vertices).toFixed(2)} ha`
    : "sin contorno";
  const donde = [predio.sector, predio.comunidad].map((x) => x.trim()).filter(Boolean).join(" · ");
  return [nombre, donde, contorno].filter(Boolean).join(" · ");
}

interface Props {
  cartografia: LothCartografia;
  parcela: LothParcela;
  saving: boolean;
  onChange: (c: LothCartografia) => void;
  onSave: () => void;
  /** Entra al modo dibujo con el borrador apuntando al PREDIO. */
  onDibujarPredio: () => void;
  /** Abre el modal de pegado de coordenadas apuntando al PREDIO. */
  onImportPredio: () => void;
  /** Copia el área declarada como contorno provisional del predio. */
  onCopiarDelArea: () => void;
}

export default function LothPredioPanel({
  cartografia,
  parcela,
  saving,
  onChange,
  onSave,
  onDibujarPredio,
  onImportPredio,
  onCopiarDelArea,
}: Props) {
  const { confirm } = useConfirm();
  const [guardado, setGuardado] = useState(false);
  const predio = cartografia.predio;
  const conPredio = hasPredio(predio);
  const predioHa = conPredio ? polygonAreaHa(predio.vertices) : 0;

  const patch = (p: Partial<LothPredio>) => onChange({ ...cartografia, predio: { ...predio, ...p } });

  const guardar = () => {
    onSave();
    setGuardado(true);
    window.setTimeout(() => setGuardado(false), 2200);
  };

  const borrarContorno = async () => {
    if (!(await confirm({
      title: "¿Borrar el contorno del predio?",
      description: "Los datos de identidad se conservan.",
      intent: "danger",
      confirmLabel: "Sí, borrar",
    }))) return;
    patch({ vertices: [] as LatLng[] });
  };

  return (
    <div className="space-y-3 p-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
        <Field label="Nombre del predio" hint="Como figura en el título de propiedad">
          <input
            type="text"
            className={I}
            value={predio.nombre}
            placeholder="Fundo San Miguel"
            onChange={(e) => patch({ nombre: e.target.value })}
          />
        </Field>
        <Field label="Sector" hint="La zona dentro del distrito">
          <input
            type="text"
            className={I}
            value={predio.sector}
            placeholder="Km 12 — margen derecha"
            onChange={(e) => patch({ sector: e.target.value })}
          />
        </Field>
        <Field label="Comunidad" hint="Si el predio pertenece a una CC.NN. o campesina">
          <input
            type="text"
            className={I}
            value={predio.comunidad}
            placeholder="C.N. Unión Siria"
            onChange={(e) => patch({ comunidad: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ActionMenu
          label="Contorno"
          icon={Square}
          title="Dibujar, pegar, copiar o borrar el contorno del predio"
          actions={[
            {
              id: "dibujar",
              label: conPredio ? "Corregir en el mapa" : "Dibujar en el mapa",
              hint: "Toca el mapa vértice por vértice; arrastra para mover",
              icon: MapPin,
              onSelect: onDibujarPredio,
            },
            {
              id: "pegar",
              label: "Pegar el cuadro de coordenadas",
              hint: "El cuadro del título de propiedad, un KML o un GeoJSON",
              icon: Upload,
              onSelect: onImportPredio,
            },
            /* Atajo honesto: en un predio de un solo lote el contorno ES el área.
               Se copia y se corrige, en vez de tipear los mismos vértices dos veces. */
            {
              id: "copiar",
              label: "Copiar del área declarada",
              hint: parcela.vertices.length < 3 ? "Primero dibuja el área de aprovechamiento" : "Para un predio de un solo lote",
              icon: Copy,
              disabled: parcela.vertices.length < 3,
              onSelect: onCopiarDelArea,
            },
            ...(conPredio
              ? [{ id: "borrar", label: "Borrar contorno", hint: "Los datos de identidad se conservan", icon: Trash2, tone: "danger" as const, onSelect: () => void borrarContorno() }]
              : []),
          ]}
        />
        {conPredio && (
          <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            {predio.vertices.length} vértices · {predioHa.toFixed(2)} ha
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {guardado && <span className="text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Guardado</span>}
          <Btn size="sm" variant="primary" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Guardar el predio"}
          </Btn>
        </span>
      </div>
    </div>
  );
}
