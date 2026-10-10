"use client";

/**
 * ModalMetaObjetivo — el bloque 4 del modal de una meta: objetivo, nombre,
 * vencimiento y lo que ya llevas, con la VARA para elegir un objetivo
 * realista (auditoría 10-10, lo nuevo de la vista Metas):
 *  · «Setiembre: S/ 24,100» y tres objetivos de un toque (igual, +10 %, +20 %;
 *    en un tope, menos), del período anterior entero medido en el servidor.
 *  · «A tu ritmo cerrarías con ≈ S/ 25,500 (85 % del objetivo)»: proyección,
 *    se dice así.
 *
 * Sólo dibuja: el estado y la validación viven en `ModalMeta`.
 */
import type { ReactNode, RefObject } from "react";
import { History } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATALOGO_METAS } from "@/lib/admin/metas-catalogo";
import type { VistaPrevia } from "@/hooks/use-metas";
import { CAMPO, claseChip } from "./clases-meta";
import { cifraDeMeta, proyeccion } from "./formato-meta";
import type { CampoMeta, ErroresMeta, FormMeta } from "./ModalMetaCampos";
import { nombreDelAnterior, sugerencias } from "./vara-meta";

const ERROR = "mt-1 block text-sm font-semibold text-[var(--data-error-ink)]";
/** Todos los rótulos de campo del mismo alto: el que lleva ⓘ (24 px) ya no baja su campo. */
const ROTULO = "mb-1 flex min-h-6 items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]";
const ALTO = "h-12";

const mayuscula = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

function UnidadPegada({ lado, children }: { lado: "antes" | "despues"; children: ReactNode }) {
  return (
    <span
      className={`inline-flex ${ALTO} shrink-0 items-center border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm font-semibold text-[var(--text-secondary)] ${
        lado === "antes" ? "rounded-l-xl border-r-0" : "rounded-r-xl border-l-0"
      }`}
    >
      {children}
    </span>
  );
}

