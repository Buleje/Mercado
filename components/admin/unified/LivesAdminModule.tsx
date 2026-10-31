"use client";

/**
 * LivesAdminModule — Transmisiones en vivo para mostrar productos y vender en directo.
 *
 * Lee `GET /api/admin/lives` (en vivo + próximas + pasadas + cifras), programa con
 * `POST /api/admin/lives` y empieza/termina con `/[id]/start` y `/[id]/end`.
 * Antes la pantalla mostraba transmisiones y ventas de EJEMPLO (S/ 1 240 de un
 * «Remate de Semana Santa» que nunca ocurrió) y «Programar» sólo guardaba en
 * memoria. Hoy muestra lo que devuelve el servidor: mientras el servicio de
 * transmisiones no esté activo (`lib/db/live-sessions.db.ts` es un stub), la
 * lista sale vacía y programar/empezar avisan que no se pudo, sin inventar nada.
 *
 * Patrón del panel: una fila de cabecera (título · Próximas/Pasadas con su
 * cuenta · Indicadores plegables · Programar · «⋯») y la tabla debajo.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@buleje/design-system";
import { Calendar, Plus, RefreshCw } from "@buleje/design-system/icons";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { leerJson } from "@/lib/errores/sin-dato";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency, formatNumber } from "@/lib/format";
import { button } from "@/components/ui-system/button-variants";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { CabeceraVista, tarjetasDe, Vacio } from "@/components/admin/campanas/comun";
import { ScheduleLiveModal, type ScheduledLiveData } from "./lives-admin/ScheduleLiveModal";
import { StartLiveModal } from "./lives-admin/StartLiveModal";
import { TablaTransmisiones } from "./lives-admin/TablaTransmisiones";
import type { RespuestaLives, TransmisionDto } from "./lives-admin/tipos";

const MODULE_ID = "lives";
const ID_PANEL = "panel-en-vivo";
const SECCIONES = ["proximas", "pasadas"] as const;
type Seccion = (typeof SECCIONES)[number];

const NO_ACTIVO = "Las transmisiones en vivo todavía no están activas en tu cuenta: no se guardó nada.";

async function mensajeDeError(res: Response): Promise<string> {
  const body = await leerJson<{ error?: string }>(res);
  return res.status >= 500 ? NO_ACTIVO : (body?.error ?? "No se pudo completar la acción.");
}

export default function LivesAdminModule() {
  const { vista: seccion, irA } = useSubvistaModulo<Seccion>(MODULE_ID, SECCIONES, SECCIONES[0]);
  const [datos, setDatos] = useState<RespuestaLives | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [aEmpezar, setAEmpezar] = useState<TransmisionDto | null>(null);

  const cargar = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lives", { cache: "no-store", signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: RespuestaLives };
      setDatos(json.data);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("No se pudieron cargar las transmisiones.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void cargar(ac.signal);
    return () => ac.abort();
  }, [cargar]);

  const programar = async (d: ScheduledLiveData): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/lives", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: d.title, description: d.description || undefined, scheduledFor: new Date(d.scheduledAt).toISOString() }),
      });
      if (!res.ok) {
        toast.error(await mensajeDeError(res));
        return false;
      }
      toast.success("Transmisión programada");
      void cargar();
      return true;
    } catch {
      toast.error("No se pudo programar. Revisa tu conexión.");
      return false;
    }
  };

  const cambiarEstado = async (t: TransmisionDto, accion: "start" | "end") => {
    try {
      const res = await fetch(`/api/admin/lives/${t.id}/${accion}`, { method: "POST", headers: csrfHeaders() });
      if (!res.ok) {
        toast.error(await mensajeDeError(res));
        return;
      }
      toast.success(accion === "start" ? "Estás en vivo" : "Transmisión terminada");
      void cargar();
    } catch {
      toast.error("No se pudo completar la acción. Revisa tu conexión.");
    }
  };

  const proximas = [...(datos?.active ?? []), ...(datos?.upcoming ?? [])];
  const pasadas = datos?.past ?? [];
  const stats = datos?.stats;

  const kpis = useKpisPlegables({
    claveMemoria: "en-vivo",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading && !datos,
    resumen: `${stats?.totalLives ?? 0} transmisiones`,
    tarjetas: tarjetasDe([
      { rotulo: "Transmisiones", valor: String(stats?.totalLives ?? 0), detalle: "Las que ya hiciste" },
      { rotulo: "Espectadores por transmisión", valor: formatNumber(stats?.averageViewers ?? 0, { max: 0 }), detalle: "Promedio" },
      { rotulo: "Conversión", valor: `${formatNumber((stats?.conversionRate ?? 0) * 100, { max: 1 })} %`, detalle: "Espectadores que terminaron comprando" },
      { rotulo: "Ventas en vivo", valor: formatCurrency(stats?.totalGmvSoles ?? 0), detalle: "Pedidos generados desde las transmisiones" },
    ]),
  });

  const menu: MenuAccion[] = [{ id: "recargar", label: "Actualizar", icon: RefreshCw, onSelect: () => void cargar() }];
  const secciones = [
    { clave: "proximas" as const, rotulo: "Próximas", cuenta: proximas.length },
    { clave: "pasadas" as const, rotulo: "Pasadas", cuenta: pasadas.length },
  ];
  const filas = seccion === "proximas" ? proximas : pasadas;

  return (
    <div className="space-y-4">
      <CabeceraVista
        titulo="En Vivo"
        ayuda={{
          title: "Transmisiones en vivo",
          what: "Muestras productos por video y tus clientes compran mientras miran. Programas una para más tarde y la empiezas a su hora.",
          affects: "Las ventas de cada transmisión salen de los pedidos hechos mientras estaba en vivo.",
          example: "Programa el viernes a las 7 pm, avisa a tus clientes y empieza a esa hora.",
        }}
        secciones={<BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={irA} etiqueta="Secciones de En Vivo" idPanel={ID_PANEL} />}
        indicadores={kpis.boton}
        principal={
          <button type="button" onClick={() => setShowSchedule(true)} aria-haspopup="dialog" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Programar</span>
          </button>
        }
        menu={menu}
        tituloMenu="Actualizar"
      />
      {kpis.panel}

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        {loading && !datos ? (
          <LoadingState />
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] py-10 text-center">
            <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>
            <button type="button" onClick={() => void cargar()} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
              Reintentar
            </button>
          </div>
        ) : filas.length === 0 ? (
          <Vacio>
            {seccion === "proximas" ? (
              <>
                <Calendar className="mr-1.5 inline h-4 w-4 align-text-bottom" aria-hidden />
                No tienes transmisiones programadas: usa «Programar» para la siguiente.
              </>
            ) : (
              "Aún no hiciste ninguna transmisión."
            )}
          </Vacio>
        ) : (
          <TablaTransmisiones filas={filas} tipo={seccion} onEmpezar={setAEmpezar} onTerminar={(t) => void cambiarEstado(t, "end")} />
        )}
      </div>

      {showSchedule && <ScheduleLiveModal onClose={() => setShowSchedule(false)} onSchedule={programar} />}
      {aEmpezar && (
        <StartLiveModal
          titulo={aEmpezar.title}
          onClose={() => setAEmpezar(null)}
          onStart={() => {
            const t = aEmpezar;
            setAEmpezar(null);
            void cambiarEstado(t, "start");
          }}
        />
      )}
    </div>
  );
}
