"use client";

/**
 * Una cámara de la lista: su estado, la dirección para copiar, a quién avisa,
 * si mira la pila de trozas y —si el panel la alcanza por la red— el visor.
 *
 * A la vista lo de todos los días (copiar la dirección, conectar, cambiar la
 * dirección — igual que en la línea de arriba de las fotos). Subir a mano y
 * quitar van en «Más»; quitar pregunta antes porque corta lo que la cámara manda.
 */

import { useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
  Wifi,
} from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { formatDateTimeShort } from "@/lib/format";
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
import { BTN } from "./camaras-ui";

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
  const { confirm } = useConfirm();
  const est = estadoDeConexion(c);
  const [copiado, setCopiado] = useState(false);
  const [visorOculto, setVisorOculto] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  /* Sin `capture`: abre la galería, para subir una captura de pantalla de la
     app de la cámara (Hik-Connect) — con `capture` el celular solo ofrecía
     sacar una foto nueva (Brandon 2026-10-03, puente con el celular). */
  const galeriaRef = useRef<HTMLInputElement>(null);
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

  const menu = [
    {
      id: "subir",
      label: "Subir una foto a mano",
      hint: "Por la misma puerta que usa la cámara",
      icon: Upload,
      busy: subiendo,
      onSelect: () => archivoRef.current?.click(),
    },
    {
      id: "galeria",
      label: "Subir desde la galería",
      hint: "Una captura de pantalla de la app de la cámara (Hik-Connect): la IA la lee igual",
      icon: Upload,
      busy: subiendo,
      onSelect: () => galeriaRef.current?.click(),
    },
    {
      id: "quitar",
      label: "Quitar la cámara",
      hint: "Las fotos que mandó se quedan",
      icon: Trash2,
      tone: "danger" as const,
      disabled: guardando,
      onSelect: async () => {
        const ok = await confirm({
          title: `¿Quitar ${c.nombre}?`,
          description: "Deja de recibir fotos. Las que ya mandó siguen en el historial.",
          intent: "danger",
          confirmLabel: "Quitar",
        });
        if (ok) onQuitar();
      },
    },
  ];

  return (
    <li
      className="rounded-xl border border-[var(--rule-base)] px-3 py-2.5"
      data-testid="camara-fila"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* En celular el nombre se queda con la fila entera (a 400 px se leía «Port…»). */}
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
            {c.nombre}
          </span>
          <span className="block truncate text-xs text-[var(--text-tertiary)]">
            {c.lugar || "Sin lugar declarado"} ·{" "}
            {c.ultimaCapturaEn
              ? `última foto ${formatDateTimeShort(c.ultimaCapturaEn)}`
              : "todavía no mandó nada"}
          </span>
        </span>
        {puente.esPuente ? <PastillaPuente cuadro={puente.cuadro} /> : <PastillaConexion estado={est} />}
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
            title={visorOculto ? "Ver la cámara ahora" : "Ocultar el visor"}
            aria-label={visorOculto ? `Ver ${c.nombre} ahora` : `Ocultar el visor de ${c.nombre}`}
            aria-pressed={!visorOculto}
            className={cn(BTN, "w-9 justify-center px-0")}
          >
            {visorOculto ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
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
        <ActionMenu
          label={`Más de ${c.nombre}`}
          icon={MoreHorizontal}
          soloIcono
          size="sm"
          actions={menu}
        />
        <input
          ref={archivoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Subir una foto a mano a ${c.nombre}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onSubir(f);
          }}
        />
        <input
          ref={galeriaRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label={`Subir una imagen de la galería a ${c.nombre}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onSubir(f);
          }}
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
          <VisorPuentePc nombre={c.nombre} cuadro={puente.cuadro} cajaRef={puente.cajaRef} onAjustar={onConectar}>
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
