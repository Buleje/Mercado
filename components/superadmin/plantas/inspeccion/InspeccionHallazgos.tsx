"use client";

/**
 * Hallazgos: lo que el inspector anota en la planta, a mano o a partir de una
 * incoherencia que el libro ya mostraba al abrir la inspección.
 */
import { useState } from "react";
import { ArrowRightLeft, CheckCircle2, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import { BadgeStatus, CardTitle } from "@buleje/design-system";
import { Button } from "@/components/ui-system/Button";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { HallazgoInspeccion, IncoherenciaPlanta } from "@/lib/superadmin/plantas-forestales/tipos";
import { TARJETA } from "@/components/admin/forestal/ctp-conteo-pasos";
import { GRAVEDAD, m3 } from "../formato";
import { FormHallazgo, FotoMiniatura } from "./FormHallazgo";
import { hallazgoDeIncoherencia, idDeIncoherencia, ROTULO_CATEGORIA, ROTULO_REFERENCIA } from "./inspeccion-datos";
import type { Inspeccion } from "./use-inspeccion";

function TarjetaHallazgo({ h, editable, onEditar, onQuitar }: { h: HallazgoInspeccion; editable: boolean; onEditar: () => void; onQuitar: () => void }) {
  return (
    <li className={cn(TARJETA, "space-y-2")} data-hallazgo={h.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeStatus variant={GRAVEDAD[h.gravedad].variante} label={GRAVEDAD[h.gravedad].rotulo} size="sm" />
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{ROTULO_CATEGORIA[h.categoria]}</span>
          {h.m3 != null && <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{m3(h.m3)}</span>}
        </div>
        {editable && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" onClick={onEditar} aria-label="Corregir el hallazgo">
              <Pencil className="h-5 w-5" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" onClick={onQuitar} aria-label="Quitar el hallazgo">
              <Trash2 className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        )}
      </div>
      <p className="whitespace-pre-line break-words text-base text-[var(--text-primary)]">{h.texto}</p>
      {h.referencia && (
        <p className="text-sm text-[var(--text-secondary)]">
          {ROTULO_REFERENCIA[h.referencia.tipo]}: <span className="font-semibold">{h.referencia.valor}</span>
        </p>
      )}
      {h.fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {h.fotos.map((u) => (
            <FotoMiniatura key={u} url={u} />
          ))}
        </div>
      )}
    </li>
  );
}

function Incoherencias({ items, yaConvertidas, editable, onConvertir }: {
  items: IncoherenciaPlanta[];
  yaConvertidas: ReadonlySet<string>;
  editable: boolean;
  onConvertir: (inc: IncoherenciaPlanta) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <CardTitle>Lo que el libro ya mostraba</CardTitle>
        <InfoTip
          title="Incoherencias al abrir"
          what="Las incoherencias que el libro de la planta tenía cuando abriste la inspección."
          affects="Si la confirmas en la planta, conviértela en hallazgo: pasa al acta con su volumen."
        />
      </div>
      <ul className="space-y-2">
        {items.map((inc) => {
          const hecha = yaConvertidas.has(idDeIncoherencia(inc));
          return (
            <li key={inc.id} className="flex flex-col gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeStatus variant={GRAVEDAD[inc.gravedad].variante} label={GRAVEDAD[inc.gravedad].rotulo} size="sm" />
                  {inc.m3EnJuego != null && <span className="text-sm font-semibold tabular-nums">{m3(Math.abs(inc.m3EnJuego))}</span>}
                </div>
                <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{inc.titulo}</p>
                {inc.detalle && <p className="break-words text-sm text-[var(--text-secondary)]">{inc.detalle}</p>}
              </div>
              {hecha ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Ya es hallazgo
                </span>
              ) : (
                editable && (
                  <Button variant="secondary" className="shrink-0" onClick={() => onConvertir(inc)}>
                    <ArrowRightLeft className="h-4 w-4" aria-hidden /> Convertir en hallazgo
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InspeccionHallazgos({ s }: { s: Inspeccion }) {
  /* null = cerrado; "nuevo" = agregando; id = corrigiendo ese. */
  const [editando, setEditando] = useState<string | null>(null);
  const hallazgos = s.borrador?.hallazgos ?? [];
  const incoherencias = s.insp?.libro.incoherenciasDetalle ?? [];
  const ids = new Set(hallazgos.map((h) => h.id));
  const enEdicion = editando && editando !== "nuevo" ? (hallazgos.find((h) => h.id === editando) ?? null) : null;

  const guardar = (h: HallazgoInspeccion) => {
    s.cambiar("hallazgos", (prev) => (prev.some((x) => x.id === h.id) ? prev.map((x) => (x.id === h.id ? h : x)) : [...prev, h]));
    setEditando(null);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle>Hallazgos</CardTitle>
            <InfoTip
              title="Hallazgos"
              what="Lo que encontraste en la planta y tiene que quedar en el acta."
              example="Grave · Documentos: «La guía 001-0004512 no está en la planta»."
            />
          </div>
          {s.editable && editando !== "nuevo" && (
            <Button variant="primary" onClick={() => setEditando("nuevo")}>
              <Plus className="h-4 w-4" aria-hidden /> Agregar hallazgo
            </Button>
          )}
        </div>
        {s.editable && editando === "nuevo" && <FormHallazgo key="nuevo" inicial={null} onGuardar={guardar} onCancelar={() => setEditando(null)} />}
        {hallazgos.length === 0 && editando !== "nuevo" && <p className="text-sm text-[var(--text-tertiary)]">Todavía no anotaste hallazgos.</p>}
        {hallazgos.length > 0 && (
          <ul className="space-y-3">
            {hallazgos.map((h) =>
              s.editable && enEdicion?.id === h.id ? (
                <li key={h.id}>
                  <FormHallazgo inicial={enEdicion} onGuardar={guardar} onCancelar={() => setEditando(null)} />
                </li>
              ) : (
                <TarjetaHallazgo
                  key={h.id}
                  h={h}
                  editable={s.editable}
                  onEditar={() => setEditando(h.id)}
                  onQuitar={() => s.cambiar("hallazgos", (prev) => prev.filter((x) => x.id !== h.id))}
                />
              ),
            )}
          </ul>
        )}
      </section>

      <Incoherencias
        items={incoherencias}
        yaConvertidas={ids}
        editable={s.editable}
        onConvertir={(inc) => s.cambiar("hallazgos", (prev) => (prev.some((x) => x.id === idDeIncoherencia(inc)) ? prev : [...prev, hallazgoDeIncoherencia(inc)]))}
      />
    </div>
  );
}
