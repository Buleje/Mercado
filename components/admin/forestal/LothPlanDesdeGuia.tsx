"use client";

/**
 * «Crear el plan desde la guía» (24-10): la guía cita un título que el libro no
 * tiene. El plan sale con los datos de la guía (título, tipo, titular, ATFFS,
 * lugar) y lo autorizado lo escribe la persona —nunca se inventa—: de todas las
 * especies de la guía o de ninguna (sin volumen, el plan no frena nada). El
 * servidor crea plan, registro y el atado de la guía en una transacción
 * (`POST /loth/saldo-plan`); si el plan de ese título ya existe, 409 y se ofrece
 * atar la guía a ése.
 *
 * El plan nuevo nace con esta guía Y lo sin plan de otras guías (ADR-459: lo sin
 * plan cuenta en el saldo de todo plan): cada especie dice cuánto lleva ya y lo
 * autorizado no puede ser menos (`faltaDelMinimo`, la misma cuenta del servidor).
 *
 * Se abre desde la ventana «Atar lo que no tiene plan»: `aboveModals`.
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, FileCheck, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { faltaDelMinimo } from "@/lib/forestal/loth-atar-lo-suelto";
import type { GuiaSuelta, PlanCreadoDesdeLaGuia } from "@/lib/forestal/loth-saldo-plan-tipos";
import { crearPlanDesdeLaGuia } from "./hooks/use-loth-saldo-plan";
import { Btn, I } from "./ctp-shared";

const NUM = "text-right font-mono tabular-nums";

/** «12,5» o «12.5» → 12.5 (a 4 decimales); vacío = `null`; lo que no es número = `NaN`. */
function leerM3(texto: string): number | null {
  const s = texto.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 10_000) / 10_000;
}

/** Qué le falta al formulario para enviarse; `null` = se puede enviar. */
function faltaParaEnviar(guia: GuiaSuelta, titular: string, valores: readonly (number | null)[], techo: string): string | null {
  if (!titular.trim()) return "Escribe el titular del plan.";
  if (valores.some((v) => v != null && (!Number.isFinite(v) || v <= 0))) return `Lo ${techo} va en m³, mayor que cero.`;
  const escritas = valores.filter((v) => v != null).length;
  if (escritas > 0 && escritas < valores.length) return `Escribe lo ${techo} de todas las especies de la guía, o de ninguna.`;
  const corta = guia.propuesta.especies.find((e, i) => valores[i] != null && (valores[i] as number) < e.m3);
  if (corta) return `${corta.especie}: lo ${techo} no puede ser menos que lo que trae esta guía (${fmtM3(corta.m3)} m³).`;
  return faltaDelMinimo(guia.propuesta.especies, valores, guia.minimos, techo);
}

