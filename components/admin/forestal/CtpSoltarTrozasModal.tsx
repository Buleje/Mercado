"use client";

/**
 * CtpSoltarTrozasModal — «Soltar trozas» de una corrida (ADR-447 §6).
 *
 * Brandon, 28-09: la N° 61 tomó las 12 trozas de Cachimbo y cinco corridas del
 * 7 al 21/09 quedaron sin madera; la única salida era anular la corrida entera,
 * que borra también lo que produjo. Acá se marca qué trozas vuelven al patio: la
 * corrida conserva lo producido, baja la madera que entró y se recalcula lo que
 * rinde.
 *
 * Arriba el antes y el después (al instante, con la misma cuenta del servidor);
 * cuando la selección se queda quieta, qué corridas quedan listas para vincular
 * (lo mide el servidor con el diagnóstico de la bandeja). Se abre desde la
 * bandeja «¿De qué trozas salió?» y desde la ficha de la corrida. Nada se suelta
 * sin el motivo y el botón.
 */
import { useState } from "react";
import { Link2Off, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CorridaQueEspera, ResultadoSoltarTrozas } from "@/lib/forestal/soltar-trozas";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { Btn, I, ModalBody, ModalFooter } from "./ctp-shared";
import { AntesYDespues, AvisosDeSoltar, ListaDePiezas, QueQuedaListo } from "./ctp-soltar-trozas-partes";
import { useSoltarTrozas } from "./hooks/use-soltar-trozas";

export default function CtpSoltarTrozasModal({
  corridaId,
  lineNo,
  esperan = [],
  aboveModals = true,
  onClose,
  onListo,
}: {
  corridaId: string;
  /** Para el título mientras se lee la corrida. */
  lineNo?: number | null;
  /** Las corridas que esperan esta madera (desde la bandeja), para nombrarlas. */
  esperan?: readonly CorridaQueEspera[];
  /** Se abre desde otro modal (la ficha de la corrida): va por encima. */
  aboveModals?: boolean;
  onClose: () => void;
  onListo: (r: Extract<ResultadoSoltarTrozas, { ok: true }>) => void;
}) {
  const s = useSoltarTrozas(corridaId);
  const [intentado, setIntentado] = useState(false);
  const c = s.vista?.corrida ?? null;
  const n = s.marcadas.size;
  const nombre = `N.º ${c?.lineNo ?? lineNo ?? "—"}`;
  /* Lo que frena el acta entera apaga la lista; lo que depende de la selección
     sólo apaga el botón (se corrige desmarcando). */
  const acta = Boolean(c?.congelado || c?.mesCerrado);
  const frenado = acta || Boolean(s.previa?.imposible || s.previa?.sobreAtribuido);

  async function confirmar() {
    setIntentado(true);
    if (s.bloqueo || s.faltaMotivo) return;
    const r = await s.soltar();
    if (r) onListo(r);
  }

  const error =
    s.errorEnvio ??
    (intentado && s.bloqueo ? s.bloqueo : intentado && s.faltaMotivo ? "Escribe el motivo: queda en el rastro de la corrida." : null);

  return (
    <AdminModal
      open
      onClose={s.enviando ? () => {} : onClose}
      aboveModals={aboveModals}
      variant="info"
      icon={Link2Off}
      title={`Soltar trozas de la ${nombre}`}
      description={
        c
          ? `${c.especie ?? "Sin especie"} · ${etiquetaLarga(c.fecha)}${c.producido != null ? ` · ${fmtM3(c.producido)} m³ producidos` : " · sin producción declarada"} · lo producido no cambia`
          : "Leyendo la corrida…"
      }
      footer={
        <ModalFooter
          error={error}
          nota={
            <span className="font-mono tabular-nums">
              {n === 0 ? "Ninguna marcada" : `${n === 1 ? "1 troza" : `${n} trozas`} · ${fmtM3(s.previa?.sueltas.m3 ?? 0)} m³ vuelven al patio`}
            </span>
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={s.enviando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void confirmar()} disabled={s.enviando || !s.vista || n === 0 || frenado}>
            {s.enviando ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Link2Off aria-hidden className="h-4 w-4" />}
            {n === 0 ? "Soltar" : `Soltar ${n === 1 ? "1 troza" : `${n} trozas`}`}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        {s.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {s.error}
            <Btn size="sm" variant="secondary" onClick={() => void s.cargar()}>
              Reintentar
            </Btn>
          </div>
        )}
        {!s.vista && !s.error && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Leyendo las trozas de la corrida…
          </p>
        )}
        {s.vista && s.previa && s.vista.piezas.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">La {nombre} no tiene trozas atadas: no hay nada que soltar.</p>
        )}
        {s.vista && s.previa && c && s.vista.piezas.length > 0 && (
          <>
            <AntesYDespues previa={s.previa} />
            <AvisosDeSoltar corrida={c} previa={s.previa} nombre={nombre} />
            <QueQuedaListo destraba={s.destraba} midiendo={s.midiendo} marcadas={n} esperan={esperan} />
            <ListaDePiezas
              piezas={s.vista.piezas}
              marcadas={s.marcadas}
              sugerencia={s.sugerencia}
              deshabilitado={s.enviando || acta}
              onAlternar={s.alternar}
              onMarcar={s.marcar}
            />
            <div className="block text-sm">
              <span className="mb-1 flex items-center gap-1 font-bold text-[var(--text-secondary)]">
                <label htmlFor="soltar-trozas-motivo">Por qué vuelven al patio</label>
                <InfoTip
                  icono="ayuda"
                  title="Por qué se pide"
                  what="Cambiar la madera de una corrida deja rastro: quién, cuándo, qué trozas y por qué. Lo lee el que revise el libro."
                  example="Estas trozas no entraron el 27/09: son de las corridas del 7 al 21/09."
                />
              </span>
              <input
                id="soltar-trozas-motivo"
                type="text"
                value={s.motivo}
                maxLength={300}
                disabled={s.enviando}
                onChange={(e) => s.setMotivo(e.target.value)}
                placeholder="ej: son de las corridas del 7 al 21/09"
                aria-invalid={intentado && s.faltaMotivo}
                className={`${I} ${intentado && s.faltaMotivo ? "border-[var(--data-error-500)]" : ""}`}
              />
            </div>
          </>
        )}
      </ModalBody>
    </AdminModal>
  );
}
