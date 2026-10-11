"use client";

/**
 * Mi Plata › Por cobrar y pagar › Fiarle — «A quién fiarle».
 *
 * Una fila por cliente con la respuesta (Sí · Con cuidado · No) y el motivo en
 * una línea; primero a quién NO fiarle. El veredicto, las sumas y el orden
 * salen del servidor (`/api/finanzas/a-quien-fiarle`, regla en
 * `lib/credit/a-quien-fiarle.ts`): es la misma regla con la que la caja
 * rechaza un fiado nuevo, no un puntaje aparte.
 *
 * Antes (hasta el 11-10) armaba un puntaje 0-100 en el navegador que no unía
 * ningún fiado con su cliente: los 15 de `main` salían «Bueno · Sin historial»,
 * incluido el que debía S/ 150 vencidos hace 71 días.
 *
 * Patrón del panel: título + ⓘ, Indicadores plegables y «⋯» en una fila;
 * buscador y filtros en otra, pegada a la tabla; «⋯» por fila.
 */

import { useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, HandCoins, MoreHorizontal, RefreshCw, Search, UserPlus, Users } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { useAQuienFiarle } from "@/hooks/use-a-quien-fiarle";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { Veredicto } from "@/lib/credit/a-quien-fiarle";
import { BUSCADOR, CHIP, CHIP_OFF, CHIP_ON } from "@/components/admin/unified/finanzas/por-pagar/estilo";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { ME_DEBEN } from "@/components/admin/por-cobrar/FiadosEnVentasYCaja";
import FilaFiarle from "./fiarle/FilaFiarle";
import { ORDEN_VEREDICTOS, VEREDICTO } from "./fiarle/estilo";

const soles = (n: number) => montoEnMoneda(n, "PEN");

export default function ScoringCrediticioTab() {
  const { data, loading, error, recargar } = useAQuienFiarle();
  const [filtro, setFiltro] = useState<Veredicto | "todos">("todos");
  const [q, setQ] = useState("");
  const r = data.resumen;

  const filas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return data.filas.filter((f) => {
      if (filtro !== "todos" && f.veredicto !== filtro) return false;
      return !texto || `${f.nombre} ${f.telefono}`.toLowerCase().includes(texto);
    });
  }, [data.filas, filtro, q]);

  const kpis = useKpisPlegables({
    claveMemoria: "plata-fiarle",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && data.filas.length === 0,
    resumen: r.deuda > 0 ? `Fiado ${soles(r.deuda)}` : "Nada fiado",
    tarjetas: [
      <TarjetaIndicador key="fiado" rotulo="Fiado en la calle" valor={soles(r.deuda)} detalle={`${r.clientes - r.sinHistorial} de ${r.clientes} clientes ya llevaron fiado`} icono={HandCoins} tono="destacado" />,
      <TarjetaIndicador key="vencido" rotulo="Ya vencido" valor={soles(r.vencido)} detalle={r.vencido > 0 ? "Se cobra en Ventas y caja › Me deben" : "Nadie se pasó de su fecha"} icono={AlertTriangle} tono={r.vencido > 0 ? "alerta" : "normal"} />,
      <TarjetaIndicador key="nuevos" rotulo="Nunca les fiaste" valor={String(r.sinHistorial)} detalle="Sin historial: empieza con poco" icono={UserPlus} />,
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "me-deben", label: "Cobrar fiados", hint: "Ventas y caja › Me deben", icon: HandCoins, onSelect: () => irAlOrigen({ tab: ME_DEBEN.tab, params: { ...ME_DEBEN.params } }) },
    { id: "clientes", label: "Límites de crédito", hint: "Se ponen por cliente en Mis clientes", icon: Users, onSelect: () => irAlOrigen({ tab: "clientes", params: { vista: "crm" } }) },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle as="h3" className="whitespace-nowrap text-[var(--text-primary)]">A quién fiarle</SectionTitle>
          <InfoTip
            title="A quién fiarle"
            what="Cada cliente con la respuesta: Sí, Con cuidado o No, y por qué. «No» es lo mismo que la caja ya rechaza al fiar: 3 fiados vencidos, un fiado vencido hace más de 60 días o la deuda que llegó a su límite."
            affects="«Con cuidado» = debe algo vencido o ya usó el 80 % de su límite. El límite se pone por cliente en Mis clientes; sin límite, la caja no le pone tope."
            example="Si Rosa debe S/ 150 que venció hace 71 días, sale «No le fíes» aunque tenga un solo fiado."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Cobrar fiados, límites de crédito y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-ink)]">
          No se pudo cargar a quién fiarle ({error}).
          <button type="button" onClick={recargar} className="min-h-12 rounded-xl px-3 underline">Reintentar</button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca un cliente por nombre o celular" aria-label="Busca un cliente por nombre o celular" className={BUSCADOR} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por respuesta">
          <button type="button" onClick={() => setFiltro("todos")} aria-pressed={filtro === "todos"} className={cn(CHIP, filtro === "todos" ? CHIP_ON : CHIP_OFF)}>
            Todos <span className="tabular-nums text-[var(--text-tertiary)]">{r.clientes}</span>
          </button>
          {ORDEN_VEREDICTOS.map((v) => {
            const cuantos = r[v];
            const activo = filtro === v;
            const Icon = VEREDICTO[v].icon;
            return (
              <button key={v} type="button" onClick={() => setFiltro(activo ? "todos" : v)} aria-pressed={activo} disabled={cuantos === 0} className={cn(CHIP, activo ? CHIP_ON : CHIP_OFF, cuantos === 0 && "cursor-not-allowed opacity-60")}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {VEREDICTO[v].filtro} <span className="tabular-nums text-[var(--text-tertiary)]">{cuantos}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading && data.filas.length === 0 && !error ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando a quién fiarle…</p>
      ) : !loading && !error && data.filas.length === 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          Todavía no tienes clientes: cuando compren o les fíes, acá ves a quién fiarle.
        </p>
      ) : (
        <DataTable zebra className="[&_tbody_td]:py-1" wrapperClassName="sm:pr-14">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>¿Fiarle?</th>
              <th className="text-right">Debe</th>
              <th className="text-right">Límite</th>
              <th>Fiados</th>
              <th><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => <FilaFiarle key={f.telefono} fila={f} />)}
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm font-bold text-[var(--text-secondary)]">
                  Ningún cliente con ese filtro. Toca «Todos» para verlos a todos.
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
