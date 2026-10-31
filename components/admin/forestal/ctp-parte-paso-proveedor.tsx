"use client";

/**
 * Lo que la ficha pide a un PROVEEDOR, dentro de «Según el papel»: su categoría,
 * su código de CTP (aserradero), quién firma y —de sólo lectura— sus planes de
 * manejo y permisos (ADR-518: la ficha es la entidad; el permiso, su área y su
 * vigencia se cargan en el alta del plan).
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { CATEGORIAS_PARTE, CATEGORIA_LABEL } from "@/lib/forestal/directorio";
import { Field, I } from "./ctp-shared";
import CtpPartePlanes from "./ctp-parte-planes";
import { CHIP_BASE, CHIP_OFF, CHIP_ON } from "./ctp-parte-paso-quien";
import type { ParteFormEstado } from "./hooks/use-parte-form";

export default function CtpPartePasoProveedor({ form }: { form: ParteFormEstado }) {
  const { b, set, categoriaProveedor, dniRepresentanteMal } = form;
  return (
    <>
      <div className="sm:col-span-12">
        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
          Categoría
          <InfoTip
            title="Categoría"
            what="Qué es el proveedor: una empresa, una comunidad nativa (CCNN) o un aserradero con su propia planta."
            affects="Decide qué pide este bloque: un aserradero tiene su propio Código de CTP."
            example="Comunidad Nativa Santa Rosa de Chivis → CCNN"
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
      {categoriaProveedor === "aserradero" && (
        <Field
          label="Código de CTP"
          span={6}
          hint="El código que la ARFFS le dio a SU planta, no a la nuestra."
          ejemplo="25-UCA/CTP-2023-014"
          afecta="Sale en la guía cuando nos vende madera aserrada desde su planta."
        >
          <input type="text" className={`${I} font-mono`} value={b.codigoCtp ?? ""} onChange={(e) => set({ codigoCtp: e.target.value })} />
        </Field>
      )}
      <Field
        label="Representante legal"
        span={6}
        hint="Quien firma por la comunidad o la empresa: el jefe de la comunidad o el gerente."
        ejemplo="Juan Pérez Shahuano"
        afecta="Sale en el contrato y en la guía, debajo del titular (casillero 7)."
      >
        <input type="text" className={I} value={b.representante ?? ""} onChange={(e) => set({ representante: e.target.value })} />
      </Field>
      <Field
        label="DNI del representante"
        span={6}
        hint="Los 8 dígitos del DNI de quien firma."
        ejemplo="45678912"
        afecta="Va con su firma en el contrato y en la guía."
        error={dniRepresentanteMal}
      >
        <input
          type="text"
          inputMode="numeric"
          className={`${I} font-mono ${dniRepresentanteMal ? "border-[var(--data-error-500)]" : ""}`}
          value={b.representanteDni ?? ""}
          onChange={(e) => set({ representanteDni: e.target.value })}
        />
      </Field>
      {/* Sus planes y permisos, de SÓLO LECTURA (ADR-518): se cargan en el
          alta del plan de manejo, que es donde la ficha se ata a cada plan.
          Lo que la ficha vieja anotó del permiso se ve ahí, sin borrarse. */}
      <CtpPartePlanes form={form} />
    </>
  );
}
