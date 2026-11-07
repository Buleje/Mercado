"use client";

/**
 * Lo central del mes en una franja: cuánto ENTRÓ, cuánto SALIÓ, cuánto QUEDÓ,
 * y lo que FALTA (lo que te deben y lo que debes hoy).
 *
 * POR QUÉ (medido 2026-10-11 en `main`, 1280 px): el Resumen abría con un
 * selector de período que no cambiaba ninguna cifra, tres avisos que repetían
 * tarjetas de abajo («S/ 150 en fiados», «Balance negativo»), dos tarjetas de
 * deudas y OCHO indicadores; el gráfico empezaba a los 1 000 px. Cuatro de
 * esos ocho eran una parte de otra cifra («Fiados pendientes» ⊂ «Te deben»,
 * «Deuda proveedores» ⊂ «Debes»), el margen es la nota al pie de lo que quedó,
 * el IGV tiene su bloque y su pestaña, y el «punto de equilibrio» era el gasto
 * registrado ÷ días: otro número con el nombre del de Rentabilidad.
 *
 * Entró, salió y quedó son los totales de Resultado › Ganancias (el servidor
 * los arma, acá no se suma nada): cada cifra lleva a su detalle.
 */

import { TrendingDown, TrendingUp, Scale, CreditCard, ReceiptText, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import type { CifraDeDeuda, DeudasDelNegocio } from "./deudas-del-negocio";
import type { MesResumen } from "./tipos";

const soles = (v: number, signo = false) =>
  `${v < 0 ? "−" : signo && v > 0 ? "+" : ""}${formatCurrency(Math.abs(v), { decimals: 0 })}`;
const enMonedas = (xs: CifraDeDeuda["montos"]) => xs.map((x) => montoEnMoneda(x.monto, x.moneda)).join(" · ");

interface Ayuda { what: string; affects: string; example: string }

/** Una celda: rótulo con su ⓘ arriba y la cifra como botón a su detalle (el ⓘ no va dentro del botón). */
function Celda({ rotulo, icon: Icon, ayuda, cifra, tono, sub, destino, verQue, className }: {
  rotulo: string;
  icon: LucideIcon;
  ayuda: Ayuda;
  cifra: string;
  tono?: "bien" | "mal";
  sub: React.ReactNode;
  destino: string;
  verQue: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 bg-[var(--surface-raised)] px-4 pb-3 pt-3", className)}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-sm font-bold text-[var(--text-secondary)]">{rotulo}</span>
        <InfoTip title={rotulo} what={ayuda.what} affects={ayuda.affects} example={ayuda.example} />
      </div>
      <button
        type="button"
        onClick={() => irAlOrigen({ tab: "plata", params: { vista: destino } })}
        aria-label={`${rotulo}: ${cifra}. Ver ${verQue}`}
        title={`Ver ${verQue}`}
        className="group mt-0.5 block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]"
      >
        {/* Sin partir «S/» del número; una cifra larga baja un tamaño (como Te deben). */}
        <span
          className={cn(
            "block whitespace-nowrap font-extrabold tabular-nums",
            /* A 1280 px cada celda mide ~190 px: «S/ 4,656.34» en 2xl llegaba al borde. */
            cifra.length > 9 ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
            tono === "bien" && "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
            tono === "mal" && "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
            !tono && "text-[var(--text-primary)]",
          )}
        >
          {cifra}
        </span>
        {/* Cada dato de la nota en su renglón: con «·» partían a mitad de frase. */}
        <span className="mt-0.5 flex flex-col text-sm text-[var(--text-tertiary)]">
          {sub}
        </span>
      </button>
    </div>
  );
}

/** «▲ 12 % vs set.»: el mes contra el anterior. Sin base (0) o fuera de escala, nada. */
function Delta({ actual, previo, mes, inverso }: { actual: number; previo: number; mes: string; inverso?: boolean }) {
  if (previo === 0) return <span>nada en {mes}</span>;
  const pct = Math.round(((actual - previo) / Math.abs(previo)) * 100);
  if (!Number.isFinite(pct) || Math.abs(pct) > 999) return <span>fuera de escala contra {mes}</span>;
  const sube = pct > 0;
  const buena = pct === 0 ? null : inverso ? !sube : sube;
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        buena === true && "text-[var(--data-success-ink)]",
        buena === false && "text-[var(--data-error-ink)]",
      )}
    >
      {sube ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct)} % vs {mes}
    </span>
  );
}

const AYUDA: Record<"entro" | "salio" | "quedo" | "teDeben" | "debes", Ayuda> = {
  entro: {
    what: "Lo que vendiste y cobraste por servicios en el mes: es el total de Ingresos de Ganancias.",
    affects: "El descuento de una venta ya está restado: cuenta lo que cobraste, no el precio de lista.",
    example: "Vendiste S/ 1 000 en el mostrador y S/ 200 por la tienda: entró S/ 1 200.",
  },
  salio: {
    what: "Tus gastos registrados más el costo de lo que vendiste (mercadería y madera), el aserrío, los fletes y la planilla.",
    affects: "Es el total de Costos de Ganancias. Si tu usuario no ve Ganancias, aquí van sólo tus gastos registrados.",
    example: "La mercadería que vendiste te costó S/ 700 y pagaste S/ 150 de luz: salió S/ 850.",
  },
  quedo: {
    what: "Entró menos salió: lo que ganaste (o perdiste) en el mes.",
    affects: "El margen es lo que quedó ÷ lo que entró. Sin ingresos, o fuera de ±999 %, no se muestra.",
    example: "Entró S/ 1 200 y salió S/ 850: quedó S/ 350, un margen de 29 %.",
  },
  teDeben: {
    what: "Todo lo que te deben hoy: fiados, préstamos y adelantos que diste, y madera despachada a cuenta. Es el total de «Por cobrar».",
    affects: "Los fiados son una parte de esta cifra. Cada moneda va aparte.",
    example: "Un fiado de S/ 30 y una venta de madera a cuenta de S/ 12 323 suman S/ 12 353.",
  },
  debes: {
    what: "Todo lo que debes hoy: adelantos que te dieron, cuentas por pagar a proveedores, préstamos y cuentas forestales a favor de la otra parte. Es el total de «Lo que debo».",
    affects: "Lo de proveedores es una parte de esta cifra. Si a alguien le debes y a la vez te debe, las dos cifras lo cuentan entero.",
    example: "Si alguien te adelantó S/ 3 031 y te debe S/ 12 323 de madera, verás S/ 3 031 acá y S/ 12 323 en Te deben.",
  },
};

