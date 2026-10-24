"use client";

/**
 * Las cifras plegables de Automatizaciones (botón «Indicadores» en la fila del
 * título, `useKpisPlegables`): cuántos modelos responden y, por canal, cuántos
 * teléfonos/chats/flujos hay y cuándo se usó por última vez. Ninguna otra
 * pantalla del panel lo junta. Una cifra que todavía no llegó no se dibuja
 * como cero: el panel muestra esqueletos hasta que los cuatro contestan.
 */

import type { ReactNode } from "react";
import { Activity, MessageCircle, Send, Webhook, type LucideIcon } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { cn } from "@/lib/utils";
import { haceCuanto, masReciente, usoDe, type Canal } from "./shared";
import type { ConfigN8n, Diagnostico, EstadoTelegram, EstadoWhatsApp } from "./tipos";

function CifraCanal({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
  aviso,
}: {
  etiqueta: string;
  valor: string;
  detalle: ReactNode;
  icono: LucideIcon;
  aviso?: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        {etiqueta}
        <Icono aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      </span>
      <span className={cn("text-2xl font-bold tabular-nums text-[var(--text-primary)]", aviso && "text-[var(--data-warning-ink)]")}>
        {valor}
      </span>
      <span className="text-sm text-[var(--text-secondary)]">{detalle}</span>
    </div>
  );
}

export function useIndicadoresCanales({
  salud,
  saludCargando,
  wa,
  tg,
  n8n,
}: {
  salud: Diagnostico | null;
  saludCargando: boolean;
  wa: Canal<EstadoWhatsApp>;
  tg: Canal<EstadoTelegram>;
  n8n: Canal<ConfigN8n>;
}) {
  const sinDatosAun = saludCargando || wa.cargando || tg.cargando || n8n.cargando;

  /* Modelos: los de texto/audio + leer fotos. */
  const total = salud ? salud.modelos.length + 1 : 0;
  const responden = salud ? salud.modelos.filter((m) => m.estado === "ok").length + (salud.vision.disponible ? 1 : 0) : 0;
  const falta = salud
    ? [...salud.modelos.filter((m) => m.estado !== "ok").map((m) => m.para), ...(salud.vision.disponible ? [] : ["leer fotos"])]
    : [];

  const telefonos = wa.dato?.duenos.length ?? 0;
  const chats = tg.dato?.chats.length ?? 0;
  const flujos = n8n.dato?.flujos ?? [];
  const activos = flujos.filter((f) => f.activo).length;
  const ultimoDisparo = masReciente(flujos.map((f) => f.ultimoDisparo?.fecha));

  /* Un canal «anota» si tiene con quién: un teléfono, un chat o un flujo encendido. */
  const canalesActivos = [telefonos > 0, chats > 0, activos > 0].filter(Boolean).length;

  const tarjetas = [
    <CifraCanal
      key="ia"
      etiqueta="IA que responde"
      icono={Activity}
      valor={salud ? `${responden} de ${total}` : "—"}
      aviso={salud ? responden < total : true}
      detalle={!salud ? "No se pudo preguntar" : falta.length ? `Falta: ${falta.join(", ")}` : "Todo responde"}
    />,
    <CifraCanal
      key="wa"
      etiqueta="Teléfonos de WhatsApp"
      icono={MessageCircle}
      valor={String(telefonos)}
      detalle={
        !wa.dato ? "No se pudo leer" : !wa.dato.activo ? "Sin número del negocio" : usoDe(masReciente(wa.dato.duenos.map((d) => d.ultimoUso)))
      }
    />,
    <CifraCanal
      key="tg"
      etiqueta="Chats de Telegram"
      icono={Send}
      valor={tg.dato?.configurado ? String(chats) : "—"}
      detalle={
        !tg.dato ? "No se pudo leer" : !tg.dato.configurado ? "Sin bot configurado" : usoDe(masReciente(tg.dato.chats.map((c) => c.ultimoUso)))
      }
    />,
    <CifraCanal
      key="n8n"
      etiqueta="Flujos de n8n"
      icono={Webhook}
      valor={flujos.length ? `${activos} de ${flujos.length}` : "0"}
      detalle={
        !n8n.dato ? "No se pudo leer" : ultimoDisparo ? `Disparado ${haceCuanto(ultimoDisparo)}` : n8n.dato.token ? "Token listo" : "Sin token"
      }
    />,
  ];

  return useKpisPlegables({
    claveMemoria: "asistente-ia:automatizaciones",
    tarjetas,
    /* La IA ya tiene su chip en la cabecera: el titular dice lo de los canales. */
    resumen: `${canalesActivos}/3 canales`,
    sinDatosAun,
    alto: "md",
    compactoEnMovil: true,
  });
}