/** Lo que ya llevas, la proyección y las sugerencias del período anterior. */
function Previa({ form, previa, onCampo }: { form: FormMeta; previa: VistaPrevia; onCampo: (c: CampoMeta, v: string) => void }) {
  const cat = CATALOGO_METAS[form.category];
  if (previa.cargando) return <>Midiendo lo que llevas…</>;
  if (previa.avance === undefined) return <>El avance sale solo de tus datos del período.</>;
  const objetivo = Number(form.target);
  const proy =
    previa.desde && previa.hasta && previa.hoy ? proyeccion(previa.avance, previa.desde, previa.hasta, previa.hoy) : null;
  const pctProy = proy !== null && objetivo > 0 ? Math.round((proy / objetivo) * 100) : null;
  const ant = previa.anterior;
  const opciones = sugerencias(ant, form.unit, cat.sentido);
  return (
    <>
      <span aria-live="polite" className="block">
        En este período{previa.etiqueta ? ` (${previa.etiqueta})` : ""} llevas{" "}
        <strong className="tabular-nums text-[var(--text-primary)]">{cifraDeMeta(previa.avance, form.unit)}</strong>
        {proy !== null && (
          <>
            {" · "}a tu ritmo {cat.sentido === "baja" ? "llegarías a" : "cerrarías con"}{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">≈ {cifraDeMeta(proy, form.unit)}</strong>
            {pctProy !== null && ` (${pctProy} % ${cat.sentido === "baja" ? "del tope" : "del objetivo"})`}
          </>
        )}
        {proy !== null && (
          <InfoTip
            title="A tu ritmo"
            what="Lo que llevas, repartido entre los días que pasaron, por los días del período. Es una proyección, no un dato."
            className="ml-1"
          />
        )}
      </span>
      {previa.parcial && <span className="block">Dato parcial: {previa.parcial}</span>}
      {ant && ant.avance !== null && previa.hoy && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <History className="h-4 w-4 shrink-0" aria-hidden="true" />
            {mayuscula(nombreDelAnterior(form.period, ant, previa.hoy))}:{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">{cifraDeMeta(ant.avance, form.unit)}</strong>
            {opciones.length > 0 && " · ponle:"}
          </span>
          {opciones.map((o) => (
            <button
              key={o.etiqueta}
              type="button"
              aria-pressed={objetivo === o.valor}
              onClick={() => onCampo("target", String(o.valor))}
              className={claseChip(objetivo === o.valor)}
            >
              {o.etiqueta}
              <span className="tabular-nums">{cifraDeMeta(o.valor, form.unit)}</span>
            </button>
          ))}
        </span>
      )}
    </>
  );
}

export function ModalMetaObjetivo({
  form,
  errores,
  previa,
  onCampo,
  objetivoRef,
}: {
  form: FormMeta;
  errores: ErroresMeta;
  previa: VistaPrevia;
  onCampo: (campo: CampoMeta, valor: string) => void;
  /** El campo del objetivo, para enfocarlo al abrir desde «de S/ 30,000» de la tarjeta. */
  objetivoRef?: RefObject<HTMLInputElement | null>;
}) {
  const cat = CATALOGO_METAS[form.category];
  const esManual = form.category === "manual";
  const unidadAntes = form.unit === "S/";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)]">
      <label className="block">
        <span className={ROTULO}>Objetivo</span>
        <span className="flex items-stretch">
          {unidadAntes && <UnidadPegada lado="antes">S/</UnidadPegada>}
          <input
            ref={objetivoRef}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            required
            value={form.target}
            placeholder={String(cat.plantilla.target)}
            onChange={(e) => onCampo("target", e.target.value)}
            aria-invalid={Boolean(errores.target)}
            className={`${CAMPO} ${ALTO} min-w-0 flex-1 tabular-nums ${unidadAntes ? "rounded-l-none" : "rounded-r-none"}`}
          />
          {!unidadAntes &&
            (cat.unidades.length > 1 ? (
              <select
                aria-label="Unidad"
                value={form.unit}
                onChange={(e) => onCampo("unit", e.target.value)}
                className={`${ALTO} rounded-r-xl border border-l-0 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-sm font-semibold text-[var(--text-primary)]`}
              >
                {cat.unidades.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : esManual ? (
              <input
                aria-label="Unidad"
                value={form.unit}
                maxLength={20}
                placeholder="unid."
                onChange={(e) => onCampo("unit", e.target.value)}
                className={`${ALTO} w-24 rounded-r-xl border border-l-0 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-sm text-[var(--text-primary)]`}
              />
            ) : (
              <UnidadPegada lado="despues">{form.unit}</UnidadPegada>
            ))}
        </span>
        {(errores.target || errores.unit) && <span className={ERROR}>{errores.target ?? errores.unit}</span>}
      </label>

      <label className="block">
        <span className={ROTULO}>Nombre</span>
        <input
          value={form.name}
          maxLength={120}
          placeholder={esManual ? "Ej.: Visitas a clientes" : cat.nombre}
          onChange={(e) => onCampo("name", e.target.value)}
          aria-invalid={Boolean(errores.name)}
          className={`${CAMPO} ${ALTO}`}
        />
        {errores.name && <span className={ERROR}>{errores.name}</span>}
      </label>

      <div className="block">
        <span className={ROTULO}>
          <label htmlFor="meta-vence">Vence (opcional)</label>
          <InfoTip
            title="Vencimiento"
            what="Sin fecha, la meta se repite cada período. Con fecha, cuando pasa queda cerrada con su resultado."
          />
        </span>
        <input id="meta-vence" type="date" value={form.dueDate} onChange={(e) => onCampo("dueDate", e.target.value)} className={`${CAMPO} ${ALTO}`} />
        {errores.dueDate && <span className={ERROR}>{errores.dueDate}</span>}
      </div>

      {esManual ? (
        <label className="block">
          <span className={ROTULO}>Avance (lo anotas tú)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.current}
            placeholder="0"
            onChange={(e) => onCampo("current", e.target.value)}
            aria-invalid={Boolean(errores.current)}
            className={`${CAMPO} ${ALTO} tabular-nums`}
          />
          {errores.current && <span className={ERROR}>{errores.current}</span>}
        </label>
      ) : (
        <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)] sm:col-span-2 lg:col-span-3">
          <Previa form={form} previa={previa} onCampo={onCampo} />
        </div>
      )}
    </div>
  );
}