export default function LothPlanDesdeGuia({
  guia,
  onClose,
  onCreado,
  onAtarAExistente,
}: {
  guia: GuiaSuelta;
  onClose: () => void;
  onCreado: (plan: PlanCreadoDesdeLaGuia) => void;
  /** 409: ya hay un plan con ese título → atar la guía a ése. */
  onAtarAExistente: (planId: string) => void;
}) {
  const p = guia.propuesta;
  const techo = p.plantacion ? "registrado" : "autorizado";
  const [titular, setTitular] = useState(p.titularName ?? "");
  const [textos, setTextos] = useState<string[]>(() => p.especies.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existente, setExistente] = useState<string | null>(null);
  const valores = useMemo(() => textos.map(leerM3), [textos]);
  const falta = faltaParaEnviar(guia, titular, valores, techo);
  const sinVolumen = valores.every((v) => v == null);
  const lugar = [p.distrito, p.provincia, p.region].filter(Boolean).join(", ");
  const minimoDe = useMemo(() => new Map(guia.minimos.map((m) => [m.clave, m])), [guia.minimos]);
  const conOtras = guia.minimos.some((m) => m.otrasSinPlanM3 > 0);

  const crear = async () => {
    if (falta) return;
    setBusy(true);
    setError(null);
    const r = await crearPlanDesdeLaGuia(guia.gtfId, {
      titularName: titular.trim(),
      especies: sinVolumen ? [] : p.especies.map((e, i) => ({ especie: e.especie, volumenAutorizadoM3: valores[i] as number })),
    });
    setBusy(false);
    if (r.ok) onCreado(r.plan);
    else {
      setError(r.mensaje);
      setExistente(r.planExistente);
    }
  };

  return (
    <AdminModal
      aboveModals
      size="lg"
      open
      onClose={onClose}
      title={`Crear el plan desde la GTF ${guia.gtfNumber}`}
      description={`Con los datos de la guía. Lo ${techo} lo escribes tú: la guía no lo dice.`}
      icon={FileCheck}
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Btn>
          {existente ? (
            <Btn variant="primary" onClick={() => onAtarAExistente(existente)}>
              Atar la guía a ese plan
            </Btn>
          ) : (
            <Btn variant="primary" onClick={() => void crear()} disabled={busy || !!falta} title={falta ?? undefined}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck className="h-4 w-4" aria-hidden="true" />}
              Crear el plan y atar la guía
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--text-tertiary)]">{p.plantacion ? "Registro de plantación" : "Título habilitante"}</dt>
            <dd className="font-mono font-semibold text-[var(--text-primary)]">{p.codigo}</dd>
          </div>
          {p.arffs && (
            <div>
              <dt className="text-xs text-[var(--text-tertiary)]">ATFFS</dt>
              <dd className="text-[var(--text-primary)]">{p.arffs}</dd>
            </div>
          )}
          {lugar && (
            <div>
              <dt className="text-xs text-[var(--text-tertiary)]">Lugar</dt>
              <dd className="text-[var(--text-primary)]">{lugar}</dd>
            </div>
          )}
          {p.propietarioDoc && (
            <div>
              <dt className="text-xs text-[var(--text-tertiary)]">{p.propietarioDocTipo ?? "Documento"}</dt>
              <dd className="font-mono text-[var(--text-primary)]">{p.propietarioDoc}</dd>
            </div>
          )}
        </dl>

        <label htmlFor="plan-desde-guia-titular" className="block text-sm font-semibold text-[var(--text-secondary)]">
          Titular
        </label>
        <input id="plan-desde-guia-titular" value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={200} className={I} autoComplete="off" />

        <DataTable>
          <caption className="sr-only">Lo {techo} de cada especie de la guía</caption>
          <thead>
            <tr>
              <th scope="col">Especie</th>
              <th scope="col" className="text-right">En la guía m³</th>
              <th scope="col" className="text-right">{p.plantacion ? "Registrado" : "Autorizado"} m³</th>
            </tr>
          </thead>
          <tbody>
            {p.especies.map((e, i) => {
              const m = minimoDe.get(claveEspecie(e.especie));
              return (
              <tr key={e.especie}>
                <td data-label="Especie" className="font-semibold">
                  {e.especie}
                  <span className="block text-xs font-normal text-[var(--text-tertiary)]">
                    {e.trozas} {e.trozas === 1 ? "troza" : "trozas"}
                    {e.cientifico ? ` · ${e.cientifico}` : ""}
                  </span>
                  {m && m.otrasSinPlanM3 > 0 && (
                    <span className="block text-xs font-normal text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      + {fmtM3(m.otrasSinPlanM3)} m³ sin plan de otras guías · mínimo {fmtM3(m.minimoM3)} m³
                    </span>
                  )}
                </td>
                <td data-label="En la guía m³" className={NUM}>{fmtM3(e.m3)}</td>
                <td data-label={`${p.plantacion ? "Registrado" : "Autorizado"} m³`} className="text-right">
                  <input
                    aria-label={`${p.plantacion ? "Registrado" : "Autorizado"} de ${e.especie}, en m³`}
                    inputMode="decimal"
                    value={textos[i]}
                    onChange={(ev) => setTextos((t) => t.map((x, j) => (j === i ? ev.target.value : x)))}
                    placeholder={m && m.minimoM3 > 0 ? `mín. ${fmtM3(m.minimoM3)}` : "m³"}
                    className={`${I} w-32 text-right font-mono`}
                    autoComplete="off"
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </DataTable>

        {conOtras && !sinVolumen && (
          <p className="text-sm text-[var(--text-secondary)]">
            Lo sin plan de otras guías cuenta en el saldo de cada plan hasta que lo ates al suyo: el plan nuevo nace con eso usado.
          </p>
        )}
        {falta && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{falta}</p>}
        {sinVolumen && (
          <p className="flex items-start gap-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Sin lo {techo}, el plan no frena ninguna guía. Puedes escribirlo después en su ficha.</span>
          </p>
        )}
      </div>
    </AdminModal>
  );
}
