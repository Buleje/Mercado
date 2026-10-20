"use client";

/**
 * CuerpoAviso — «Por hacer» del centro único (`AvisoAgendaModal`): lo que falta
 * de hoy y lo atrasado con «Hecha» e «Ir a hacerlo» (`ListaOcurrencias`) y
 * «Ponerme al día». Los conteos van en el título de cada bloque. `densa`
 * (la barra del costado y el resumen de «Todas»): filas bajas.
 */
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight, CheckCircle2, ListChecks, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import type { OcurrenciaDTO } from "@/lib/agenda/tipos";
import { ListaOcurrencias } from "../comun/ListaOcurrencias";

const PonermeAlDia = dynamic(() => import("./PonermeAlDia"), { ssr: false });

const HOY_EN_ADMINISTRACION = "/admin?tab=administracion&vista=hoy";

interface Props {
  falta: { hoy: OcurrenciaDTO[]; atrasadas: OcurrenciaDTO[] };
  densa: boolean;
  alDia: boolean;
  onAlDia: (v: boolean) => void;
  /** Ir a otra pestaña cierra la ventana del centro; la barra del costado se queda (`undefined`). */
  alIr?: () => void;
}

function Titulo({ texto, n, children }: { texto: string; n: number; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <CardTitle className="flex items-baseline gap-1.5">
        {texto}
        <span className="text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">{n}</span>
      </CardTitle>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}

export function CuerpoAviso({ falta, densa, alDia, onAlDia, alIr }: Props) {
  const { cargando, error, refrescar } = useAgenda();
  const total = falta.hoy.length + falta.atrasadas.length;

  if (alDia) {
    return <PonermeAlDia ocurrencias={falta.atrasadas} onCerrar={() => (alIr ? alIr() : onAlDia(false))} onIr={alIr ?? (() => undefined)} />;
  }

  return (
    <div
      className={densa ? "space-y-3" : "space-y-4"}
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
          {falta.hoy.length > 0 && (
            <section>
              <Titulo texto="Por hacer hoy" n={falta.hoy.length}>
                <a
                  href={HOY_EN_ADMINISTRACION}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
                    e.preventDefault();
                    void irAEnlace(HOY_EN_ADMINISTRACION);
                  }}
                  className={button({ variant: "ghost", size: "icon", className: "size-10" })}
                  title="Ver todo en Administración › Hoy"
                  aria-label="Ver todo en Administración"
                >
                  <ArrowUpRight className="size-5" aria-hidden="true" />
                </a>
              </Titulo>
              <ListaOcurrencias etiqueta="Lo que falta hoy" ocurrencias={falta.hoy} densa={densa} />
            </section>
          )}
          {falta.atrasadas.length > 0 && (
            <section>
              <Titulo texto="Atrasadas" n={falta.atrasadas.length}>
                <button
                  type="button"
                  data-qa="aviso-poner-al-dia"
                  className={button({ variant: "secondary", size: densa ? "md" : undefined })}
                  onClick={() => onAlDia(true)}
                  title="Pasar lo atrasado de una en una"
                >
                  <ListChecks className="size-4" aria-hidden="true" />
                  Ponerme al día
                </button>
              </Titulo>
              <ListaOcurrencias etiqueta="Lo atrasado" ocurrencias={falta.atrasadas} conFecha densa={densa} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
