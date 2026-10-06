"use client";

/**
 * Una cámara de la lista: su estado, la dirección para copiar, a quién avisa,
 * si mira la pila de trozas y —si el panel la alcanza por la red— el visor.
 *
 * A la vista lo de todos los días (copiar la dirección, conectar, cambiar la
 * dirección — igual que en la línea de arriba de las fotos). Subir a mano y
 * quitar van en «Más»; quitar pregunta antes porque corta lo que la cámara manda.
 */

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Wifi,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { AvisosCamara } from "@/lib/camaras/camaras";
import {
  estadoDeConexion,
  PastillaConexion,
  queHacer,
  type CamaraConConexion,
} from "./ConectarCamaraModal";
import VisorEnVivo from "./VisorEnVivo";
import VisorPuentePc, { PastillaPuente } from "./VisorPuentePc";
import FilaAvisosWhatsapp from "./FilaAvisosWhatsapp";
import { usePuenteDeFila } from "./use-puente-pc";
import InterruptorPila from "./InterruptorPila";
import ControlPtz from "./ControlPtz";
import RenombrarCamara from "./RenombrarCamara";
import { BTN } from "./camaras-ui";
import BotonEnVivo from "./BotonEnVivo";
import MenuMasCamara from "./MenuMasCamara";
import { lineaDeAviso } from "./ultimo-aviso";
import { useAhora } from "./use-plataforma";

interface Props {
  camara: CamaraConConexion;
  /** La dirección PÚBLICA para pegar en la cámara; `""` mientras se averigua. */
  direccion: string;
  /** Por qué no hay dirección que copiar (túnel cerrado, todavía averiguando). */
  motivoSinDireccion: string;
  /** La local, para lo que sube este navegador (el visor). */
  direccionLocal: string;
  guardando: boolean;
  subiendo: boolean;
  onConectar: () => void;
  onProbar: () => void;
  onMover: (x: number, y: number, zoom: number) => void;
  onSubir: (archivo: File) => void;
  onRotar: () => void;
  onQuitar: () => void;
  onGuardarAvisos: (whatsapp: string, cuando: AvisosCamara["cuando"]) => Promise<unknown>;
  onVigilarPila: (activa: boolean) => void;
  onFotoGuardada: () => void;
  onErrorCopia: () => void;
  /** Con puente de pantalla: la última lectura de la IA, debajo del visor. */
  lecturaPuente?: ReactNode;
}

