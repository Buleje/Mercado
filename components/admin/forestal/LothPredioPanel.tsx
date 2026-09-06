"use client";

/**
 * LothPredioPanel — el predio y el checklist del plano del expediente.
 *
 * Dos cosas que el módulo no tenía y que son las que traban un expediente:
 *
 *   · el CONTORNO DEL PREDIO. El plano pide dos polígonos —el del inmueble
 *     completo y el exacto del área trabajada— y acá se dibujaba uno solo.
 *     Sin el marco no se puede mostrar que el área declarada cae adentro.
 *   · la IDENTIDAD del predio (nombre, sector, comunidad), que no vive en la
 *     carátula del libro: ésa llega hasta distrito/provincia/departamento.
 *
 * Y arriba de todo, la lista de requisitos evaluada contra los datos reales
 * (`loth-plano-checklist`): la misma que se lee en el instructivo, pero
 * respondida por el módulo y con el camino para resolver cada faltante.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, Check, ClipboardList, MapPin, Trash2, Upload } from "@buleje/design-system/icons";
import { hasPredio, type LothCartografia, type LothPredio } from "@/lib/forestal/loth-cartografia";
import type { ChecklistPlano } from "@/lib/forestal/loth-plano-checklist";
import { polygonAreaHa, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { Btn, Field, I } from "./ctp-shared";

interface Props {
  /** Calculado por el orquestador: el mismo que gatea la impresión del plano. */
  check: ChecklistPlano;
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
  check,
  cartografia,
  parcela,
  saving,
  onChange,
  onSave,
  onDibujarPredio,
  onImportPredio,
  onCopiarDelArea,
}: Props) {
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

  const borrarContorno = () => {
    if (!window.confirm("¿Borrar el contorno del predio? Los datos de identidad se conservan.")) return;
    patch({ vertices: [] as LatLng[] });
  };

  return (
    <section className="space-y-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <ClipboardList className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            El predio y el plano del expediente
          </CardTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            Los requisitos del plano, respondidos con lo que hay cargado.
          </p>
        </div>
        {/* El veredicto primero: es lo que se mira antes de mandar a imprimir. */}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
            check.listo
              ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
              : "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
          }`}
        >
          {check.listo ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {check.cumplidos} de {check.total}
        </span>
      </div>

      {/* ── Checklist ─────────────────────────────────────────────────────── */}
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {check.requisitos.map((r) => (
          <li
            key={r.id}
            className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ${
              r.cumple ? "bg-[var(--surface-sunken)]" : "bg-[var(--data-warning-500)]/10"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                r.cumple
                  ? "bg-[var(--data-success-500)]/20 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : "bg-[var(--data-warning-500)]/25 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              {r.cumple ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <span className="text-[length:var(--ts-2xs,11px)] font-bold">!</span>}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--text-primary)]">{r.label}</span>
              <span className="block text-xs text-[var(--text-tertiary)]">{r.detalle}</span>
              {!r.cumple && r.comoResolver && (
                <span className="mt-0.5 block text-xs font-medium text-[var(--text-secondary)]">{r.comoResolver}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* ── Identidad + contorno ──────────────────────────────────────────── */}
      <div className="border-t border-[var(--rule-base)] pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MapPin className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
          <CardTitle as="h4" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Identidad y contorno del predio
          </CardTitle>
          {conPredio && (
            <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {predio.vertices.length} vértices · {predioHa.toFixed(2)} ha
            </span>
          )}
        </div>

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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn size="sm" variant="secondary" onClick={onDibujarPredio}>
            <MapPin className="h-4 w-4" />
            {conPredio ? "Corregir en el mapa" : "Dibujar en el mapa"}
          </Btn>
          <Btn size="sm" variant="secondary" onClick={onImportPredio}>
            <Upload className="h-4 w-4" />
            Pegar el cuadro de coordenadas
          </Btn>
          {/* Atajo honesto: en un predio de un solo lote el contorno ES el área.
              Se copia y se corrige, en vez de tipear los mismos vértices dos veces. */}
          <Btn size="sm" variant="secondary" onClick={onCopiarDelArea} disabled={parcela.vertices.length < 3}>
            Copiar del área declarada
          </Btn>
          {conPredio && (
            <Btn size="sm" variant="danger" onClick={borrarContorno}>
              <Trash2 className="h-4 w-4" />
              Borrar contorno
            </Btn>
          )}
          <span className="ml-auto flex items-center gap-3">
            {guardado && <span className="text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Guardado</span>}
            <Btn size="sm" variant="primary" onClick={guardar} disabled={saving}>
              {saving ? "Guardando…" : "Guardar el predio"}
            </Btn>
          </span>
        </div>
      </div>
    </section>
  );
}
