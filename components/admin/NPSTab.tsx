"use client";

/**
 * Clientes › Opiniones: qué tan contentos están (índice, promedio, mes a mes)
 * y, desde el 19-10, **Moderar** — aprobar, rechazar y responder cada reseña,
 * que antes era Marketplace › Reseñas (el mismo `/api/reviews?all=1`). Las
 * tres secciones van en `?sub=` (`detalle` · `tendencia` · `moderar`); un
 * enlace viejo a Marketplace › Reseñas llega a `?sub=moderar`. Moderar
 * conserva el candado de Marketplace (`origenDeSeccion`): sin él no se ofrece
 * y `?sub=moderar` muestra Opiniones.
 */
import dynamic from "next/dynamic";
import { LoadingState, SectionTitle, StatCard } from "@buleje/design-system";
import { AlertTriangle, Download, MessageSquare, MoreHorizontal, RefreshCw, Star, ThumbsDown, ThumbsUp, TrendingUp } from "@buleje/design-system/icons";
import { useMemo, useState } from "react";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { origenDeSeccion } from "@/lib/admin/subvistas-modulos";
import { exportToCSV } from "@/lib/utils";
import { formatDateShort, formatNumber } from "@/lib/format";
import { ListaOpiniones } from "./opiniones/ListaOpiniones";
import { nivelDelIndice, ETIQUETA_CANAL, ETIQUETA_PERIODO, filtrar, resumir, tendenciaMensual, tipoDe, type Canal, type Periodo } from "./opiniones/shared";
import { TendenciaMensual } from "./opiniones/TendenciaMensual";
import { useOpiniones } from "./opiniones/use-opiniones";

const ModerarResenas = dynamic(() => import("./opiniones/ModerarResenas"), { loading: () => <LoadingState message="Cargando reseñas…" /> });

/** Las secciones de Opiniones (`?sub=`), en el orden de la barra. */
export const SECCIONES_OPINIONES = ["detalle", "tendencia", "moderar"] as const;
type Seccion = (typeof SECCIONES_OPINIONES)[number];
/** Moderar era Marketplace › Reseñas: la ve quien tenía Marketplace. */
const ORIGEN_MODERAR = origenDeSeccion("clientes", "resenas", "moderar");
const ID_PANEL = "opiniones-panel";
const SELECT = "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none";
const signo = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function NPSTab() {
  const { opiniones, cargando, error, recargar } = useOpiniones();
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [canal, setCanal] = useState<Canal | "todos">("todos");
  const { vista: pedida, irA: setSeccion } = useSubvistaModulo<Seccion>("clientes-opiniones", SECCIONES_OPINIONES, "detalle");
  const veModerar = usePermisoDe(ORIGEN_MODERAR);
  /* Sin candado, `?sub=moderar` cae en Opiniones sin reescribir la URL: el
     permiso llega después del primer pintado y el enlace no se pierde. */
  const seccion: Seccion = pedida === "moderar" && !veModerar ? "detalle" : pedida;

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
      <StatCard density="compact" key="indice" highlight label="Satisfacción" icon={TrendingUp} value={r.total ? `${signo(r.indice)} · ${nivelDelIndice(r.indice)}` : "Sin opiniones"}
        info={<InfoTip what="Contentos (5 estrellas) menos descontentos (3 o menos), sobre el total de opiniones. Va de −100 a +100. Es un cálculo con las estrellas de tus reseñas, no una encuesta aparte." />} />,
      <StatCard density="compact" key="prom" label="Promedio" icon={Star} value={r.total ? `${formatNumber(r.promedioEstrellas, 1)} de 5` : "—"} subValue={`${r.total} opiniones`} />,
      <StatCard density="compact" key="ok" label="Contentos" icon={ThumbsUp} value={r.contentos} subValue={`${pct(r.contentos)} % · 5 estrellas`} />,
      <StatCard density="compact" key="ko" label="Descontentos" icon={ThumbsDown} value={r.descontentos} subValue={`${pct(r.descontentos)} % · 3 o menos`} />,
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
            affects="Aprobar, rechazar o responder una reseña se hace en la sección Moderar: sólo las aprobadas se ven en tu tienda. Las cifras cuentan todas menos las rechazadas."
            example="8 reseñas de 5 estrellas y 2 de 2 estrellas dan un índice de +60."
          />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <BarraDeSecciones
            secciones={[
              { clave: "detalle", rotulo: "Opiniones" },
              { clave: "tendencia", rotulo: "Mes a mes" },
              ...(veModerar ? [{ clave: "moderar" as const, rotulo: "Moderar", cuenta: porModerar }] : []),
            ]}
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

      {seccion !== "moderar" && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período" className={SELECT}>
            {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((p) => <option key={p} value={p}>{ETIQUETA_PERIODO[p]}</option>)}
          </select>
          <select value={canal} onChange={(e) => setCanal(e.target.value as Canal | "todos")} aria-label="Canal" className={SELECT}>
            {(Object.keys(ETIQUETA_CANAL) as Array<Canal | "todos">).map((c) => <option key={c} value={c}>{ETIQUETA_CANAL[c]}</option>)}
          </select>
          {veModerar && porModerar > 0 && (
            <button type="button" onClick={() => setSeccion("moderar")} className="inline-flex h-12 items-center px-1 text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
              {porModerar} por moderar
            </button>
          )}
        </div>
      )}

      <div role="tabpanel" id={ID_PANEL}>
        {seccion === "moderar" ? (
          <ModerarResenas onCambio={() => void recargar()} />
        ) : cargando ? (
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