export interface CifrasDelMesProps {
  kpis: Record<string, number>;
  monthlyData: MesResumen[];
  deudas: DeudasDelNegocio;
  /** Montos vencidos que trae el tablero (kpis-v2): fiados y cuentas por pagar. */
  vencidos: { fiados: number; pagos: number };
}

export default function CifrasDelMes({ kpis, monthlyData, deudas, vencidos }: CifrasDelMesProps) {
  const ingresos = kpis.ingresos ?? 0;
  const costos = kpis.gastos ?? 0;
  const utilidad = kpis.utilidad ?? 0;
  const ult = monthlyData[monthlyData.length - 1];
  const prev = monthlyData[monthlyData.length - 2];
  /* «setiembre», no «Sep»: el nombre largo del mes, sin el año. */
  const mesPrev = (prev?.fullMonth ?? prev?.mes ?? "").split(" ")[0].toLowerCase();
  const { teDeben, debes, cruzable } = deudas;

  const deudaTexto = (c: CifraDeDeuda | null) => (c && c.montos.length > 0 ? enMonedas(c.montos) : montoEnMoneda(0, "PEN"));
  const cuantas = (c: CifraDeDeuda | null, una: string, varias: string, vacio: string) =>
    c && c.montos.length > 0 ? `${c.cuentas} ${c.cuentas === 1 ? una : varias}` : vacio;

  return (
    <div className="space-y-1">
      <section
        aria-label="Lo central del mes"
        data-testid="cifras-del-mes"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--rule-base)] lg:grid-cols-5"
      >
        <Celda
          rotulo="Entró" icon={TrendingUp} ayuda={AYUDA.entro} cifra={soles(ingresos)}
          destino="pl" verQue="Ganancias"
          sub={ult && prev ? <Delta actual={ult.ingresos} previo={prev.ingresos} mes={mesPrev} /> : "en el mes"}
        />
        <Celda
          rotulo="Salió" icon={TrendingDown} ayuda={AYUDA.salio} cifra={soles(costos)}
          destino="pl" verQue="Ganancias"
          sub={ult && prev ? <Delta actual={ult.gastos} previo={prev.gastos} mes={mesPrev} inverso /> : "en el mes"}
        />
        {/* Ocupa la fila entera en el celular: con cinco celdas en dos columnas sobraba un hueco. */}
        <Celda
          rotulo="Quedó" icon={Scale} ayuda={AYUDA.quedo} cifra={soles(utilidad, true)}
          tono={utilidad > 0 ? "bien" : utilidad < 0 ? "mal" : undefined}
          destino="pl" verQue="Ganancias" className="col-span-2 lg:col-span-1"
          sub={
            <>
              {kpis.margen != null && <span>margen {kpis.margen} %</span>}
              {ult && prev ? <Delta actual={ult.utilidad} previo={prev.utilidad} mes={mesPrev} /> : kpis.margen == null && <span>en el mes</span>}
            </>
          }
        />
        <Celda
          rotulo="Te deben" icon={CreditCard} ayuda={AYUDA.teDeben} cifra={deudaTexto(teDeben)}
          destino="por-cobrar" verQue="Por cobrar"
          sub={
            <>
              <span>{cuantas(teDeben, "cuenta", "cuentas", "nadie te debe")}</span>
              {vencidos.fiados > 0 ? (
                <span className="font-semibold text-[var(--data-error-ink)]">{soles(vencidos.fiados)} vencido</span>
              ) : (kpis.fiados ?? 0) > 0 ? (
                <span>{soles(kpis.fiados)} en fiados</span>
              ) : null}
            </>
          }
        />
        <Celda
          rotulo="Debes" icon={ReceiptText} ayuda={AYUDA.debes} cifra={deudaTexto(debes)}
          destino="por-pagar" verQue="Lo que debo"
          sub={
            <>
              <span>{cuantas(debes, "acreedor", "acreedores", "no le debes a nadie")}</span>
              {vencidos.pagos > 0 ? (
                <span className="font-semibold text-[var(--data-error-ink)]">{soles(vencidos.pagos)} vencido</span>
              ) : (kpis.deuda ?? 0) > 0 ? (
                <span>{soles(kpis.deuda)} a proveedores</span>
              ) : null}
            </>
          }
        />
      </section>
      {teDeben && debes && cruzable.length > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          {enMonedas(cruzable)} de lo que te deben y debes es entre las mismas personas.
        </p>
      )}
    </div>
  );
}
