"use client";

/**
 * El balance de un contrato (ADR-421): qué se puso y qué debería volver.
 *
 * Es sólo lectura: acá no se mueve plata, se explica. El orden es el de la
 * pregunta real —«¿cuánto llevo puesto en este permiso y a cuánto me sale el
 * m³?»— y recién después el detalle por bloque.
 *
 * Dos honestidades que la pantalla NO puede saltear:
 *  · lo que no se puede calcular se escribe «—», nunca «S/ 0»;
 *  · si hay ingresos sin precio, se dice CUÁNTOS arriba de todo: un balance al
 *    que le falta el costo de la materia prima miente por omisión, y el que lo
 *    lee no tiene cómo enterarse.
 */

import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Coins,
  RefreshCw,
  Scale,
  TreePine,
} from "@buleje/design-system/icons";
import { Kicker, SectionTitle, StatCard, WarningAlert } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPct } from "@/lib/forestal/cubicacion-formato";
import { useBalanceContrato } from "@/hooks/use-contratos";
import CtpContratoCuentas from "./CtpContratoCuentas";
import {
  ESTADO_CLASE,
  ESTADO_LABEL,
  TIPO_LABEL,
  hayEgresosImputados,
  hayMovimiento,
  soles,
  vigenciaTexto,
} from "./contratos-ui";

/** Una cifra grande del encabezado: rótulo arriba, número en mono abajo. */
function CifraHero({
  rotulo,
  valor,
  nota,
  parcial,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  /** El número existe pero le falta parte del dato: se dice, no se maquilla. */
  parcial?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Kicker as="p" className="text-[var(--text-tertiary)]">
        {rotulo}
      </Kicker>
      <p className="mt-1 font-mono text-[length:var(--ts-2xl)] font-black tabular-nums text-[var(--text-primary)] sm:text-[length:var(--ts-3xl)]">
        {valor}
      </p>
      <p
        className={`mt-1 text-sm ${
          parcial
            ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            : "text-[var(--text-secondary)]"
        }`}
      >
        {nota}
      </p>
    </div>
  );
}

