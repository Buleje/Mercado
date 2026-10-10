"use client";

/**
 * «Agregar árbol al censo» — una fila de la hoja del regente, con todas sus
 * columnas (Cod · N. común · N. científico · nombre nativo · DAP · altura ·
 * vol · Este · Norte · condición · observaciones).
 *
 * Mismo formato que «Nueva línea» del libro: 44 rem, grilla de 6, pie fijo
 * fuera del scroll y la ayuda en ⓘ. Lo que entra sin tipear: al escribir la
 * especie se completan el científico (plan → censo → catálogo) y el nombre
 * nativo (otro árbol del censo de la misma especie), sin pisar lo escrito.
 */

import { useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Loader2, Plus, TreePine } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { findSpeciesByCommonName } from "@/data/forestry-species";
import { DAP_AVISO_M, DAP_MAX_M, claveEspecie, fmtDapM, mensajeDapFueraDeRango, sugerenciaDapM } from "@/lib/forestal/loth-constants";
import { dmcParaEspecie } from "@/lib/forestal/loth-poa";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  BORRADOR_VACIO, borradorSiguiente, completarSinPisar, condicionesParaElegir, especiesParaElegir,
  revisarArbol, sugerirPorEspecie, type ArbolCenso, type BorradorArbol, type EspeciePlanCenso,
} from "./loth-censo-arbol";

interface Props {
  open: boolean;
  onClose: () => void;
  planId: string;
  arboles: readonly ArbolCenso[];
  /** Especies del plan (con su científico). Vacío = se completa desde el censo y el catálogo. */
  especiesPlan: readonly (EspeciePlanCenso & { cites?: boolean })[];
  /** Claves (`claveEspecie`) de las especies autorizadas. */
  autorizadas: ReadonlySet<string>;
  dmcOverrides: Record<string, number>;
  onAgregado: () => void;
  /** Código y especie ya escritos (p. ej. una tala que el censo no declara). Se leen al montar. */
  inicial?: { treeCode: string; speciesCommon: string };
}

const FORM_ID = "loth-censo-arbol-form";
const INPUT = "h-10 w-full rounded-lg border bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:ring-1";
const inputCls = (mal: boolean) =>
  `${INPUT} ${mal ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)] focus:ring-[var(--data-error-500)]/20" : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20"}`;

