"use client";

/**
 * Préstamos › Tablero — patrón del panel (11-10).
 *
 * Una fila: el estado de la cartera en una línea · Indicadores plegables ·
 * «Nuevo préstamo» · «⋯». Abajo, los dos gráficos que dicen algo que no está
 * en otra parte (cobros vs nuevos de 6 meses y a quién le prestaste más).
 *
 * Antes eran 1,36 pantallas con 0 préstamos: un aviso, seis tarjetas, otra
 * tarjeta grande con la mora (la misma cifra de una de las seis) y cuatro
 * gráficos vacíos. «Dado vs Recibido» repetía las tarjetas Dados y Recibidos;
 * su balance neto quedó en los Indicadores. «Distribución por estado» era un
 * donut de cuatro cuentas: van en una línea de la tarjeta «Préstamos».
 *
 * Las sumas de plata salen del servidor (`/api/prestamos/resumen`); las series
 * del gráfico y la recuperación se arman de la lista (son lecturas, no saldos).
 * La recuperación y el gráfico cuentan SÓLO lo que prestaste: antes mezclaban
 * lo que te prestaron (y un crédito recibido de S/ 5 000 salía como «nuevo
 * préstamo» al lado de lo cobrado).
 */

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, DollarSign, Landmark, MoreHorizontal, Plus, RefreshCw, Scale, TrendingUp, Wallet } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatCurrency, formatMonth } from "@/lib/format";
import type { Prestamo, Resumen } from "./tipos";

const TOOLTIP = { borderRadius: "12px", border: "1px solid var(--rule-base)", background: "var(--surface-raised)", fontSize: "14px" };
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function armarSeries(prestamos: Prestamo[]) {
  const vivos = prestamos.filter((p) => p.status !== "CANCELADO");
  const dados = vivos.filter((p) => p.direccion === "DADO");
  const prestado = dados.reduce((s, p) => s + p.monto, 0);
  const cobrado = dados.reduce((s, p) => s + p.cuotas.filter((c) => c.pagadoEn).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0);

  const meses: { mes: string; cobrado: number; nuevos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    meses.push({
      mes: formatMonth(d),
      cobrado: dados.reduce((s, p) => s + p.cuotas.filter((c) => c.pagadoEn?.startsWith(clave)).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0),
      nuevos: dados.filter((p) => p.createdAt.startsWith(clave)).reduce((s, p) => s + p.monto, 0),
    });
  }

  const porDeudor = new Map<string, number>();
  for (const p of dados.filter((x) => x.status === "ACTIVO" || x.status === "VENCIDO")) {
    const saldo = p.cuotas.filter((c) => !c.pagadoEn).reduce((s, c) => s + c.monto, 0);
    if (saldo > 0) {
      const quien = (p.entidadNombre || p.customerId || "Sin nombre").slice(0, 18);
      porDeudor.set(quien, (porDeudor.get(quien) ?? 0) + saldo);
    }
  }
  const deudores = [...porDeudor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, monto]) => ({ name, monto }));

  const estados = {
    activos: prestamos.filter((p) => p.status === "ACTIVO").length,
    pagados: prestamos.filter((p) => p.status === "PAGADO").length,
    vencidos: prestamos.filter((p) => p.status === "VENCIDO").length,
    cancelados: prestamos.filter((p) => p.status === "CANCELADO").length,
  };
  return { recuperacion: prestado > 0 ? (cobrado / prestado) * 100 : null, meses, deudores, estados };
}