export default function CamaraFila({
  camara: c,
  direccion,
  motivoSinDireccion,
  direccionLocal,
  guardando,
  subiendo,
  onConectar,
  onProbar,
  onMover,
  onSubir,
  onRotar,
  onQuitar,
  onGuardarAvisos,
  onVigilarPila,
  onFotoGuardada,
  onErrorCopia,
  lecturaPuente,
}: Props) {
  const est = estadoDeConexion(c);
  const [copiado, setCopiado] = useState(false);
  const [visorOculto, setVisorOculto] = useState(false);
  const ahora = useAhora();
  /* Puente de pantalla (ADR-466): la pastilla y el visor leen el mismo cuadro. */
  const puente = usePuenteDeFila(c, visorOculto);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(direccion);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      onErrorCopia();
    }
  };

  return (
    <li
      id={`camara-${c.id}`}
      className="scroll-mt-4 rounded-xl border border-[var(--rule-base)] px-3 py-2.5"
      data-testid="camara-fila"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* En celular el nombre se queda con la fila entera (a 400 px se leía «Port…»). */}
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="min-w-0 truncate text-sm font-bold text-[var(--text-primary)]">
              {c.nombre}
            </span>
            {/* El lápiz relee la lista con la misma recarga silenciosa que una foto subida. */}
            <RenombrarCamara id={c.id} nombre={c.nombre} lugar={c.lugar ?? ""} onListo={onFotoGuardada} />
          </span>
          <span className="block truncate text-xs text-[var(--text-tertiary)]">
            {c.lugar || "Sin lugar declarado"} · {lineaDeAviso(c, ahora)}
          </span>
        </span>
        {puente.esPuente ? (
          <PastillaPuente cuadro={puente.cuadro} />
        ) : (
          <PastillaConexion estado={est} />
        )}
        {/* Sin visor propio, «En vivo» abre Hik-Connect; con él, lo hace el ojo de abajo. */}
        {est.tipo !== "conectada" && !puente.esPuente && <BotonEnVivo nombre={c.nombre} camaraId={c.id} />}
        <button
          type="button"
          onClick={() => void copiar()}
          disabled={!direccion}
          title={direccion ? "Copiar la dirección para pegarla en la cámara" : motivoSinDireccion}
          className={BTN}
        >
          {copiado ? (
            <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copiado ? "Copiada" : "Copiar dirección"}
        </button>
        <button
          type="button"
          onClick={onConectar}
          title="Ver esta cámara ahora: directo por su IP o con el puente desde la PC"
          className={BTN}
        >
          <Wifi className="h-4 w-4" aria-hidden />
          {est.tipo === "push" && !puente.esPuente ? "Conectar" : "Conexión"}
        </button>
        {(est.tipo === "conectada" || puente.esPuente) && (
          /* Sólo ícono: con la pastilla del puente, el texto partía la fila en dos a 1280. */
          <button
            type="button"
            onClick={() => setVisorOculto((v) => !v)}
            title={visorOculto ? "Ver en vivo con el visor del panel" : "Ocultar el visor"}
            aria-label={visorOculto ? `Ver ${c.nombre} ahora` : `Ocultar el visor de ${c.nombre}`}
            aria-pressed={!visorOculto}
            className={cn(BTN, "w-9 justify-center px-0")}
          >
            {visorOculto ? (
              <Eye className="h-4 w-4" aria-hidden />
            ) : (
              <EyeOff className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onRotar}
          disabled={guardando}
          title="Dirección nueva: la anterior deja de funcionar"
          aria-label={`Cambiar la dirección de ${c.nombre}`}
          className={cn(BTN, "w-9 justify-center px-0")}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
        <MenuMasCamara
          nombre={c.nombre}
          guardando={guardando}
          subiendo={subiendo}
          onSubir={onSubir}
          onQuitar={onQuitar}
        />
      </div>

      {/* Avisos y pila: lo que la cámara hace sola con cada foto. */}
      <FilaAvisosWhatsapp camara={c} guardando={guardando} onGuardarAvisos={onGuardarAvisos} />

      <InterruptorPila camara={c} guardando={guardando} onCambiar={onVigilarPila} />

      {/* Conexión directa: sólo aparece cuando hay algo que decir. */}
      {est.tipo === "falla" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <p className="min-w-[12rem] flex-1 text-sm text-[var(--text-secondary)]">
            {queHacer(est.motivo, est.detalle)}
            {est.detalle && (
              <span className="mt-0.5 block break-words font-mono text-xs text-[var(--text-tertiary)]">
                {est.detalle}
              </span>
            )}
          </p>
          <button type="button" onClick={onProbar} disabled={guardando} className={BTN}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Probar de nuevo
          </button>
        </div>
      )}
      {puente.esPuente && !visorOculto && (
        <div className="mt-2 border-t border-[var(--rule-soft)] pt-2">
          <VisorPuentePc
            nombre={c.nombre}
            cuadro={puente.cuadro}
            cajaRef={puente.cajaRef}
            onAjustar={onConectar}
          >
            {lecturaPuente}
          </VisorPuentePc>
        </div>
      )}
      {!puente.esPuente && est.tipo === "conectada" && !visorOculto && (
        <div className="mt-2 space-y-2 border-t border-[var(--rule-soft)] pt-2">
          <VisorEnVivo
            camaraId={c.id}
            nombre={c.nombre}
            direccionWebhook={direccionLocal}
            onGuardada={onFotoGuardada}
          />
          {est.conexion.soportaPtz && <ControlPtz onMover={onMover} disabled={guardando} />}
        </div>
      )}
      {subiendo && (
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Subiendo la foto…
        </p>
      )}
    </li>
  );
}
