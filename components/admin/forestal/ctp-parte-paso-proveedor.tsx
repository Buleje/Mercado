"use client";

/**
 * Lo que la ficha pide a un PROVEEDOR, dentro de «Según el papel»: su categoría,
 * con qué título extrae (CCNN) o su código de CTP (aserradero), quién firma y
 * todos sus permisos (ADR-425).
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATEGORIAS_PARTE, CATEGORIA_LABEL } from "@/lib/forestal/directorio";
import { TIPOS_PLAN_LISTA } from "@/lib/forestal/loth-tipos-plan";
import { Field, I } from "./ctp-shared";
import { SelectConOtra } from "./campos-elegibles";
import CtpPartePermisos from "./CtpPartePermisos";
import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "./ctp-parte-paso-quien";
import type { ParteFormEstado } from "./hooks/use-parte-form";

/** Los documentos de gestión de la norma — el casillero (10) de la guía. */
const DOCUMENTOS_DE_GESTION = TIPOS_PLAN_LISTA.map((t) => t.sigla);

export default function CtpPartePasoProveedor({ form }: { form: ParteFormEstado }) {
  const { b, set, categoriaProveedor, vigencia, arffsDeLaLibreta, dniRepresentanteMal } = form;
  return (
    <>
      <div className="sm:col-span-12">
        <span className="mb-1.5 flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
          Categoría
          <InfoTip
            title="Categoría"
            what="Decide qué pide este bloque."
            affects="Una CCNN extrae con título habilitante; un aserradero tiene su propio Código de CTP."
          />
        </span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS_PARTE.map((cat) => {
            const on = categoriaProveedor === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={on}
                onClick={() => set({ categoria: cat })}
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {CATEGORIA_LABEL[cat]}
              </button>
            );
          })}
        </div>
      </div>
      {categoriaProveedor === "ccnn" && (
        <>
          <Field label="Título habilitante" span={4} hint="Permiso, concesión o plantación con la que extrae">
            <input type="text" className={I} value={b.tituloHabilitante ?? ""} onChange={(e) => set({ tituloHabilitante: e.target.value })} />
          </Field>
          {/* Los tres casilleros que la guía pide del titular y que, sin
              esto, había que tipear en cada guía: (8) resolución, (9)
              plan de manejo y (2) autoridad. */}
          <Field label="N° de resolución" span={4} hint="Casillero (8) de la GTF">
            <input type="text" className={I} value={b.resolucion ?? ""} onChange={(e) => set({ resolucion: e.target.value })} />
          </Field>
          <Field label="Plan de manejo" span={4} hint="Casillero (9) — el documento con el que aprovecha">
            {/* Lista y no texto libre: son los documentos de gestión de
                la norma (`loth-tipos-plan`), los mismos que ofrece el
                alta de plan del Libro TH. */}
            <SelectConOtra
              className={I}
              valor={b.planManejo ?? ""}
              opciones={DOCUMENTOS_DE_GESTION}
              textoOtra="Otro documento…"
              placeholder="DEMA"
              onCambio={(v) => set({ planManejo: v })}
            />
          </Field>
          {/* Comprarle a alguien con el título vencido invalida la GTF
              que se emita con esa madera: es un dato de riesgo. */}
          <Field
            label="Su título vence el"
            span={6}
            hint={vigencia.nivel === "sin_dato" ? "Para que el sistema avise antes de comprarle" : vigencia.texto}
          >
            <input
              type="date"
              className={`${I} ${
                vigencia.tono === "danger"
                  ? "border-[var(--data-error-500)]"
                  : vigencia.tono === "warn"
                    ? "border-[var(--data-warning-500)]"
                    : ""
              }`}
              value={(b.tituloVigenciaHasta ?? "").slice(0, 10)}
              onChange={(e) => set({ tituloVigenciaHasta: e.target.value })}
            />
          </Field>
          {vigencia.nivel === "vencido" && (
            <p className="col-span-12 rounded-xl border border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              {vigencia.texto}. Pídele la renovación antes de registrar un ingreso con su guía.
            </p>
          )}
          <Field label="ARFFS competente" span={6} hint="Casillero (2) — la autoridad regional del titular">
            {/* De lo ya escrito en la libreta: la misma autoridad estaba
                cargada de tres formas distintas entre fichas y permisos. */}
            <SelectConOtra
              className={I}
              valor={b.arffs ?? ""}
              opciones={arffsDeLaLibreta}
              textoOtra="Otra autoridad…"
              placeholder="ATFFS Selva Central"
              onCambio={(v) => set({ arffs: v })}
            />
          </Field>
        </>
      )}
      {categoriaProveedor === "aserradero" && (
        <Field label="Código de CTP" span={6} hint="El código que le dio ARFFS a SU planta, no la nuestra">
          <input type="text" className={`${I} font-mono`} value={b.codigoCtp ?? ""} onChange={(e) => set({ codigoCtp: e.target.value })} />
        </Field>
      )}
      <Field label="Representante legal" span={6} hint="El que firma; cuelga del (7)">
        <input type="text" className={I} value={b.representante ?? ""} onChange={(e) => set({ representante: e.target.value })} />
      </Field>
      <Field label="DNI del representante" span={6} hint={dniRepresentanteMal ?? "El jefe de la comunidad o el gerente que firma"}>
        <input
          type="text"
          aria-invalid={dniRepresentanteMal ? true : undefined}
          className={`${I} font-mono ${dniRepresentanteMal ? "border-[var(--data-error-500)]" : ""}`}
          value={b.representanteDni ?? ""}
          onChange={(e) => set({ representanteDni: e.target.value })}
        />
      </Field>
      {/* Los campos de arriba guardan UN papel — el último que alguien
          escribió. Acá van TODOS los que maneja el titular, cada uno
          con su área y su vigencia (ADR-425). */}
      <CtpPartePermisos
        parteId={b.id ?? null}
        titular={{ id: b.id ?? null, nombre: b.nombre, docTipo: b.docTipo, docNumero: b.docNumero }}
        arffsDeLaFicha={b.arffs}
        pendientes={form.permisosPendientes}
        onPendientes={form.setPermisosPendientes}
        onConteo={form.setPermisosDelTitular}
      />
    </>
  );
}
