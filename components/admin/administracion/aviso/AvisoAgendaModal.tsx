"use client";

/**
 * AvisoAgendaModal — el aviso que sale solo (`AvisoAgendaProgramado`): lo que te
 * falta de hoy y lo atrasado (`CuerpoAviso`), cuándo vuelve a salir y cómo
 * callarlo un rato. Se pinta en una de tres formas (Brandon, 20-10): ventana al
 * centro (`AdminModal`), o barra al costado, suelta o fija (`PanelLateralAviso`:
 * no bloquea, la página se achica para hacerle lugar y su ancho se arrastra). Trae su propio `AgendaProvider`: se abre desde
 * cualquier pestaña del panel.
 */
import { useEffect, useState } from "react";
import { AlarmClock, ArrowLeft, BellOff, BellRing, ListChecks, Settings } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { AgendaProvider, useAgenda } from "@/hooks/use-agenda";
import { cuandoVuelve, loQueFalta, proximoAviso, textoCada, type AvisoPantalla, type ModoAviso } from "@/lib/agenda/aviso-pantalla";
import { fechaLarga } from "../comun/fechas";
import { CuerpoAviso } from "./CuerpoAviso";
import { PanelLateralAviso } from "./PanelLateralAviso";

/** Al costado queda abierto horas: lo que marcó la fuente (la asistencia, un gasto) se vuelve a mirar cada 5 min. */
const REFRESCO_AL_COSTADO_MS = 5 * 60_000;

interface Props {
  config: AvisoPantalla;
  modo: ModoAviso;
  /** ms del próximo aviso según el reloj (puede estar vencido si se abrió a mano). */
  proximo: number;
  minimizado: boolean;
  onMinimizar: (v: boolean) => void;
  /** Ancho de la barra del costado en px (`null` = de fábrica). */
  ancho: number | null;
  onAncho: (px: number | null) => void;
  onCambiarModo: (m: ModoAviso) => void;
  onCerrar: () => void;
  onRecordarEn: (min: number) => void;
  onNoMasHoy: () => void;
  onConfigurar: () => void;
}

export default function AvisoAgendaModal(props: Props) {
  return (
    <AgendaProvider>
      <Marco {...props} />
    </AgendaProvider>
  );
}

function Marco({ config, modo, proximo, minimizado, onMinimizar, ancho, onAncho, onCambiarModo, onCerrar, onRecordarEn, onNoMasHoy, onConfigurar }: Props) {
  const { hoy, recargando, refrescar } = useAgenda();
  const [alDia, setAlDia] = useState(false);
  const falta = loQueFalta(hoy, config);
  const ahora = Date.now();
  const vuelve = config.activo
    ? `Vuelve ${cuandoVuelve(proximo > ahora ? proximo : proximoAviso(config, ahora, falta.hoy), ahora)}`
    : "El aviso automático está apagado";

  useEffect(() => {
    if (modo === "ventana") return;
    const t = setInterval(refrescar, REFRESCO_AL_COSTADO_MS);
    return () => clearInterval(t);
  }, [modo, refrescar]);

  const titulo = alDia ? "Ponerme al día" : "Lo que te falta hacer";
  const descripcion = alDia ? "Lo atrasado, de una en una" : `${fechaLarga(hoy.fecha)} · ${hoy.cuenta.hechas} de ${hoy.cuenta.total} hechas hoy`;

  const recordar: MenuAccion[] = [
    ...[15, 30, 60, 120].map((min) => ({ id: `en-${min}`, label: `En ${textoCada(min)}`, icon: AlarmClock, onSelect: () => onRecordarEn(min) })),
    { id: "hoy-no", label: "No más por hoy", hint: "Vuelve mañana al empezar tu horario", icon: BellOff, onSelect: onNoMasHoy },
  ];

  const pie = alDia ? (
    <ModalFooter>
      <button type="button" data-qa="poner-al-dia-volver" className={button({ variant: "ghost" })} onClick={() => setAlDia(false)}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a la lista
      </button>
    </ModalFooter>
  ) : (
    <ModalFooter nota={modo === "ventana" ? vuelve : undefined}>
      <button type="button" className={button({ variant: "ghost", className: "max-sm:w-12 max-sm:px-0" })} onClick={onConfigurar} title="Configurar los recordatorios">
        <Settings className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">Configurar</span>
      </button>
      <ActionMenu label="Recordarme" icon={AlarmClock} actions={recordar} compactoEnMovil title={`Volver a avisarme más tarde · ${vuelve}`} />
      <button type="button" data-qa="aviso-agenda-entendido" className={button({ variant: "primary" })} onClick={onCerrar}>
        Entendido
      </button>
    </ModalFooter>
  );

  const cuerpo = <CuerpoAviso falta={falta} modo={modo} alDia={alDia} onAlDia={setAlDia} onCambiarModo={onCambiarModo} onCerrar={onCerrar} />;

  if (modo !== "ventana") {
    return (
      <PanelLateralAviso
        modo={modo}
        titulo={titulo}
        descripcion={descripcion}
        pendientes={falta.hoy.length + falta.atrasadas.length}
        minimizado={minimizado}
        onMinimizar={onMinimizar}
        ancho={ancho}
        onAncho={onAncho}
        onCambiarModo={onCambiarModo}
        onCerrar={onCerrar}
        pie={pie}
      >
        {cuerpo}
      </PanelLateralAviso>
    );
  }

  return (
    <AdminModal open onClose={onCerrar} title={titulo} description={descripcion} icon={alDia ? ListChecks : BellRing} size="lg" footer={pie}>
      <div className={`${MODAL_BODY} space-y-4`} aria-busy={recargando}>
        {cuerpo}
      </div>
    </AdminModal>
  );
}
