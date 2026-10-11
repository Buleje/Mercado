"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, MessageSquare, MoreHorizontal, RefreshCw, Star, ThumbsDown, ThumbsUp, TrendingUp } from "@buleje/design-system/icons";
import { useMemo, useState } from "react";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { exportToCSV } from "@/lib/utils";
import { formatDateShort, formatNumber } from "@/lib/format";
import { ListaOpiniones } from "./opiniones/ListaOpiniones";
import { nivelDelIndice, ETIQUETA_CANAL, ETIQUETA_PERIODO, filtrar, resumir, tendenciaMensual, tipoDe, type Canal, type Periodo } from "./opiniones/shared";
import { TarjetaCifra } from "./opiniones/TarjetaCifra";
import { TendenciaMensual } from "./opiniones/TendenciaMensual";
import { useOpiniones } from "./opiniones/use-opiniones";

type Seccion = "detalle" | "tendencia";
const ID_PANEL = "opiniones-panel";
const SELECT = "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none";
const signo = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function NPSTab() {
  const { opiniones, cargando, error, recargar } = useOpiniones();
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [canal, setCanal] = useState<Canal | "todos">("todos");
  const [seccion, setSeccion] = useState<Seccion>("detalle");

  const ahora = useMemo(() => Date.now(), [opiniones]);
  const lista = useMemo(() => filtrar(opiniones, periodo, canal, ahora), [opiniones, periodo, canal, ahora]);
  const r = useMemo(() => resumir(lista), [lista]);
  const meses = useMemo(() => tendenciaMensual(opiniones), [opiniones]);
  const porModerar = opiniones.filter((o) => o.pendiente).length;
  const pct = (n: number) => (r.total ? Math.round((n / r.total) * 100) : 0);

  const kpis = useKpisPlegables({
    claveMemoria: "opiniones",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    resumen: r.total ? `${signo(r.indice)} · ${formatNumber(r.promedioEstrellas, 1)} de 5` : "Sin opiniones",
    tarjetas: [
      <TarjetaCifra key="indice" destacado rotulo="Satisfacción" icono={TrendingUp} valor={r.total ? `${signo(r.indice)} · ${nivelDelIndice(r.indice)}` : "Sin opiniones"}
        ayuda="Contentos (5 estrellas) menos descontentos (3 o menos), sobre el total de opiniones. Va de −100 a +100. Es un cálculo con las estrellas de tus reseñas, no una encuesta aparte." />,
      <TarjetaCifra key="prom" rotulo="Promedio" icono={Star} valor={r.total ? `${formatNumber(r.promedioEstrellas, 1)} de 5` : "—"} detalle={`${r.total} opiniones`} />,
      <TarjetaCifra key="ok" rotulo="Contentos" icono={ThumbsUp} valor={r.contentos} detalle={`${pct(r.contentos)} % · 5 estrellas`} />,
      <TarjetaCifra key="ko" rotulo="Descontentos" icono={ThumbsDown} valor={r.descontentos} detalle={`${pct(r.descontentos)} % · 3 o menos`} />,
    ],
  });

  const acciones: MenuAccion[] = [
    {
      id: "csv", label: "Descargar en Excel", hint: `${lista.length} opiniones, con los filtros de arriba`, icon: Download, disabled: lista.length === 0,
      onSelect: () => exportToCSV(lista.map((o) => ({ cliente: o.cliente, estrellas: o.estrellas, tipo: tipoDe(o.puntaje), canal: o.canal, comentario: o.comentario, fecha: formatDateShort(o.fecha) })), "opiniones"),
    },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: () => void recargar() },
  ];

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)]">No pudimos cargar las opiniones. Revisa tu conexión e inténtalo otra vez.</p>
        <button type="button" onClick={() => void recargar()} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Opiniones</SectionTitle>
          <InfoTip
            title="Qué tan contentos están"
            what="Las reseñas que dejan tus clientes en la tienda, con su puntaje de 1 a 5 estrellas y el índice de satisfacción."
            affects="Moderar o responder una reseña se hace en Marketplace › Reseñas. Aquí se cuentan todas menos las rechazadas."
            example="8 reseñas de 5 estrellas y 2 de 2 estrellas dan un índice de +60."
          />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <BarraDeSecciones
            secciones={[{ clave: "detalle", rotulo: "Opiniones" }, { clave: "tendencia", rotulo: "Mes a mes" }]}
            activa={seccion}
            onCambiar={setSeccion}
            etiqueta="Secciones de Opiniones"
            idPanel={ID_PANEL}
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Descargar en Excel y actualizar" />
        </div>
      </div>

      {kpis.panel}

      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período" className={SELECT}>
          {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((p) => <option key={p} value={p}>{ETIQUETA_PERIODO[p]}</option>)}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value as Canal | "todos")} aria-label="Canal" className={SELECT}>
          {(Object.keys(ETIQUETA_CANAL) as Array<Canal | "todos">).map((c) => <option key={c} value={c}>{ETIQUETA_CANAL[c]}</option>)}
        </select>
        {porModerar > 0 && (
          <EnlacePanel href="/admin?tab=marketplace&vista=resenas" className="inline-flex h-12 items-center px-1 text-sm">
            {porModerar} por moderar en Marketplace
          </EnlacePanel>
        )}
      </div>

      <div role="tabpanel" id={ID_PANEL}>
        {cargando ? (
          <LoadingState message="Cargando opiniones…" />
        ) : seccion === "tendencia" ? (
          meses.length === 0 ? <VacioOpiniones texto="Aún no hay meses con opiniones." /> : <TendenciaMensual meses={meses} />
        ) : lista.length === 0 ? (
          <VacioOpiniones texto={opiniones.length === 0 ? "Todavía no te han dejado reseñas." : "No hay opiniones con estos filtros."} />
        ) : (
          <ListaOpiniones opiniones={lista} />
        )}
      </div>
    </div>
  );
}

function VacioOpiniones({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-10">
      <MessageSquare className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
      <p className="text-sm text-[var(--text-secondary)]">{texto}</p>
    </div>
  );
}
