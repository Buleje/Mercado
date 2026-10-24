"use client";

/**
 * Revisar una captura de Yape/Plin antes de cobrar el fiado: quién pagó (lo
 * propone el servidor por nombre o por el final del celular), cuánto, y el
 * saldo que queda. Cobra por `POST /api/fiados/cobrar` (método yape, a la caja).
 * Si la ficha no tiene celular, la salida es «Abrir Fiados». Si ese N.º de
 * operación ya se cobró desde aquí, lo avisa y el botón dice «Cobrar otra vez».
 */

import { useEffect, useId, useState } from "react";
import { Smartphone, ExternalLink, AlertTriangle } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import { PUNTAJE_SEGURO, pagadorSugerido, type CamposYape, type PropuestaPapel, type RespuestaEntender } from "@/lib/admin/comandos-ia/papel";
import { MarcoPapel } from "./MarcoPapel";
import { anotarRecibo, buscarCobroConOperacion, cobrarConYape, type CobroYaHecho } from "./guardar-papel";
import { BOTON_SECUNDARIO, CAMPO, SIN_PERMISO, soles, permite } from "./formato";

type PropuestaCobro = Extract<PropuestaPapel, { destino: "cobro" }>;

const ETIQUETA = "text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]";
const FIADOS = "/admin?tab=plata&vista=fiados#plata";

export function RevisarCobro({ resultado: r, texto, rol, onCerrar, onDescartar, onGuardado }: {
  resultado: RespuestaEntender;
  texto: string;
  rol: string | null;
  onCerrar: () => void;
  onDescartar: () => void;
  onGuardado: (resumen: string) => void;
}) {
  const campos = r.campos as CamposYape;
  const { candidatos } = r.propuesta as PropuestaCobro;
  const [elegido, setElegido] = useState(candidatos[0] && candidatos[0].puntaje >= PUNTAJE_SEGURO ? 0 : -1);
  const [monto, setMonto] = useState(campos.monto ?? 0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaCobrado, setYaCobrado] = useState<CobroYaHecho | null>(null);
  const idCliente = useId();
  const idMonto = useId();
  const puede = permite(rol, "cobro");
  const quien = elegido >= 0 ? candidatos[elegido] : null;
  /* El mejor candidato, si no llegó al puntaje seguro y nadie está elegido: un clic, no un
     select. Sólo si se parece (≥0,2): un deudor con puntaje 0 no se sugiere para un desconocido. */
  const sugerido = !quien ? pagadorSugerido(candidatos) : null;

  /* La misma captura dos veces = dos ingresos a caja: el recibo `cobro` lleva el N.º de operación. */
  useEffect(() => {
    if (!puede || !campos.operacion) return;
    let vivo = true;
    buscarCobroConOperacion(campos.operacion)
      .then((c) => { if (vivo) setYaCobrado(c); })
      .catch((err) => logger.warn("[comandos-ia/papel] no pude revisar cobros previos", { err: String(err) }));
    return () => { vivo = false; };
  }, [campos.operacion, puede]);

  const motivo = !puede ? SIN_PERMISO.cobro
    : candidatos.length === 0 ? "Nadie te debe con ese nombre: revisa en Fiados."
    : !quien ? "Elige quién pagó."
    : quien.saldo <= 0 ? `${quien.nombre} no tiene fiados abiertos.`
    : !quien.telefono ? "Su ficha no tiene celular: cóbralo desde Fiados."
    : monto <= 0 ? "Pon el monto que llegó."
    : monto > quien.saldo + 0.009 ? `Llegó más de lo que debe (${soles(quien.saldo)}): cobra hasta su saldo.`
    : null;

  const cobrar = async () => {
    if (!quien?.telefono) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await cobrarConYape({ telefono: quien.telefono, monto, nombre: quien.nombre, operacion: campos.operacion });
      anotarRecibo({ tipo: "cobro", resumen: `Cobro por Yape a ${quien.nombre} · ${soles(res.totalCobrado)}`, costoIaUsd: r.costoIaUsd, refId: campos.operacion ?? undefined });
      onGuardado(`Cobrado ${soles(res.totalCobrado)} · queda ${soles(res.remaining)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar.");
    } finally {
      setGuardando(false);
    }
  };

  const sinCelular = puede && quien && quien.saldo > 0 && !quien.telefono;

  return (
    <MarcoPapel
      abierto
      onCerrar={onCerrar}
      titulo="Revisar pago por Yape"
      icono={Smartphone}
      costoIaUsd={r.costoIaUsd}
      error={error}
      motivo={motivo}
      onDescartar={onDescartar}
      textoLeido={texto}
      extra={sinCelular ? (
        <EnlacePanel href={FIADOS} apariencia="heredada" className={BOTON_SECUNDARIO}>
          <ExternalLink className="h-4 w-4" aria-hidden /> Abrir Fiados
        </EnlacePanel>
      ) : null}
      accion={puede && !sinCelular ? { texto: `${yaCobrado ? "Cobrar otra vez" : "Cobrar"} ${soles(monto)}`, onClick: () => void cobrar(), deshabilitada: !!motivo, ocupada: guardando } : null}
    >
      {yaCobrado && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
          <span>Este Yape ya se cobró el {formatDate(yaCobrado.fecha)}: {yaCobrado.resumen}.</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-1">
          <label htmlFor={idCliente} className={ETIQUETA}>Quién pagó · revisa</label>
          <select id={idCliente} value={elegido} onChange={(e) => setElegido(Number(e.target.value))} className={CAMPO}>
            <option value={-1}>Elige al cliente…</option>
            {candidatos.map((c, i) => (
              <option key={`${c.nombre}-${i}`} value={i}>
                {c.nombre}{c.saldo > 0 ? ` · debe ${soles(c.saldo)}` : " · sin deuda"}
              </option>
            ))}
          </select>
          {sugerido ? (
            <button type="button" onClick={() => setElegido(0)}
              className="inline-flex min-h-8 items-center text-left text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
              ¿Es {sugerido.nombre}? Elegirlo
            </button>
          ) : campos.nombre ? (
            <span className="block text-xs text-[var(--text-tertiary)]">La captura dice: {campos.nombre}</span>
          ) : null}
        </div>
        <div className="space-y-1">
          <label htmlFor={idMonto} className={ETIQUETA}>Monto · leído</label>
          <input id={idMonto} type="number" inputMode="decimal" min={0} step="0.01" value={monto}
            onChange={(e) => setMonto(Math.max(0, Number(e.target.value) || 0))} className={`${CAMPO} tabular-nums`} />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
        <div>
          <dt className={ETIQUETA}>N.º de operación</dt>
          <dd className="tabular-nums text-[var(--text-primary)]">{campos.operacion ?? "—"}</dd>
        </div>
        <div>
          <dt className={ETIQUETA}>Debe hoy</dt>
          <dd className="tabular-nums text-[var(--text-primary)]">{quien ? soles(quien.saldo) : "—"}</dd>
        </div>
        <div>
          <dt className={ETIQUETA}>Quedaría</dt>
          <dd className="font-semibold tabular-nums text-[var(--text-primary)]">{quien ? soles(Math.max(0, quien.saldo - monto)) : "—"}</dd>
        </div>
      </dl>
    </MarcoPapel>
  );
}
