/**
 * «Plata» — lo que la guía costó y si ya se pagó, en cuatro líneas (ADR-437).
 *
 * Sólo LEE: el mismo `GET /guias/plata?gtf=` del modal «Plata de la guía».
 * Cargar el costo, un flete o un pago se hace allá (botón del pie): dos lugares
 * que escriben la misma plata se desalinean en el primer retoque.
 * Nunca va al papel: la plata es de pantalla (memoria del documento de la guía).
 */

import { AlertTriangle, Coins, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PlataDeGuiaDTO } from "@/lib/forestal/plata-de-guia";
import { formatNumber } from "@/lib/format";
import { ChipPago, soles } from "../costo-guia/comun";
import { BOTON_BLOQUE, BloqueCargando, BloqueFicha, Cifra } from "./comun";

function LineaPersona({ persona }: { persona: NonNullable<PlataDeGuiaDTO["persona"]> }) {
  const n = persona.neto;
  const texto =
    Math.abs(n) < 0.005
      ? `Cuenta al día con ${persona.nombre}`
      : n < 0
        ? `Le debes ${soles(-n)} a ${persona.nombre}`
        : `${persona.nombre} te debe ${soles(n)}`;
  return (
    <p className={`truncate text-sm font-semibold ${n < -0.005 ? "text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]"}`} title={texto}>
      {texto}
    </p>
  );
}

export default function BloquePlata({
  dto,
  cargando,
  error,
  onReintentar,
  onAbrir,
  ocupado,
  indice,
}: {
  dto: PlataDeGuiaDTO | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  onAbrir?: () => void;
  ocupado: boolean;
  indice: number;
}) {
  const servicio = dto?.tipo === "servicio";
  const pago = dto?.pago ?? null;
  const pctPagado = pago && pago.monto > 0 ? Math.min(100, Math.round((pago.pagado / pago.monto) * 100)) : 0;
  const puesto = dto?.costoPuesto;

  return (
    <BloqueFicha
      titulo="Plata"
      plegable
      icono={Coins}
      indice={indice}
      info={
        <InfoTip
          title="Plata de la guía"
          what="Lo que costó la madera, lo que te costó puesta en el patio (con fletes y gastos) y cuánto le pagaste al proveedor."
          affects="Sin costo no hay margen en Rentabilidad. La madera de servicio no lleva costo: sólo fletes y gastos."
          example="Madera S/ 5 383,40 + flete S/ 400 = puesto en patio S/ 5 783,40."
        />
      }
      extra={pago ? <ChipPago estado={pago.estado} /> : undefined}
      pie={
        onAbrir ? (
          <button type="button" onClick={onAbrir} disabled={ocupado} className={BOTON_BLOQUE}>
            <Coins className="h-4 w-4" aria-hidden /> Abrir la plata
          </button>
        ) : undefined
      }
    >
      {cargando && !dto ? (
        <BloqueCargando filas={4} />
      ) : error && !dto ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-ink)]" aria-hidden />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={onReintentar} className={BOTON_BLOQUE}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : dto ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {servicio ? (
              <div className="min-w-0">
                <div className="text-lg font-bold text-[var(--text-primary)]">Servicio</div>
                <div className="truncate text-xs font-semibold text-[var(--text-tertiary)]">
                  {dto.dueno?.nombre ? `madera de ${dto.dueno.nombre}` : "madera de otro"}
                </div>
              </div>
            ) : dto.totalMadera == null ? (
              <div>
                <div className="text-lg font-bold text-[var(--data-warning-ink)]">Sin costo</div>
                <div className="text-xs font-semibold text-[var(--text-tertiary)]">madera</div>
              </div>
            ) : (
              <Cifra valor={soles(dto.totalMadera)} rotulo="madera" />
            )}
            {puesto && (servicio ? puesto.total > 0 : true) && (
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-mono text-lg font-bold tabular-nums leading-tight text-[var(--text-primary)]">
                  {puesto.incompleto ? "≥ " : ""}
                  {soles(puesto.total)}
                  {puesto.incompleto && (
                    <InfoTip
                      title="Todavía es un piso"
                      what={`Falta ${puesto.faltantes.join(" y ")}: el total es lo conocido hasta hoy, no el costo.`}
                    />
                  )}
                </div>
                <div className="text-xs font-semibold text-[var(--text-tertiary)]">
                  puesto en patio{puesto.porM3 != null ? ` · ${soles(puesto.porM3)}/m³` : ""}
                </div>
              </div>
            )}
          </div>

          {pago && (
            <div className="space-y-1">
              <div
                className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                role="progressbar"
                aria-label="Pagado de la guía"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pctPagado}
              >
                <div className="h-full rounded-full bg-[var(--data-success-500)]" style={{ width: `${pctPagado}%` }} />
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 text-sm tabular-nums">
                <span className="text-[var(--text-secondary)]">
                  Pagado <b className="font-mono text-[var(--text-primary)]">{soles(pago.pagado)}</b>
                </span>
                <span className="text-[var(--text-secondary)]">
                  Falta <b className={`font-mono ${pago.pendiente > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]"}`}>{soles(pago.pendiente)}</b>
                </span>
              </div>
            </div>
          )}

          {(dto.fletes.length > 0 || dto.gastos.length > 0) && (
            <p className="text-sm text-[var(--text-secondary)]">
              {dto.fletes.length > 0 && `${formatNumber(dto.fletes.length)} flete${dto.fletes.length === 1 ? "" : "s"}`}
              {dto.fletes.length > 0 && dto.gastos.length > 0 && " · "}
              {dto.gastos.length > 0 && `${formatNumber(dto.gastos.length)} gasto${dto.gastos.length === 1 ? "" : "s"}`}
            </p>
          )}
          {dto.persona && <LineaPersona persona={dto.persona} />}
          {!servicio && !dto.proveedor && !dto.persona && (
            <p className="text-sm text-[var(--text-tertiary)]">Sin proveedor enlazado para pagarle.</p>
          )}
          {dto.bloqueo && <p className="text-xs text-[var(--text-tertiary)]">{dto.bloqueo.mensaje}</p>}
        </div>
      ) : null}
    </BloqueFicha>
  );
}
