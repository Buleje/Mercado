"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, CheckCheck, Copy, MoreHorizontal, Phone, RefreshCw, Search, Users } from "@buleje/design-system/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { ListaDestinatarios } from "./mensajes-masivos/ListaDestinatarios";
import { EditorMensaje } from "./mensajes-masivos/EditorMensaje";
import {
  aplicarPlantilla,
  ETIQUETA_SEGMENTO,
  ORDEN_SEGMENTOS,
  perteneceAlSegmento,
  PLANTILLAS,
  soloDigitos,
  type Segmento,
} from "./mensajes-masivos/shared";
import { useDestinatarios } from "./mensajes-masivos/use-destinatarios";
import { VistaPreviaWhatsApp } from "./mensajes-masivos/VistaPreviaWhatsApp";

interface MassMessageSenderProps {
  /** Teléfonos preseleccionados (p. ej. desde un segmento RFM). Activa el segmento «rfm-preset». */
  preselectedPhones?: string[];
  /** Nombre del segmento preseleccionado, para el rótulo. */
  presetLabel?: string;
}

export default function MassMessageSender({ preselectedPhones, presetLabel }: MassMessageSenderProps = {}) {
  const { clientes, cargando, error, recargar } = useDestinatarios();
  const telefonosDelPreset = useMemo(
    () => (preselectedPhones && preselectedPhones.length > 0 ? new Set(preselectedPhones.map(soloDigitos)) : null),
    [preselectedPhones],
  );
  const [segmento, setSegmento] = useState<Segmento>(telefonosDelPreset ? "rfm-preset" : "todos");
  const [busqueda, setBusqueda] = useState("");
  const [plantilla, setPlantilla] = useState<string>(PLANTILLAS[0].texto);
  const [claveElegida, setClaveElegida] = useState<string>(PLANTILLAS[0].clave);
  const [copiado, setCopiado] = useState<"mensajes" | "numeros" | null>(null);
  const [telefonoEjemplo, setTelefonoEjemplo] = useState("");

  useEffect(() => {
    if (telefonosDelPreset) setSegmento("rfm-preset");
  }, [telefonosDelPreset]);

  const ahora = useMemo(() => Date.now(), [clientes]);
  const cuenta = useCallback(
    (s: Segmento) => clientes.filter((c) => perteneceAlSegmento(c, s, telefonosDelPreset, ahora)).length,
    [clientes, telefonosDelPreset, ahora],
  );

  const destinatarios = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter(
      (c) => perteneceAlSegmento(c, segmento, telefonosDelPreset, ahora) && (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)),
    );
  }, [clientes, segmento, busqueda, telefonosDelPreset, ahora]);

  const conNumero = destinatarios.filter((c) => soloDigitos(c.phone)).length;
  const sinNumero = destinatarios.length - conNumero;
  const ejemplo = destinatarios.find((c) => c.phone === telefonoEjemplo) ?? destinatarios[0] ?? null;
  const textoVista = ejemplo ? aplicarPlantilla(plantilla, ejemplo) : plantilla;
  const puedeEnviar = conNumero > 0 && plantilla.trim().length > 0;

  const copiar = useCallback(async (que: "mensajes" | "numeros") => {
    const lineas = destinatarios
      .filter((c) => soloDigitos(c.phone))
      .map((c) => (que === "mensajes" ? `${c.name} | +51${soloDigitos(c.phone)} | ${aplicarPlantilla(plantilla, c)}` : `+51${soloDigitos(c.phone)}`));
    await navigator.clipboard.writeText(lineas.join("\n"));
    setCopiado(que);
    setTimeout(() => setCopiado(null), 3000);
  }, [destinatarios, plantilla]);

  const acciones: MenuAccion[] = [
    { id: "numeros", label: "Copiar solo los números", hint: "Un número por línea, con +51", icon: Phone, onSelect: () => void copiar("numeros"), disabled: conNumero === 0 },
    { id: "refrescar", label: "Actualizar clientes", icon: RefreshCw, onSelect: () => void recargar() },
  ];

  const rotuloSegmento = (s: Segmento) =>
    s === "rfm-preset" ? `Segmento RFM${presetLabel ? `: ${presetLabel}` : ""} (${cuenta(s)})` : `${ETIQUETA_SEGMENTO[s]} (${cuenta(s)})`;
  const segmentosVisibles: Segmento[] = telefonosDelPreset ? ["rfm-preset", ...ORDEN_SEGMENTOS] : ORDEN_SEGMENTOS;

  if (cargando) return <LoadingState message="Cargando tus clientes…" />;
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)]">No pudimos cargar tus clientes. Revisa tu conexión e inténtalo otra vez.</p>
        <button type="button" onClick={() => void recargar()} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Mensajes masivos</SectionTitle>
          <InfoTip
            title="Mensajes masivos"
            what="Escribes un mensaje, eliges a quiénes les llega y lo mandas por WhatsApp. Cada uno lleva el nombre del cliente."
            affects="No se envía nada solo: «Copiar mensajes» arma la lista y «Abrir» deja listo el WhatsApp de cada cliente para que tú le des enviar."
            example="Segmento «No compran hace más de 30 días» + plantilla «Te extrañamos»."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void copiar("mensajes")}
            disabled={!puedeEnviar}
            className={button({ variant: "primary", className: cn("shrink-0 gap-1.5 rounded-xl px-4 disabled:opacity-60", "h-12") })}
          >
            {copiado === "mensajes" ? <CheckCheck className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copiado === "mensajes" ? "Lista copiada" : `Copiar ${conNumero} ${conNumero === 1 ? "mensaje" : "mensajes"}`}
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Copiar solo los números y actualizar clientes" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={segmento}
          onChange={(e) => setSegmento(e.target.value as Segmento)}
          aria-label="Segmento de clientes"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none sm:max-w-sm"
        >
          {segmentosVisibles.map((s) => <option key={s} value={s}>{rotuloSegmento(s)}</option>)}
        </select>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en el segmento…"
            aria-label="Buscar en el segmento"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-primary focus:outline-none"
          />
        </div>
        <p role="status" className="flex h-12 items-center gap-2 rounded-xl bg-[var(--accent-soft)] px-3 text-sm text-[var(--text-primary)]">
          <Users className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <span>
            Les llega a <strong>{conNumero}</strong> de {clientes.length}
            {sinNumero > 0 && <span className="text-[var(--data-warning-ink)]"> · {sinNumero} sin número</span>}
          </span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EditorMensaje
          plantilla={plantilla}
          claveElegida={claveElegida}
          onTexto={(t) => { setPlantilla(t); setClaveElegida(""); }}
          onElegirPlantilla={(clave, texto) => { setClaveElegida(clave); setPlantilla(texto); }}
        />
        <VistaPreviaWhatsApp ejemplos={destinatarios.slice(0, 10)} elegido={ejemplo} onElegir={setTelefonoEjemplo} texto={textoVista} />
      </div>

      <ListaDestinatarios destinatarios={destinatarios} plantilla={plantilla} />
    </div>
  );
}

