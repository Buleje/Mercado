"use client";

/**
 * AvisoAgendaModal — la ventana que sale sola (`AvisoAgendaProgramado`): lo
 * que te falta de hoy y lo atrasado, con «Hecha» e «Ir a hacerlo» igual que en
 * Hoy (`ListaOcurrencias`), cuándo vuelve a salir y cómo callarla un rato.
 * Trae su propio `AgendaProvider`: se abre desde cualquier pestaña del panel.
 */
import type { MouseEvent } from "react";
import { AlarmClock, ArrowUpRight, BellOff, BellRing, CheckCircle2, RefreshCw, Settings } from "@buleje/design-system/icons";
import { CardTitle, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { AgendaProvider, useAgenda } from "@/hooks/use-agenda";
import { cuandoVuelve, loQueFalta, proximoAviso, textoCada, type AvisoPantalla } from "@/lib/agenda/aviso-pantalla";
import { cn } from "@/lib/utils";
import { ESTILO_ESTADO } from "../comun/estado-ocurrencia";
import { fechaLarga } from "../comun/fechas";
import { CLASE_CHIP_ESTADO, ListaOcurrencias } from "../comun/ListaOcurrencias";

const HOY_EN_ADMINISTRACION = "/admin?tab=administracion&vista=hoy";

interface Props {
  config: AvisoPantalla;
  /** ms del próximo aviso según el reloj (puede estar vencido si se abrió a mano). */
  proximo: number;
  onCerrar: () => void;
  onRecordarEn: (min: number) => void;
  onNoMasHoy: () => void;
  onConfigurar: () => void;
}

export default function AvisoAgendaModal(props: Props) {
  return (
    <AgendaProvider>
      <Contenido {...props} />
    </AgendaProvider>
  );
}

function Contenido({ config, proximo, onCerrar, onRecordarEn, onNoMasHoy, onConfigurar }: Props) {
  const { hoy, cargando, recargando, error, refrescar } = useAgenda();
  const falta = loQueFalta(hoy, config);
  const total = falta.hoy.length + falta.atrasadas.length;
  const ahora = Date.now();
  const vuelve = config.activo
    ? `Vuelve ${cuandoVuelve(proximo > ahora ? proximo : proximoAviso(config, ahora, falta.hoy), ahora)}`
    : "El aviso automático está apagado";

  /* «Ir a hacerlo» lleva a otra pestaña: la ventana se cierra para no taparla. */
  const cerrarAlIr = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("a[href]")) onCerrar();
  };

  const recordar: MenuAccion[] = [
    ...[15, 30, 60, 120].map((min) => ({ id: `en-${min}`, label: `En ${textoCada(min)}`, icon: AlarmClock, onSelect: () => onRecordarEn(min) })),
    { id: "hoy-no", label: "No más por hoy", hint: "Vuelve mañana al empezar tu horario", icon: BellOff, onSelect: onNoMasHoy },
  ];

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Lo que te falta hacer"
      description={`${fechaLarga(hoy.fecha)} · ${hoy.cuenta.hechas} de ${hoy.cuenta.total} hechas hoy`}
      icon={BellRing}
      size="lg"
      footer={
        <ModalFooter nota={vuelve}>
          <button type="button" className={button({ variant: "ghost", className: "max-sm:w-12 max-sm:px-0" })} onClick={onConfigurar} title="Configurar el aviso">
            <Settings className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Configurar</span>
          </button>
          <ActionMenu label="Recordarme" icon={AlarmClock} actions={recordar} compactoEnMovil title="Volver a avisarme más tarde" />
          <button type="button" data-qa="aviso-agenda-entendido" className={button({ variant: "primary" })} onClick={onCerrar}>
            Entendido
          </button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")} onClickCapture={cerrarAlIr} aria-busy={recargando}>
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
              <a
                href={HOY_EN_ADMINISTRACION}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  void irAEnlace(HOY_EN_ADMINISTRACION);
                }}
                className={button({ variant: "ghost", className: "ml-auto" })}
              >
                Ver todo
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
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
    </AdminModal>
  );
}
