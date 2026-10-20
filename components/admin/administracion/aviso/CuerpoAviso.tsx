"use client";

/**
 * CuerpoAviso — lo de adentro del aviso de la agenda, igual en la ventana del
 * centro que en el panel del costado (`AvisoAgendaModal` elige el marco): lo
 * que falta de hoy y lo atrasado con «Hecha» e «Ir a hacerlo» (`ListaOcurrencias`),
 * «Ponerme al día» y, en la ventana, los botones para pasarla al costado.
 */
import dynamic from "next/dynamic";
import { ArrowUpRight, CheckCircle2, ListChecks, PanelRight, Pin, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import type { ModoAviso } from "@/lib/agenda/aviso-pantalla";
import type { OcurrenciaDTO } from "@/lib/agenda/tipos";
import { cn } from "@/lib/utils";
import { ESTILO_ESTADO } from "../comun/estado-ocurrencia";
import { CLASE_CHIP_ESTADO, ListaOcurrencias } from "../comun/ListaOcurrencias";

const PonermeAlDia = dynamic(() => import("./PonermeAlDia"), { ssr: false });

const HOY_EN_ADMINISTRACION = "/admin?tab=administracion&vista=hoy";

interface Props {
  falta: { hoy: OcurrenciaDTO[]; atrasadas: OcurrenciaDTO[] };
  modo: ModoAviso;
  alDia: boolean;
  onAlDia: (v: boolean) => void;
  onCambiarModo: (m: ModoAviso) => void;
  onCerrar: () => void;
}

export function CuerpoAviso({ falta, modo, alDia, onAlDia, onCambiarModo, onCerrar }: Props) {
  const { cargando, error, refrescar } = useAgenda();
  const total = falta.hoy.length + falta.atrasadas.length;
  /* En la ventana del centro «Ir a hacerlo» la cierra para no tapar; al costado se queda: para eso está. */
  const alIr = modo === "ventana" ? onCerrar : undefined;

  if (alDia) {
    return <PonermeAlDia ocurrencias={falta.atrasadas} onCerrar={() => (alIr ? alIr() : onAlDia(false))} onIr={alIr ?? (() => undefined)} />;
  }

  return (
    <div
      className="space-y-4"
      onClickCapture={(e) => {
        if (alIr && (e.target as HTMLElement).closest("a[href]")) alIr();
      }}
    >
      {error && (
        <ErrorAlert
          title="No se pudo traer la agenda"
          description={error}
          action={
            <button type="button" className={button({ variant: "secondary" })} onClick={refrescar}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        />
      )}
      {cargando ? (
        <LoadingState message="Mirando lo de hoy…" />
      ) : total === 0 ? (
        <EmptyState icon={CheckCircle2} title="Estás al día" description="No te falta nada de hoy ni de los días anteriores." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {falta.hoy.length > 0 && (
              <span className={cn(CLASE_CHIP_ESTADO, "text-sm", ESTILO_ESTADO.pendiente.chip)}>{falta.hoy.length} por hacer hoy</span>
            )}
            {falta.atrasadas.length > 0 && (
              <span className={cn(CLASE_CHIP_ESTADO, "text-sm", ESTILO_ESTADO.atrasada.chip)}>
                {falta.atrasadas.length} {falta.atrasadas.length === 1 ? "atrasada" : "atrasadas"}
              </span>
            )}
            {falta.atrasadas.length > 0 && (
              <button type="button" data-qa="aviso-poner-al-dia" className={button({ variant: "secondary" })} onClick={() => onAlDia(true)}>
                <ListChecks className="size-4" aria-hidden="true" />
                Ponerme al día
              </button>
            )}
            <div className="ml-auto flex items-center gap-1">
              {modo === "ventana" && (
                <>
                  <button type="button" data-qa="aviso-al-costado" className={button({ variant: "ghost", size: "icon" })} onClick={() => onCambiarModo("lateral")} title="Al costado: barra a la derecha, la página se achica para hacerle lugar" aria-label="Poner al costado">
                    <PanelRight className="size-5" aria-hidden="true" />
                  </button>
                  <button type="button" data-qa="aviso-fijar" className={button({ variant: "ghost", size: "icon" })} onClick={() => onCambiarModo("fija")} title="Fija al costado: igual, y vuelve al recargar" aria-label="Fijar al costado">
                    <Pin className="size-5" aria-hidden="true" />
                  </button>
                </>
              )}
              <a
                href={HOY_EN_ADMINISTRACION}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  void irAEnlace(HOY_EN_ADMINISTRACION);
                }}
                className={button({ variant: "ghost" })}
              >
                Ver todo
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          {falta.hoy.length > 0 && (
            <section>
              <CardTitle>Hoy</CardTitle>
              <ListaOcurrencias etiqueta="Lo que falta hoy" ocurrencias={falta.hoy} />
            </section>
          )}
          {falta.atrasadas.length > 0 && (
            <section>
              <CardTitle>Atrasadas</CardTitle>
              <ListaOcurrencias etiqueta="Lo atrasado" ocurrencias={falta.atrasadas} conFecha />
            </section>
          )}
        </>
      )}
    </div>
  );
}
