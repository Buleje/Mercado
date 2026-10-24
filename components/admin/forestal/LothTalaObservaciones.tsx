"use client";

/**
 * Observaciones de la Sección 1 (Tala) y marcado físico del árbol.
 *
 * El item 10 de la RDE 264-2019 no describe un campo libre: nombra cuatro
 * casos y **el término exacto** que hay que consignar («descartado», «consumo
 * interno», el nombre científico). Escrito a mano sale «se descartó», «no
 * sirve», «descarte» — y entonces el fiscalizador que busca la palabra no la
 * encuentra, aunque el dato esté.
 *
 * El item 3, además, pide que el código esté marcado **en el fuste y en el
 * tocón** con material durable. Es lo primero que un supervisor de OSINFOR
 * verifica en campo y no vivía en ninguna parte del libro.
 */

import { ClipboardCheck, TreePine, Check } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  MARCAS_FISICAS,
  MOTIVOS_TALA,
  componerObservaciones,
  estadoMarcado,
  motivoPideCientifico,
  type MarcaFisica,
  type MotivoTala,
} from "@/lib/forestal/loth-tala";

export default function LothTalaObservaciones({
  motivos,
  onMotivos,
  detalle,
  onDetalle,
  textoLibre,
  onTextoLibre,
  nombreCientifico,
  marcas,
  onMarcas,
  tieneFoto = false,
}: {
  motivos: MotivoTala[];
  onMotivos: (m: MotivoTala[]) => void;
  detalle: string;
  onDetalle: (v: string) => void;
  textoLibre: string;
  onTextoLibre: (v: string) => void;
  nombreCientifico: string | null;
  marcas: MarcaFisica[];
  onMarcas: (m: MarcaFisica[]) => void;
  /** ¿Se adjuntó la foto? Declarar el marcado sin una prueba es una promesa. */
  tieneFoto?: boolean;
}) {
  const marcado = estadoMarcado(marcas);
  const pideDetalle = motivos.some((k) => MOTIVOS_TALA.find((m) => m.key === k)?.pideDetalle);
  const pideCientifico = motivoPideCientifico(motivos);
  const preview = componerObservaciones({ motivos, detalle, nombreCientifico, textoLibre });

  const toggle = (k: MotivoTala) =>
    onMotivos(motivos.includes(k) ? motivos.filter((x) => x !== k) : [...motivos, k]);

  const toggleMarca = (k: MarcaFisica) =>
    onMarcas(marcas.includes(k) ? marcas.filter((x) => x !== k) : [...marcas, k]);

  return (
    <section
      aria-label="Marcado y observaciones"
      className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
    >
      {/* Item 3 — el código marcado en el árbol */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <TreePine className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" strokeWidth={1.75} />
            Marcado del código en campo
          </CardTitle>
          <InfoTip
            title="Marcado del código (item 3)"
            what="El código va marcado en el fuste Y en el tocón, con placa, plástico o pintura esmalte."
            affects="Es lo primero que verifica un supervisor de OSINFOR en campo."
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MARCAS_FISICAS.map((m) => {
            const activo = marcas.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={activo}
                onClick={() => toggleMarca(m.key)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
                  activo
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                }`}
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                    activo
                      ? "border-[var(--accent-dark)] bg-[var(--accent-dark)] text-white"
                      : "border-[var(--rule-strong)]"
                  }`}
                >
                  {activo && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          {marcado.completo ? "Fuste y tocón marcados." : `Falta declarar: ${marcado.faltan.join(" y ")}.`}
        </p>
        {marcado.completo && !tieneFoto && (
          <p className="flex items-center gap-1 text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
            <span>Falta la foto del tocón con el código visible (abajo, en Evidencia de campo).</span>
            <InfoTip
              title="Foto del marcado"
              what="Declaraste el marcado pero no hay foto: una foto del tocón con el código visible es lo que sostiene esta línea si te supervisan."
            />
          </p>
        )}
      </div>

      {/* Item 10 — los casos que la norma tipifica */}
      <div className="space-y-1.5 border-t border-[var(--rule-soft)] pt-3">
        <div className="flex items-center gap-1">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <ClipboardCheck className="h-4 w-4 text-[var(--data-info-600)]" strokeWidth={1.75} />
            Observaciones
            <span className="font-normal text-[var(--text-tertiary)]">(item 10)</span>
          </CardTitle>
          <InfoTip
            title="Observaciones (item 10)"
            what="La norma nombra estos casos y el término exacto que hay que escribir: elegirlos deja la palabra que el fiscalizador busca."
            example="«Descartado», «Consumo interno», el nombre científico."
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_TALA.map((m) => {
            const activo = motivos.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={activo}
                title={m.ayuda}
                onClick={() => toggle(m.key)}
                className={`min-h-9 rounded-lg border px-3 text-xs font-bold transition-colors ${
                  activo
                    ? "border-[var(--data-info-600)] bg-[var(--data-info-500)]/10 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {pideDetalle && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
              Motivo (la norma pide detallarlo)
            </span>
            <input
              type="text"
              value={detalle}
              onChange={(e) => onDetalle(e.target.value)}
              placeholder="ej. hueco de base a copa"
              className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-600)]"
            />
          </label>
        )}

        {pideCientifico && (
          <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
            Se consigna el nombre científico{" "}
            <span className="font-semibold italic text-[var(--text-primary)]">
              {nombreCientifico || "— elige una especie que lo tenga"}
            </span>{" "}
            en observaciones (item 10).
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
            Nota adicional (opcional)
          </span>
          <textarea
            value={textoLibre}
            onChange={(e) => onTextoLibre(e.target.value)}
            rows={2}
            placeholder="Lo que no entre en los casos de arriba"
            className="w-full resize-none rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-600)]"
          />
        </label>

        {preview && (
          <p className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-primary)]">
            <span className="mr-1.5 text-xs font-semibold text-[var(--text-tertiary)]">Así queda en el libro:</span>
            {preview}
          </p>
        )}
      </div>
    </section>
  );
}
