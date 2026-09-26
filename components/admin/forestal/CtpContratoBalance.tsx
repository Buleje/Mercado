"use client";

/**
 * El balance de un contrato (ADR-421): qué se puso y qué debería volver.
 *
 * Es sólo lectura: acá no se mueve plata, se explica. El orden es el de la
 * pregunta real —«¿cuánto llevo puesto en este permiso y a cuánto me sale el
 * m³?»— y recién después el detalle por bloque.
 *
 * Desde ADR-432 es la sección «Plata» de la ficha del permiso
 * (`CtpContratoFicha`): la identidad del papel y el botón de volver viven en la
 * ficha; acá queda todo lo que había debajo, sin cambios. Los datos llegan de
 * la ficha, que los pide recién cuando se abre esta sección.
 *
 * Dos honestidades que la pantalla NO puede saltear:
 *  · lo que no se puede calcular se escribe «—», nunca «S/ 0»;
 *  · si hay ingresos sin precio, se dice CUÁNTOS arriba de todo: un balance al
 *    que le falta el costo de la materia prima miente por omisión, y el que lo
 *    lee no tiene cómo enterarse.
 */

import {
  AlertTriangle,
  Boxes,
  Coins,
  RefreshCw,
  Scale,
  TreePine,
} from "@buleje/design-system/icons";
import { Kicker, StatCard, WarningAlert } from "@buleje/design-system";
import { fmtM3, fmtPct } from "@/lib/forestal/cubicacion-formato";
import type { BalanceContrato, resumirBalance } from "@/lib/forestal/contratos";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CtpContratoCuentas from "./CtpContratoCuentas";
import { hayEgresosImputados, hayMovimiento, soles } from "./contratos-ui";

/**
 * La madera de servicio del permiso (ADR-437), en una línea: «8 guías de
 * servicio (WASACO) · 135,59 m³ — no llevan costo». Entró bajo el permiso pero
 * no se compró: se nombra para que el «sin precio» no la cuente y nadie la
 * busque en la plata. `null` si no hay.
 *
 * El balance trae `documentos` (asientos); si además trae `guias` y `duenos`
 * se dice por guía y con el dueño, que es como se habla en el patio.
 */
export function textoDeServicio(balance: BalanceContrato): string | null {
  const s = balance.servicio as (BalanceContrato["servicio"] & { guias?: number; duenos?: string[] }) | undefined;
  if (!s || s.documentos <= 0) return null;
  const n = s.guias ?? s.documentos;
  const que = s.guias != null ? (n === 1 ? "guía" : "guías") : n === 1 ? "ingreso" : "ingresos";
  const duenos = s.duenos && s.duenos.length > 0 ? ` (${s.duenos.join(", ")})` : "";
  return `${n} ${que} de servicio${duenos} · ${fmtM3(s.m3)} m³ — no llevan costo`;
}

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
  balance,
  resumen,
  cargando,
  error,
  recargar,
}: {
  balance: BalanceContrato | null;
  resumen: ReturnType<typeof resumirBalance> | null;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}) {
  /* Sin balance y sin error = todavía viaja (el primer cuadro después de abrir
     «Plata», antes de que el efecto marque `cargando`, también cuenta). */
  if ((cargando || !error) && !balance) {
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
        <button
          type="button"
          onClick={() => void recargar()}
          className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-dark)] hover:bg-primary/10 dark:text-[var(--accent)]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }
  if (!balance || !resumen) return null;

  const m = balance.madera;
  const sinValorizar = m.sinValorizar ?? 0;
  const servicio = textoDeServicio(balance);
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
              ? "Este balance suma gastos, fletes y adelantos, pero NO lo que costó la madera: el costo por m³ queda incompleto. Cárgalo en Ingresos → Opciones → Poner precio: por proveedor y especie, a todas sus guías de una vez."
              : "El costo por m³ está calculado sólo con los ingresos que sí tienen precio. El resto se carga en Ingresos → Opciones → Poner precio."
          }
        />
      )}

      {servicio && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <span className="font-bold text-[var(--text-primary)]">{servicio}</span>
          <InfoTip
            title="Madera de servicio"
            what="Entró bajo este permiso pero no la compraste: la asierras para su dueño."
            affects="No suma a los egresos ni al costo por m³; sí al rendimiento, porque la sierra la corta igual."
          />
        </p>
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