export default function PrestamosDashboard({
  prestamos,
  resumen,
  onNuevo,
  onActualizar,
  onIr,
}: {
  prestamos: Prestamo[];
  resumen?: Resumen | null;
  onNuevo: () => void;
  onActualizar: () => void;
  /** Cambia la pestaña de Préstamos (`?sub=`). */
  onIr: (pestana: string) => void;
}) {
  const { recuperacion, meses, deudores, estados } = armarSeries(prestamos);
  const porCobrar = resumen?.saldoDados ?? 0;
  const debes = resumen?.saldoRecibidos ?? 0;
  const vencidas = resumen?.cuotasVencidas ?? 0;
  const mora = resumen?.moraAcumulada ?? 0;
  const neto = (resumen?.totalDados ?? 0) - (resumen?.totalRecibidos ?? 0);

  const estado =
    vencidas > 0
      ? { tono: "text-[var(--data-warning-ink)]", Icon: AlertTriangle, texto: `${plural(vencidas, "cuota vencida", "cuotas vencidas")}${mora > 0 ? ` · ${formatCurrency(mora)} de mora` : ""}` }
      : porCobrar > 0
        ? { tono: "text-[var(--text-primary)]", Icon: DollarSign, texto: `Al día · ${formatCurrency(porCobrar)} por cobrar` }
        : prestamos.length > 0
          ? { tono: "text-[var(--data-success-ink)]", Icon: TrendingUp, texto: "Al día: nada por cobrar" }
          : { tono: "text-[var(--text-secondary)]", Icon: Landmark, texto: "Todavía no registras préstamos, ni dados ni recibidos" };

  const kpis = useKpisPlegables({
    claveMemoria: "plata-prestamos",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: `Por cobrar ${formatCurrency(porCobrar)}`,
    tarjetas: [
      <TarjetaIndicador key="cobrar" rotulo="Por cobrar" valor={formatCurrency(porCobrar)} detalle={`${plural(resumen?.activosDados ?? 0, "préstamo dado activo", "préstamos dados activos")}`} icono={ArrowUpFromLine} tono="destacado" />,
      <TarjetaIndicador key="debes" rotulo="Debes" valor={formatCurrency(debes)} detalle={`${plural(resumen?.activosRecibidos ?? 0, "préstamo recibido activo", "préstamos recibidos activos")}`} icono={ArrowDownToLine} />,
      <TarjetaIndicador key="vencidas" rotulo="Cuotas vencidas" valor={String(vencidas)} detalle={mora > 0 ? `${formatCurrency(mora)} de mora acumulada` : "Sin mora"} icono={AlertTriangle} tono={vencidas > 0 ? "alerta" : "normal"} />,
      <TarjetaIndicador key="neto" rotulo="Dado − recibido" valor={`${neto < 0 ? "− " : ""}${formatCurrency(Math.abs(neto))}`} detalle={`${formatCurrency(resumen?.totalDados ?? 0)} dados · ${formatCurrency(resumen?.totalRecibidos ?? 0)} recibidos`} icono={Scale} />,
      <TarjetaIndicador key="recupera" rotulo="Recuperación" valor={recuperacion === null ? "—" : `${recuperacion.toFixed(1)} %`} detalle="Cobrado de lo que prestaste" icono={TrendingUp} />,
      <TarjetaIndicador key="estados" rotulo="Préstamos" valor={String(prestamos.length)} detalle={`${estados.activos} activos · ${estados.pagados} pagados · ${estados.vencidos} vencidos · ${estados.cancelados} cancelados`} icono={Landmark} />,
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "cobros", label: "Cobros de la semana", hint: "Cuotas vencidas y las que vencen en 30 días", icon: Wallet, onSelect: () => onIr("cobros") },
    { id: "todo", label: "Todo lo que me deben", hint: "Préstamos junto con fiados, adelantos y madera", icon: DollarSign, onSelect: () => irAlOrigen({ tab: "plata", params: { vista: "por-cobrar" } }) },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: onActualizar },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className={cn("flex min-w-0 items-center gap-2 text-base font-semibold", estado.tono)}>
          <estado.Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{estado.texto}</span>
          <InfoTip
            title="Tablero de préstamos"
            what="Lo que te deben por préstamos que diste y lo que debes por los que te dieron, con sus cuotas vencidas y la mora. Las cifras de plata salen del servidor."
            affects="«Recuperación» = lo cobrado de los préstamos que diste ÷ lo que prestaste. Lo que te prestaron no entra."
            example="Si prestaste S/ 1 000 y ya te pagaron S/ 400 en cuotas, la recuperación es 40 %."
          />
        </p>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={onNuevo} className={cn(button({ variant: "primary" }), "h-12 shrink-0 rounded-xl")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo préstamo
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Cobros, todo lo que me deben y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {/* Sin préstamos, la línea de estado ya lo dice y «Nuevo préstamo» está al
          lado: ni un segundo aviso ni gráficos vacíos. */}
      {prestamos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:col-span-2">
            <CardTitle className="mb-3 text-sm font-bold text-[var(--text-primary)]">Cobrado vs prestado, 6 meses</CardTitle>
            {meses.some((d) => d.cobrado > 0 || d.nuevos > 0) ? (
              <ResponsiveContainer minWidth={0} width="100%" height={220}>
                <AreaChart data={meses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 14 }} />
                  <YAxis tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 14 }} width={56} />
                  <Tooltip formatter={((v: number, name: string) => [formatCurrency(Number(v)), name === "cobrado" ? "Cobrado" : "Prestado"]) as never} contentStyle={TOOLTIP} />
                  <Legend formatter={(v: string) => (v === "cobrado" ? "Cobrado" : "Prestado")} />
                  <Area type="monotone" dataKey="cobrado" stroke="var(--data-success)" fill="var(--data-success)" fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="nuevos" stroke="var(--text-tertiary)" fill="var(--text-tertiary)" fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Sin movimiento en los últimos 6 meses.</p>
            )}
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <CardTitle className="mb-3 text-sm font-bold text-[var(--text-primary)]">Quién te debe más</CardTitle>
            {deudores.length > 0 ? (
              <ResponsiveContainer minWidth={0} width="100%" height={220}>
                <BarChart data={deudores} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 14 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 14 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={((v: number) => [formatCurrency(Number(v)), "Saldo"]) as never} contentStyle={TOOLTIP} />
                  <Bar dataKey="monto" radius={[0, 6, 6, 0]}>
                    {deudores.map((d, i) => <Cell key={d.name} fill={i === 0 ? "var(--data-error-500)" : "var(--data-warning-500)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Nadie te debe por préstamos.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
