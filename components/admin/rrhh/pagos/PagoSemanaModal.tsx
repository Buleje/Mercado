"use client";

/**
 * PagoSemanaModal — «Avisos de pago al personal todos los sábados» (Brandon
 * 24-10). Por persona: lo ganado de lunes a domingo, los adelantos de planilla
 * que se le descuentan y el neto que le entregas. «Pagar» anota en UNA
 * transacción el gasto en Mi Plata, cierra esos adelantos y, si eliges, saca
 * el neto de la caja abierta. Dos clics no pagan dos veces.
 */

import { ChevronLeft, ChevronRight, HandCoins, Wallet } from "@buleje/design-system/icons";
import { DataTable, EmptyState, ErrorAlert, LoadingState, StatCard } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Casilla } from "@/components/ui-system/Casilla";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { semanaDe, sumarDias } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";
import { AvisoRrhh, BOTON, CLASE_CAMPO } from "../rrhh-form";
import { formatearPEN, pluralizar } from "../rrhh-ui";
import FilaPagoSemana from "./FilaPagoSemana";
import type { ComoPagas, MetodoPago, PagoSemana } from "./use-pago-semana";

interface Props {
  pago: PagoSemana;
  onClose: () => void;
  onDarAdelanto: (colaboradorId?: string) => void;
}

const COMO_INICIAL: ComoPagas = { metodo: "efectivo", saleDeCaja: false };

export default function PagoSemanaModal({ pago, onClose, onDarAdelanto }: Props) {
  const { datos, desde, setDesde, cargando, error, ocupado, recargar } = pago;
  const [como, setComo] = useLocalStorage<ComoPagas>("rrhh:pago-semana:como", COMO_INICIAL);
  const estaSemana = semanaDe(limaDateKey()).desde;
  const t = datos?.totales;

  return (
    <AdminModal
      open
      onClose={onClose}
      title={datos?.esDiaDePago ? "Hoy se paga" : "Pago de la semana"}
      icon={Wallet}
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => onDarAdelanto()} className={BOTON.secundario}>
            <HandCoins className="h-4 w-4" /> Dar adelanto
          </button>
          <button type="button" onClick={onClose} className={BOTON.secundario}>
            Cerrar
          </button>
        </div>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Semana anterior"
            onClick={() => setDesde(sumarDias(desde, -7))}
            className={BOTON.icono}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {datos ? `Del ${datos.periodo.replace(/^del /, "")}` : "…"}
          </span>
          <button
            type="button"
            aria-label="Semana siguiente"
            disabled={desde >= estaSemana}
            onClick={() => setDesde(sumarDias(desde, 7))}
            className={BOTON.icono}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          {desde !== estaSemana && (
            <button
              type="button"
              onClick={() => setDesde(estaSemana)}
              className={BOTON.chicoFantasma}
            >
              Esta semana
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              Pagas con
              <select
                value={como.metodo}
                onChange={(e) => setComo({ ...como, metodo: e.target.value as MetodoPago })}
                className={`${CLASE_CAMPO} w-40`}
              >
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
            {como.metodo === "efectivo" && (
              <label className="flex min-h-12 cursor-pointer items-center gap-2 text-sm text-[var(--text-primary)]">
                <Casilla
                  checked={como.saleDeCaja}
                  onChange={(e) => setComo({ ...como, saleDeCaja: e.target.checked })}
                />
                Sale de la caja abierta
              </label>
            )}
            <InfoTip
              title="Cómo se anota"
              what="Cada pago queda como un gasto «Personal» en Mi Plata por lo ganado, y sus adelantos de planilla se cierran con el descuento."
              affects="Si sale de la caja, el neto que le entregas se anota como retiro de la caja abierta."
              example="Ganó S/ 420, tenía S/ 50 de adelanto: gasto S/ 420, adelanto cerrado, le entregas S/ 370."
              side="left"
            />
          </div>
        </div>

        {t && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Por pagar"
              value={pluralizar(t.porPagar, "persona", "personas")}
              density="compact"
              emphasis={t.porPagar > 0 ? "warning" : "neutral"}
            />
            <StatCard
              label="Neto a entregar"
              value={formatearPEN(t.netoPorPagar)}
              density="compact"
            />
            <StatCard
              label="Adelantos a descontar"
              value={formatearPEN(t.adelantosPorDescontar)}
              density="compact"
            />
            <StatCard
              label="Ya pagados"
              value={pluralizar(t.pagados, "persona", "personas")}
              subValue={t.pagados > 0 ? `${formatearPEN(t.netoPagado)} entregado` : undefined}
              density="compact"
              emphasis={t.pagados > 0 ? "success" : "neutral"}
            />
          </div>
        )}

        {t && t.faltaDefinir > 0 && (
          <AvisoRrhh tono="aviso">
            A {pluralizar(t.faltaDefinir, "persona", "personas")} les falta definir el pago: escribe
            el monto en su fila o ponle tarifa en su ficha.
          </AvisoRrhh>
        )}

        {cargando && !datos && <LoadingState message="Calculando el pago de la semana..." />}
        {error && (
          <ErrorAlert
            description={error}
            action={
              <button type="button" onClick={() => void recargar()} className={BOTON.chico}>
                Reintentar
              </button>
            }
          />
        )}
        {datos && datos.filas.length === 0 && (
          <EmptyState
            icon={Wallet}
            title="Sin personal esta semana"
            description="Agrega personas desde Personal."
          />
        )}
        {datos && datos.filas.length > 0 && (
          // En el celular cada persona es una tarjeta (`.admin-mobile-cards`, globals.css).
          <div className="admin-mobile-cards">
            <DataTable zebra>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="text-right">Ganado</th>
                  <th className="text-right">Adelantos</th>
                  <th className="text-right">Neto</th>
                  <th className="text-right">Pago</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f) => (
                  <FilaPagoSemana
                    key={f.colaboradorId}
                    fila={f}
                    como={como}
                    ocupado={ocupado === f.colaboradorId}
                    bloqueado={ocupado != null && ocupado !== f.colaboradorId}
                    onPagar={(monto) => pago.pagar(f, como, monto)}
                    onDeshacer={() => pago.deshacer(f)}
                    onDarAdelanto={() => onDarAdelanto(f.colaboradorId)}
                  />
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