export default function LothCensoArbolForm({ open, onClose, planId, arboles, especiesPlan, autorizadas, dmcOverrides, onAgregado, inicial }: Props) {
  /** Lo último que puso la sugerencia: si el campo sigue así, se puede reemplazar. */
  const sugerido = useRef<{ cientifico: string | null; nativo: string | null }>({ cientifico: null, nativo: null });
  const [b, setB] = useState<BorradorArbol>(() => {
    if (!inicial) return BORRADOR_VACIO;
    // Lo que entra sin tipear: con la especie viene su científico y su nombre nativo.
    const s = sugerirPorEspecie(inicial.speciesCommon, especiesPlan, arboles);
    sugerido.current = s;
    return { ...BORRADOR_VACIO, treeCode: inicial.treeCode, speciesCommon: inicial.speciesCommon, speciesScientific: s.cientifico ?? "", speciesNative: s.nativo ?? "" };
  });
  const [busy, setBusy] = useState(false);
  const codigoRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof BorradorArbol, v: string) => setB((p) => ({ ...p, [k]: v }));

  const codigos = useMemo(() => new Set(arboles.map((a) => a.treeCode.trim().toLowerCase())), [arboles]);
  const especies = useMemo(() => especiesParaElegir(especiesPlan, arboles), [especiesPlan, arboles]);
  const condiciones = useMemo(() => condicionesParaElegir(arboles), [arboles]);
  const r = revisarArbol(b, { codigos });

  // DAP en metros: 15 (un centímetro tecleado de más) no existe. Bloquea con
  // sugerencia de un clic; entre DAP_AVISO_M y DAP_MAX_M sólo avisa — hay
  // árboles reales así de gruesos (lupunas, ceibas).
  const dapFueraDeTope = r.dap != null && r.dap > DAP_MAX_M;
  const dapSugerido = dapFueraDeTope && r.dap != null ? sugerenciaDapM(r.dap) : null;
  const avisos = [...r.avisos];
  if (r.dap != null && !dapFueraDeTope && r.dap > DAP_AVISO_M) {
    avisos.unshift(`DAP de ${fmtDapM(r.dap)} m: es un árbol inusualmente grueso — revisa que esté en metros.`);
  }
  const especie = b.speciesCommon.trim();
  const fueraDelPlan = especie !== "" && autorizadas.size > 0 && !autorizadas.has(claveEspecie(especie));
  if (fueraDelPlan) avisos.push(`«${especie}» no está entre las especies autorizadas del plan.`);
  if (especie && r.dap != null && !dapFueraDeTope) {
    const { cm } = dmcParaEspecie(especie, dmcOverrides);
    if (r.dap * 100 < cm) avisos.push(`Bajo el DMC de ${cm} cm: se censa, pero el libro va a bloquear su tala.`);
  }
  const hayError = dapFueraDeTope || r.errores.length > 0;
  // El error primero: lo que falta ya lo dicen los asteriscos.
  const bloqueo = dapFueraDeTope ? "El DAP va en metros" : r.errores[0] ?? (r.faltan.length > 0 ? `Falta: ${r.faltan.join(", ")}` : null);

  function cambiarEspecie(v: string) {
    const s = sugerirPorEspecie(v, especiesPlan, arboles);
    setB((p) => ({
      ...p,
      speciesCommon: v,
      speciesScientific: completarSinPisar(p.speciesScientific, sugerido.current.cientifico, s.cientifico),
      speciesNative: completarSinPisar(p.speciesNative, sugerido.current.nativo, s.nativo),
    }));
    sugerido.current = s;
  }

  async function agregar(yOtro: boolean) {
    if (busy || bloqueo) return;
    setBusy(true);
    const delPlan = especiesPlan.find((s) => claveEspecie(s.speciesCommon) === claveEspecie(especie));
    const txt = (s: string) => s.trim() || null;
    try {
      const res = await fetch("/api/admin/forestal/plan/census", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          planId, treeCode: b.treeCode.trim(), speciesCommon: especie,
          speciesScientific: txt(b.speciesScientific), speciesNative: txt(b.speciesNative),
          cites: delPlan?.cites ?? findSpeciesByCommonName(especie)?.cites ?? false,
          dapM: r.dap, alturaComercialM: r.altura, factorForma: r.ff,
          // Vacío = el servidor lo calcula con la misma cuenta del placeholder.
          volumenEstimadoM3: r.volumenEscrito,
          utmZona: txt(b.utmZona), utmX: r.este, utmY: r.norte,
          condicion: txt(b.condicion), notes: txt(b.notes),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // El servidor explica en `message` (p. ej. «El árbol 2 ya está en el censo»); `error` es el código.
        toast.error(
          typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : `No se pudo agregar el árbol (error ${res.status})`,
        );
        return;
      }
      toast.success(`Árbol ${b.treeCode.trim()} agregado al censo`);
      setB(borradorSiguiente);
      onAgregado();
      if (yOtro) requestAnimationFrame(() => codigoRef.current?.focus());
      else onClose();
    } catch (err) {
      console.warn("[LothCensoArbolForm] agregar árbol falló", err);
      toast.error("No se pudo agregar el árbol — revisa tu conexión.");
    } finally { setBusy(false); }
  }

  const volPlaceholder = r.volumenCalculado > 0 ? `${fmtM3(r.volumenCalculado)} calculado` : "se calcula solo";
  const input = (k: keyof BorradorArbol, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={b[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={r.invalidos.has(k) || undefined} className={inputCls(r.invalidos.has(k))} {...extra} />
  );
  const decimal = { inputMode: "decimal" as const, autoComplete: "off" };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Agregar árbol al censo"
      description="Una fila de la hoja del regente, con todas sus columnas"
      icon={TreePine}
      variant="wide"
      className="sm:max-w-[44rem]"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {/* En el celular los avisos quedan abajo del scroll: sin esta línea
              «Agregar» aparecía apagado sin decir por qué. Lo que falta no se
              repite ahí (se ve en los asteriscos). */}
          <p className={`min-w-0 truncate text-xs sm:block ${hayError ? "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "hidden text-[var(--text-tertiary)]"}`} title={bloqueo ?? undefined}>
            {bloqueo ?? "Listo para agregar"}
          </p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="button" onClick={() => void agregar(true)} disabled={busy || !!bloqueo} title={bloqueo ?? "Agrega y deja el formulario listo para el siguiente árbol"} className="inline-flex h-10 items-center whitespace-nowrap rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50">Agregar y otro</button>
            <button type="submit" form={FORM_ID} disabled={busy || !!bloqueo} title={bloqueo ?? undefined} className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Plus className="hidden h-4 w-4 shrink-0 sm:block" />} Agregar al censo
            </button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); void agregar(false); }} className={`space-y-3 ${MODAL_BODY}`}>
        <div className="grid grid-cols-6 gap-x-3 gap-y-3 [&>*]:min-w-0">
          <Campo label="Código" required hint="El de la placa del árbol: la Tala lo jala por este código. No se puede repetir en el plan." className="col-span-6 sm:col-span-2">
            <input ref={codigoRef} value={b.treeCode} onChange={(e) => set("treeCode", e.target.value)} placeholder="85-TOR" autoComplete="off" aria-required="true" autoFocus /* eslint-disable-line jsx-a11y/no-autofocus -- el modal se abre para escribir el código del árbol de inmediato */ aria-invalid={r.invalidos.has("treeCode") || undefined} className={inputCls(r.invalidos.has("treeCode"))} />
          </Campo>
          <Campo label="N. común" required className="col-span-6 sm:col-span-4">
            <input value={b.speciesCommon} onChange={(e) => cambiarEspecie(e.target.value)} list="loth-censo-especies" placeholder="Tornillo" autoComplete="off" aria-required="true" className={inputCls(false)} />
          </Campo>
          <Campo label="N. científico" hint="Se completa solo con el de la especie en el plan (o en otro árbol del censo). Puedes cambiarlo." className="col-span-6 sm:col-span-3">
            {input("speciesScientific", { placeholder: "Cedrelinga cateniformis", autoComplete: "off", className: `${inputCls(false)} italic` })}
          </Campo>
          <Campo label="Nombre en idioma nativo" hint="Si otro árbol del censo de la misma especie ya lo tiene, se copia de ahí." className="col-span-6 sm:col-span-3">
            {input("speciesNative", { placeholder: "Coubé", autoComplete: "off" })}
          </Campo>
          <Campo label="DAP (m)" hint="Diámetro a la altura del pecho, en metros: 0.90 = 90 cm." className="col-span-3 sm:col-span-2">
            {input("dapM", { ...decimal, placeholder: "0.85", "aria-invalid": dapFueraDeTope || r.invalidos.has("dapM") || undefined, className: inputCls(dapFueraDeTope || r.invalidos.has("dapM")) })}
          </Campo>
          <Campo label="Altura (m)" hint="Altura comercial del fuste, en metros." className="col-span-3 sm:col-span-2">
            {input("alturaComercialM", { ...decimal, placeholder: "18" })}
          </Campo>
          <Campo label="Factor de forma" className="col-span-3 sm:col-span-2">
            {input("factorForma", { ...decimal, placeholder: "0.65" })}
          </Campo>
          {dapFueraDeTope && r.dap != null && (
            <p className="col-span-6 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              {mensajeDapFueraDeRango(r.dap)}
              {dapSugerido != null && (
                <button type="button" onClick={() => set("dapM", String(dapSugerido))} className="rounded-md border border-[var(--data-error-500)]/50 bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-100)] dark:text-[var(--data-error-500)]">
                  Usar {fmtDapM(dapSugerido)} m
                </button>
              )}
            </p>
          )}
          <Campo label="Volumen (m³)" hint="Vacío = se calcula: 0,7854 × DAP² × altura × factor de forma. Si la hoja del regente trae el volumen, escríbelo: el declarado manda." className="col-span-3 sm:col-span-2">
            {input("volumen", { ...decimal, placeholder: volPlaceholder })}
          </Campo>
          <Campo label="Condición" hint="La que anota el regente (Aprovechable, Semillero…). La categoría POA la calcula el sistema aparte, con el DMC." className="col-span-6 sm:col-span-4">
            {input("condicion", { list: "loth-censo-condiciones", placeholder: "Aprovechable", autoComplete: "off" })}
          </Campo>
          <Campo label="Este" hint="Coordenadas UTM en metros. Sin ellas el árbol no se ve en el croquis." className="col-span-3 sm:col-span-2">
            {input("utmX", { ...decimal, placeholder: "521922" })}
          </Campo>
          <Campo label="Norte" className="col-span-3 sm:col-span-2">
            {input("utmY", { ...decimal, placeholder: "8918151" })}
          </Campo>
          <Campo label="Zona UTM" className="col-span-3 sm:col-span-2">
            {input("utmZona", { placeholder: "18L", autoComplete: "off" })}
          </Campo>
          <Campo label="Observaciones" className="col-span-6">
            {input("notes", { placeholder: "Caído natural, hueco, con liana…", maxLength: 500 })}
          </Campo>
        </div>
        <datalist id="loth-censo-especies">{especies.map((e) => <option key={e} value={e} />)}</datalist>
        <datalist id="loth-censo-condiciones">{condiciones.map((c) => <option key={c} value={c} />)}</datalist>

        {r.errores.length > 0 && (
          <ul aria-live="polite" className="space-y-0.5 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {r.errores.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {avisos.length > 0 && (
          <ul className="space-y-0.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
      </form>
    </AdminModal>
  );
}

/**
 * Un campo con su rótulo. `min-h-6` en los dos casos: el ⓘ mide 24 px y un
 * rótulo sin ayuda, 20 — sin igualarlos, las cajas de una fila arrancan
 * corridas. Con ayuda, el ⓘ va FUERA del `<label>` (adentro el campo se
 * anunciaba con el texto del botón).
 */
function Campo({ label, required, hint, className = "", children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  const rotulo = <>{label}{required && <span className="text-[var(--data-error-600)]">*</span>}</>;
  if (!hint) {
    return (
      <label className={`block ${className}`}>
        <span className="mb-1 flex min-h-6 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">{rotulo}</span>
        {children}
      </label>
    );
  }
  return (
    <div className={className}>
      <div className="mb-1 flex min-h-6 items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        <span aria-hidden="true" className="flex min-w-0 items-center gap-1 truncate">{rotulo}</span>
        <InfoTip icono="ayuda" title={label} what={hint} />
      </div>
      <label className="block">
        <span className="sr-only">{label}</span>
        {children}
      </label>
    </div>
  );
}
