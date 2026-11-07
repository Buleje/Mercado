"use client";

/**
 * «Vincular con el lote mixto» (ADR-441, pasos 7 y 8): la producción de un día
 * —una corrida por especie, cubicada en «Producir sin lote»— se ata a las
 * trozas del mixto de donde salió.
 *
 * Por cada corrida, `planDelMixto` propone TODAS las trozas libres de su
 * especie en el mixto o sus lotes hijos (decisión 1 del dueño); se destildan
 * las que no entraron y quedan como saldo en su lote. «Justo al 56 %» es la
 * alternativa manual. Firmar es sólo de dueño o administrador (decisión 2):
 * cambia un asiento que se presenta ante SERFOR.
 *
 * Tres puertas: la tarjeta del mixto en Consumos (con el día a elegir), el
 * modal de un día de producción y «Declarar producción» al registrar.
 */

import { useId, useMemo, useState } from "react";
import { CheckCircle2, Link2, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { fmtM3, fmtPct } from "@/lib/forestal/cubicacion-formato";
import { lineaDelMixto, ptDeCorrida } from "@/lib/forestal/lote-mixto-vista";
import { etiquetaLarga, hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { ModoDelMixto } from "@/lib/forestal/vincular-desde-mixto";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import { CAMPO, plural } from "./armar-lote-escaneo-partes";
import CtpVincularMixtoCorrida from "./CtpVincularMixtoCorrida";
import { useVincularMixto, type ResultadoFirma } from "./hooks/use-vincular-mixto";

const MODOS: { value: ModoDelMixto; label: string }[] = [
  { value: "todo", label: "Toda la madera" },
  { value: "justo56", label: "Justo al 56 %" },
];

/** Lo mismo que exige el servidor para `vincular-corrida` y `anular` (ADR-441, decisión 2). */
export const puedeFirmarVinculo = (rol: string | null) => rol === "admin" || rol === "owner";

export default function CtpVincularMixtoModal({
  dia: diaInicial,
  diaEditable = false,
  soloCorridas,
  mixtoId,
  onClose,
  onVinculado,
  aboveModals = false,
}: {
  /** `YYYY-MM-DD`. Sin él, hoy en Lima. */
  dia?: string;
  /** Desde la tarjeta del mixto: se elige el día acá. */
  diaEditable?: boolean;
  soloCorridas?: readonly string[];
  mixtoId?: string | null;
  onClose: () => void;
  /** Se firmó al menos una corrida: quien abrió relee lo suyo. */
  onVinculado?: (mensaje: string) => void;
  /** Se abre encima de otro modal (el día, Producir sin lote). */
  aboveModals?: boolean;
}) {
  const idDia = useId();
  const idMixto = useId();
  const [dia, setDia] = useState(() => diaInicial ?? hoyEnLima());
  const v = useVincularMixto({ dia, soloCorridas, mixtoInicial: mixtoId });
  const firma = puedeFirmarVinculo(useMiRol());
  const [resultado, setResultado] = useState<ResultadoFirma | null>(null);

  const ptPorCorrida = useMemo(() => new Map(v.corridasDelDia.map((c) => [c.id, ptDeCorrida(c)])), [v.corridasDelDia]);
  /* Las destildadas, por especie: cada corrida ofrece volver a tildar las suyas. */
  const destildadasPorEspecie = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const id of v.excluidas) {
      const k = claveEspecie(v.trozaPorId.get(id)?.especieComun);
      m.set(k, [...(m.get(k) ?? []), id]);
    }
    return m;
  }, [v.excluidas, v.trozaPorId]);
  const vinculables = v.plan.vinculables;

  const firmar = async () => {
    const r = await v.firmar();
    setResultado(r);
    if (r.hechas.length > 0) {
      onVinculado?.(
        `${plural(r.hechas.length, "corrida vinculada", "corridas vinculadas")} con ${v.mixto?.code ?? "el lote mixto"}.`,
      );
    }
  };

  const nota = !firma
    ? "Vincular es del dueño o de un administrador: cambia el asiento que va a SERFOR."
    : v.mixto?.status === "abierto" && vinculables > 0
      ? `${v.mixto.code} sigue abierto: al firmar se reparte primero en sus lotes.`
      : null;

  return (
    <AdminModal
      open
      aboveModals={aboveModals}
      onClose={v.firmando ? () => undefined : onClose}
      variant="info"
      icon={Link2}
      title="Vincular con el lote mixto"
      description={`${etiquetaLarga(dia)} · ${plural(v.plan.propuestas.length, "corrida", "corridas")}`}
      footer={
        <ModalFooter nota={resultado ? null : nota}>
          <Btn variant={resultado ? "primary" : "secondary"} onClick={onClose} disabled={v.firmando}>
            {resultado ? "Listo" : "Cerrar"}
          </Btn>
          {!resultado && firma && (
            <Btn variant="primary" onClick={() => void firmar()} disabled={v.firmando || vinculables === 0}>
              {v.firmando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
              {vinculables === 0 ? "Firmar" : vinculables === 1 ? "Firmar 1 corrida" : `Firmar ${vinculables} corridas`}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {resultado ? (
          <Resultado resultado={resultado} />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              {diaEditable && (
                <label htmlFor={idDia} className="block text-sm">
                  <span className="mb-1 block font-bold text-[var(--text-secondary)]">Día de la producción</span>
                  <input id={idDia} type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className={`${CAMPO} w-auto`} />
                </label>
              )}
              <label htmlFor={idMixto} className="block min-w-0 flex-1 basis-[16rem] text-sm">
                <span className="mb-1 block font-bold text-[var(--text-secondary)]">¿De qué lote mixto salió?</span>
                <select id={idMixto} value={v.mixto?.id ?? ""} onChange={(e) => v.elegirMixto(e.target.value)} className={CAMPO} disabled={v.candidatos.length === 0}>
                  {v.candidatos.length === 0 && <option value="">No hay lotes mixtos</option>}
                  {v.candidatos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {lineaDelMixto({ code: m.code, status: m.status, piezas: m.status === "abierto" ? m.resumen.piezas : m.lotes.reduce((a, l) => a + l.piezas, 0), especies: m.resumen.especies })}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1.5">
                <SegmentedControl value={v.modo} onChange={v.setModo} size="sm" label="Cuánta madera se propone" options={MODOS} />
                <InfoTip
                  title="Cuánta madera se propone"
                  what="«Toda la madera»: el mixto entró entero a la sierra, así que van TODAS las trozas de la especie de cada corrida. Destilda las que no entraron."
                  affects="«Justo al 56 %»: sólo las trozas que hacen falta para llegar al tope de la plaza. Lo que no va queda como saldo en su lote."
                  example="Tornillo 2,9 m³ producidos: con toda la madera van 14 trozas (5,2 m³, 56 %); justo al 56 % irían las que sumen 5,18 m³."
                  side="left"
                />
              </div>
            </div>

            {v.error && (
              <p role="alert" className="rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
                No se pudo leer todo: {v.error}
              </p>
            )}
            {/* Sin el mixto, el patio y el día leídos, la propuesta diría «no hay
                trozas» de algo que todavía no llegó. */}
            {v.cargando ? (
              <p className="flex items-center gap-2 py-6 text-base text-[var(--text-tertiary)]">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Leyendo el día y el lote mixto…
              </p>
            ) : v.plan.propuestas.length === 0 ? (
              <p className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-5 text-center text-base text-[var(--text-secondary)]">
                Ese día no tiene corridas declaradas.
              </p>
            ) : (
              v.plan.propuestas.map((p) => (
                <CtpVincularMixtoCorrida
                  key={p.corrida.id}
                  propuesta={p}
                  ptProducido={ptPorCorrida.get(p.corrida.id) ?? 0}
                  trozaPorId={v.trozaPorId}
                  destildadas={destildadasPorEspecie.get(claveEspecie(p.corrida.especie)) ?? []}
                  onAlternar={v.alternar}
                  bloqueado={v.firmando || !firma}
                />
              ))
            )}

            {v.plan.saldo.length > 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                <b>Queda como saldo:</b>{" "}
                {v.plan.saldo
                  .map((s) => `${s.code ?? s.especie ?? "lote"} ${plural(s.piezas, "troza", "trozas")} (${fmtM3(s.volumenM3)} m³)`)
                  .join(" · ")}
              </p>
            )}
            {v.plan.especiesSinCorrida.length > 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                <b>Sin corrida ese día:</b>{" "}
                {v.plan.especiesSinCorrida.map((e) => `${e.especie} ${plural(e.piezas, "troza", "trozas")}`).join(" · ")}
              </p>
            )}
            {v.plan.noVan.length > 0 && (
              <details className="text-sm text-[var(--text-secondary)]">
                <summary className="min-h-11 cursor-pointer py-2 font-bold">
                  {plural(v.plan.noVan.length, "troza del mixto no puede ir", "trozas del mixto no pueden ir")}
                </summary>
                <ul className="space-y-0.5 pl-4">
                  {v.plan.noVan.map((t) => (
                    <li key={t.id}>
                      {t.codigo ?? t.id.slice(-6)}: {t.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}

function Resultado({ resultado }: { resultado: ResultadoFirma }) {
  return (
    <div className="space-y-2">
      {resultado.repartidos.length > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">Se repartió antes en {resultado.repartidos.join(", ")}.</p>
      )}
      {resultado.hechas.length > 0 && (
        <ul role="status" className="space-y-2 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 p-3">
          {resultado.hechas.map((h) => (
            <li key={h.corridaId} className="flex items-start gap-2 text-base text-[var(--text-primary)]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden />
              <span>
                <b>
                  {h.lineNo != null ? `N° ${h.lineNo} · ` : ""}
                  {h.especie ?? "Corrida"}
                </b>{" "}
                · {plural(h.piezas, "troza", "trozas")} · <span className="tabular-nums">{fmtM3(h.volumenM3)} m³</span>
                {h.rendimientoPct != null && <> · rendimiento <span className="tabular-nums">{fmtPct(h.rendimientoPct)} %</span></>}
                {h.sobreElTope && (
                  <span className="block text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
                    Pasa el 56 % de la plaza: quedó con su rendimiento real.
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resultado.error && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          {resultado.error.lineNo != null ? `N° ${resultado.error.lineNo} · ${resultado.error.especie ?? ""}: ` : ""}
          {resultado.error.mensaje}
          {resultado.hechas.length > 0 && ` (las ${resultado.hechas.length} de arriba sí quedaron)`}
        </p>
      )}
      {resultado.hechas.length === 0 && !resultado.error && (
        <p className="text-base text-[var(--text-secondary)]">No había nada que vincular.</p>
      )}
    </div>
  );
}