export default function CtpContratoBalance({
  contratoId,
  onVolver,
}: {
  contratoId: string;
  onVolver: () => void;
}) {
  const { contrato, balance, resumen, cargando, error, recargar } = useBalanceContrato(contratoId);

  if (cargando && !balance) {
    return (
      <p className="flex items-center gap-2 px-1 py-8 text-sm text-[var(--text-tertiary)]">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Sumando los movimientos del
        contrato…
      </p>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void recargar()}
            className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-dark)] hover:bg-primary/10 dark:text-[var(--accent)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la lista
          </button>
        </div>
      </div>
    );
  }
  if (!contrato || !balance || !resumen) return null;

  const m = balance.madera;
  const sinValorizar = m.sinValorizar ?? 0;
  /** Ningún ingreso tiene precio: los egresos no incluyen la madera. */
  const todoSinPrecio = m.documentos > 0 && sinValorizar >= m.documentos;
  /** Sin egresos registrados no hay costo por m³ que mostrar: un «S/ 0 por m³»
   *  sería declarar un costo que nadie midió. */
  const costo = resumen.egresos > 0 ? resumen.costoPorM3 : null;
  /** Nada imputado todavía = «—». Un «S/ 0.00» diría que bajo este permiso no
   *  se puso plata, cuando lo cierto es que no se le imputó ninguna. */
  const egresos = hayEgresosImputados(balance) ? resumen.egresos : null;
  const porRecuperar = hayMovimiento(balance.adelantos, balance.cuentaCargos, balance.cuentaAbonos)
    ? resumen.porRecuperar
    : null;

  return (
    <div className="space-y-4">
      {/* ── Identidad del papel ── */}
      <header className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onVolver}
              className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Todos los contratos
            </button>
            <div className="flex items-center gap-1.5">
              <SectionTitle as="h2" className="font-mono break-all">
                {contrato.codigo}
              </SectionTitle>
              <InfoTip
                title="Balance del contrato"
                what="Todo se calcula al leer: nada se guarda como saldo."
                affects="Un movimiento entra a este balance cuando se registra con este contrato."
              />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {contrato.alias ? `${contrato.alias} · ` : ""}
              <b className="text-[var(--text-primary)]">{contrato.titularNombre}</b>
              {contrato.region ? ` · ${contrato.region}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">
              {contrato.tipo ? TIPO_LABEL[contrato.tipo] : "Tipo sin definir"} ·{" "}
              {vigenciaTexto(contrato.vigenciaDesde, contrato.vigenciaHasta)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO_CLASE[contrato.estado]}`}
            >
              {ESTADO_LABEL[contrato.estado]}
            </span>
            <button
              type="button"
              onClick={() => void recargar()}
              disabled={cargando}
              aria-label="Volver a sumar los movimientos"
              title="Volver a sumar los movimientos"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* ── Las dos cifras que se preguntan primero ── */}
      <section className="grid gap-5 rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--surface-sunken)] p-5 sm:grid-cols-2">
        <CifraHero
          rotulo="Egresos totales"
          valor={soles(egresos)}
          parcial={sinValorizar > 0}
          nota={
            egresos == null
              ? sinValorizar > 0
                ? `Los ${sinValorizar} ingresos de madera están sin precio: no hay nada que sumar todavía`
                : "Todavía no hay nada imputado a este contrato"
              : sinValorizar > 0
                ? `No incluye ${sinValorizar} ${sinValorizar === 1 ? "ingreso" : "ingresos"} de madera sin precio`
                : "Madera + gastos + fletes + adelantos entregados"
          }
        />
        <CifraHero
          rotulo="Costo por m³ recibido"
          valor={costo == null ? "—" : soles(costo)}
          parcial={sinValorizar > 0 && costo != null}
          nota={
            costo == null
              ? "Todavía no hay egresos cargados para este contrato"
              : sinValorizar > 0
                ? `Parcial: faltan ${sinValorizar} de ${m.documentos} ingresos por valorizar`
                : `Sobre ${fmtM3(m.m3 ?? 0)} m³ recibidos`
          }
        />
      </section>

      {sinValorizar > 0 && (
        <WarningAlert
          title={`${sinValorizar} de ${m.documentos} ingresos de madera no tienen precio cargado`}
          description={
            todoSinPrecio
              ? "Este balance suma gastos, fletes y adelantos, pero NO lo que costó la madera: el costo por m³ queda incompleto. El precio se carga en Ingresos, en el costo de cada guía."
              : "El costo por m³ está calculado sólo con los ingresos que sí tienen precio. El resto se carga en Ingresos, en el costo de cada guía."
          }
        />
      )}

      {/* ── Volumen: lo que entró y lo que salió de la sierra ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Madera recibida"
          value={`${fmtM3(m.m3 ?? 0)} m³`}
          icon={TreePine}
          subValue={`${m.documentos} ${m.documentos === 1 ? "ingreso" : "ingresos"} · ${todoSinPrecio ? "sin valorizar" : soles(m.monto)}`}
        />
        <StatCard
          label="Producción"
          value={`${fmtM3(balance.produccion.m3 ?? 0)} m³`}
          icon={Boxes}
          subValue={`${balance.produccion.documentos} ${balance.produccion.documentos === 1 ? "corrida" : "corridas"} bajo este contrato`}
        />
        <StatCard
          label="Rendimiento"
          value={resumen.rendimientoPct == null ? "—" : `${fmtPct(resumen.rendimientoPct)} %`}
          icon={Scale}
          subValue={
            resumen.rendimientoPct == null
              ? "Falta volumen recibido o producido"
              : "Del volumen que entró, cuánto salió como producto"
          }
        />
        <StatCard
          label="Por recuperar"
          value={<span className="font-mono">{soles(porRecuperar)}</span>}
          icon={Coins}
          emphasis={(porRecuperar ?? 0) > 0 ? "warning" : "neutral"}
          subValue={
            porRecuperar == null
              ? "Sin adelantos ni cuenta corriente bajo este contrato"
              : "Saldo de adelantos + neto de la cuenta corriente"
          }
        />
      </div>

      {/* ── El detalle, bloque por bloque ── */}
      <CtpContratoCuentas balance={balance} resumen={resumen} />
    </div>
  );
}
