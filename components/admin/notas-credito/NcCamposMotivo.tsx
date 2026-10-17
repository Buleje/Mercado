"use client";

import { Field } from "@/components/admin/shared/Field";
import type { CamposMotivo } from "@/components/admin/notas-credito/hooks/use-nc-documento";

const INPUT = "w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30";
const ROTULO = "block text-sm font-bold text-[var(--text-secondary)] mb-1";

/**
 * Los campos propios del motivo (F11, 17-10): 03 pide lo que salió y cómo debe decir; 02, el RUC que
 * salió y el correcto. Se suman al texto del motivo (`descripcionArmada`). Los demás motivos no piden nada.
 */
export default function NcCamposMotivo({ codigo, campos, setCampos }: {
  codigo: string;
  campos: CamposMotivo;
  setCampos: (f: (prev: CamposMotivo) => CamposMotivo) => void;
}) {
  if (codigo === "03") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Decía" labelClassName={ROTULO}>
          <input value={campos.decia} onChange={(e) => setCampos((p) => ({ ...p, decia: e.target.value }))} placeholder="Arroz Costeño 1 kg" className={INPUT} />
        </Field>
        <Field label="Debe decir" labelClassName={ROTULO}>
          <input value={campos.debeDecir} onChange={(e) => setCampos((p) => ({ ...p, debeDecir: e.target.value }))} placeholder="Arroz Costeño 5 kg" className={INPUT} />
        </Field>
      </div>
    );
  }
  if (codigo === "02") {
    const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 11);
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="RUC que salió" labelClassName={ROTULO}>
          <input inputMode="numeric" value={campos.rucMal} onChange={(e) => setCampos((p) => ({ ...p, rucMal: soloDigitos(e.target.value) }))} placeholder="20100000001" className={INPUT} />
        </Field>
        <Field label="RUC correcto" labelClassName={ROTULO}>
          <input inputMode="numeric" value={campos.rucBien} onChange={(e) => setCampos((p) => ({ ...p, rucBien: soloDigitos(e.target.value) }))} placeholder="20100000002" className={INPUT} />
        </Field>
      </div>
    );
  }
  return null;
}
