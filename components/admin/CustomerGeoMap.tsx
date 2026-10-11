"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, Flame, MapPin, MoreHorizontal, RefreshCw, TrendingUp, Users, Wallet } from "@buleje/design-system/icons";
import { useMemo, useState } from "react";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn, exportToCSV } from "@/lib/utils";
import { LienzoMapa } from "./mapa-clientes/LienzoMapa";
import { PendientesUbicacion } from "./mapa-clientes/PendientesUbicacion";
import { COLOR_NIVEL, ETIQUETA_NIVEL, nivelDe, zonasTop, type ModoMapa, type Nivel } from "./mapa-clientes/shared";
import { useClientesGeo } from "./mapa-clientes/use-clientes-geo";
import { ZonasTop } from "./mapa-clientes/ZonasTop";
import { TarjetaCifra } from "./opiniones/TarjetaCifra";

interface Props {
  className?: string;
}
type Panel = "pendientes" | "zonas";
const ID_PANEL = "mapa-clientes-lateral";

export default function CustomerGeoMap({ className }: Props) {
  const { conUbicacion, sinUbicacion, cargando, error, recargar } = useClientesGeo();
  const [modo, setModo] = useState<ModoMapa>("marcadores");
  const [panel, setPanel] = useState<Panel>("pendientes");

  const total = conUbicacion.length + sinUbicacion.length;
  const gastado = useMemo(() => conUbicacion.reduce((s, c) => s + c.totalSpent, 0), [conUbicacion]);
  const zonas = useMemo(() => zonasTop(conUbicacion), [conUbicacion]);
  const niveles = useMemo(() => {
    const n: Record<Nivel, number> = { oro: 0, plata: 0, bronce: 0 };
    for (const c of conUbicacion) n[nivelDe(c.totalSpent)]++;
    return n;
  }, [conUbicacion]);

  const kpis = useKpisPlegables({
    claveMemoria: "mapa-clientes",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    resumen: `${conUbicacion.length} de ${total} en el mapa`,
    tarjetas: [
      <TarjetaCifra key="con" destacado rotulo="En el mapa" icono={MapPin} valor={conUbicacion.length} detalle={`de ${total} clientes`} />,
      <TarjetaCifra key="sin" rotulo="Sin ubicación" icono={Users} valor={sinUbicacion.length} detalle="pídeles que la compartan" />,
      <TarjetaCifra key="gasto" rotulo="Total gastado" icono={Wallet} valor={formatCurrency(gastado)} detalle="de los que están en el mapa" />,
      <TarjetaCifra key="zona" rotulo="Zona con más clientes" icono={TrendingUp} valor={<span className="block truncate text-sm">{zonas[0]?.zona ?? "—"}</span>} detalle={`${zonas[0]?.clientes ?? 0} clientes`} />,
    ],
  });

  const acciones: MenuAccion[] = [
    {
      id: "csv", label: "Descargar clientes sin ubicación", hint: `${sinUbicacion.length} clientes`, icon: Download, disabled: sinUbicacion.length === 0,
      onSelect: () => exportToCSV(sinUbicacion.map((c) => ({ cliente: c.name, telefono: c.phone, direccion: c.location })), "clientes-sin-ubicacion"),
    },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: () => void recargar() },
  ];

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)]">{error}</p>
        <button type="button" onClick={() => void recargar()} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">Reintentar</button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Mapa de clientes</SectionTitle>
          <InfoTip
            title="Dónde viven tus clientes"
            what="Cada punto es un cliente que compartió su ubicación (GPS). El color dice cuánto ha comprado; el mapa de calor, dónde se junta más compra."
            affects="Los que no tienen ubicación salen en la lista de la derecha: con un clic les pides por WhatsApp que la compartan."
            example="Oro+ desde S/ 1 500, Plata desde S/ 500, Bronce el resto."
          />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <BarraDeSecciones
            secciones={[{ clave: "marcadores", rotulo: "Clientes" }, { clave: "calor", rotulo: "Mapa de calor" }]}
            activa={modo}
            onCambiar={setModo}
            etiqueta="Cómo ver el mapa"
            idPanel="mapa-clientes-lienzo"
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Descargar los clientes sin ubicación y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {cargando ? (
        <LoadingState message="Cargando el mapa…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div id="mapa-clientes-lienzo" role="tabpanel" className="space-y-2">
            <div className="relative isolate h-[60dvh] min-h-[22rem] lg:h-[calc(100dvh-13rem)]">
              <LienzoMapa clientes={conUbicacion} modo={modo} />
              {conUbicacion.length === 0 && (
                <div className="pointer-events-none absolute inset-x-4 top-4 z-[1000] flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-sm)]">
                  <MapPin className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  Ningún cliente ha compartido su ubicación todavía. Pídesela desde la lista.
                </div>
              )}
            </div>
            {conUbicacion.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                {modo === "marcadores" ? (
                  (Object.keys(ETIQUETA_NIVEL) as Nivel[]).map((n) => (
                    <span key={n} className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLOR_NIVEL[n] }} aria-hidden />
                      {ETIQUETA_NIVEL[n]}: {niveles[n]}
                    </span>
                  ))
                ) : (
                  <span className="flex items-center gap-1.5"><Flame className="h-4 w-4" aria-hidden /> Más intenso = más gastado por cliente</span>
                )}
              </p>
            )}
          </div>

          <aside className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto">
            <BarraDeSecciones
              secciones={[{ clave: "pendientes", rotulo: "Sin ubicación", cuenta: sinUbicacion.length }, { clave: "zonas", rotulo: "Zonas" }]}
              activa={panel}
              onCambiar={setPanel}
              etiqueta="Panel del mapa"
              idPanel={ID_PANEL}
            />
            <div id={ID_PANEL} role="tabpanel" className="mt-2">
              {panel === "pendientes" ? <PendientesUbicacion clientes={sinUbicacion} /> : <ZonasTop zonas={zonas} total={conUbicacion.length} />}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
