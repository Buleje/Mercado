"use client";

/**
 * Una cámara de la lista: su estado, la dirección para copiar, a quién avisa,
 * si mira la pila de trozas y —si el panel la alcanza por la red— el visor.
 *
 * A la vista lo de todos los días (copiar la dirección, conectar, cambiar la
 * dirección — igual que en la línea de arriba de las fotos). Subir a mano y
 * quitar van en «Más»; quitar pregunta antes porque corta lo que la cámara manda.
 */

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
  Wifi,
} from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
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
}: Props) {
  const { confirm } = useConfirm();
  const est = estadoDeConexion(c);
  const [copiado, setCopiado] = useState(false);
  const [visorOculto, setVisorOculto] = useState(false);
  const [edit, setEdit] = useState<{ whatsapp: string; cuando: AvisosCamara["cuando"] } | null>(
    null,
  );
  const archivoRef = useRef<HTMLInputElement>(null);
  const avisos = edit ?? {
    whatsapp: c.avisos?.whatsapp ?? "",
    cuando: c.avisos?.cuando ?? "noche",
  };

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
        <PastillaConexion estado={est} />
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
          title="Ver esta cámara ahora, hablándole directo por su dirección IP"
          className={BTN}
        >
          <Wifi className="h-4 w-4" aria-hidden />
          {est.tipo === "push" ? "Conectar" : "Conexión"}
        </button>
        {est.tipo === "conectada" && (
          <button type="button" onClick={() => setVisorOculto((v) => !v)} className={BTN}>
            {visorOculto ? (
              <Eye className="h-4 w-4" aria-hidden />
            ) : (
              <EyeOff className="h-4 w-4" aria-hidden />
            )}
            {visorOculto ? "Ver ahora" : "Ocultar"}
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
      </div>

      {/* Avisos y pila: lo que la cámara hace sola con cada foto. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
        {/* En el celular la etiqueta y el número se quedan con la fila entera:
            con `min-w-*` (anulado por el `min-width: 0` global) el campo
            quedaba de 10 px a 400. El ⓘ va pegado al rótulo: al final de la
            fila quedaba solo en un tercer renglón. */}
        <div className="flex w-full items-center gap-2 text-sm text-[var(--text-secondary)] sm:w-auto sm:flex-1">
          <MessageCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <span className="whitespace-nowrap font-bold">Avisar al WhatsApp</span>
          <InfoTip
            title="Avisos por WhatsApp"
            what={
              c.avisos?.whatsapp
                ? `Avisa a ${c.avisos.whatsapp} ${c.avisos.cuando === "noche" ? "de noche" : c.avisos.cuando === "siempre" ? "siempre" : "— apagado"} cuando la foto muestra una persona o un vehículo.`
                : "Sin número: la foto queda en el historial y nadie se entera hasta que lo abre."
            }
            affects="Como mucho un aviso cada 10 minutos. «De noche» es de 19:00 a 06:00, cuando el patio está solo."
          />
          <input
            value={avisos.whatsapp}
            onChange={(e) => setEdit({ ...avisos, whatsapp: e.target.value })}
            inputMode="tel"
            placeholder="9 dígitos"
            aria-label={`WhatsApp al que avisa ${c.nombre}`}
            className="h-9 w-full min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select
          value={avisos.cuando}
          onChange={(e) => setEdit({ ...avisos, cuando: e.target.value as AvisosCamara["cuando"] })}
          aria-label={`Cuándo avisa ${c.nombre}`}
          className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          <option value="noche">sólo de noche (19–06)</option>
          <option value="siempre">siempre</option>
          <option value="nunca">nunca</option>
        </select>
        <button
          type="button"
          onClick={async () => {
            if (edit && (await onGuardarAvisos(edit.whatsapp, edit.cuando))) setEdit(null);
          }}
          disabled={guardando || !edit}
          className={cn(BTN, "border-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-40")}
        >
          <Check className="h-4 w-4" aria-hidden /> Guardar
        </button>
      </div>

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
      {est.tipo === "conectada" && !visorOculto && (
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
