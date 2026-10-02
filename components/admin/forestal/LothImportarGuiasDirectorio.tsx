"use client";

/**
 * «Directorio» en la vista previa de «Importar guías despachadas» (ADR-461,
 * 02-10 noche — Brandon: «opción para poder guardar en el directorio si es
 * dato o permiso nuevo: RUC nuevo, razón social nueva, permiso nuevo → agregar
 * al directorio para luego reutilizar»).
 *
 * Cada parte de la guía (titular, propietario, destinatario, transportista y
 * conductor), su vehículo y su permiso, frente al directorio del negocio:
 *   · nuevo → «Agregar al directorio» (marcado), con el nombre y el documento
 *     corregibles (la guía no publica el RUC del titular si no es el propietario);
 *   · ya está → «Completar con la guía» si le falta algo que la guía trae
 *     (nunca pisa lo escrito);
 *   · es tu negocio → no se ofrece.
 * Lo detectó el servidor; se guarda DESPUÉS de anotar la guía.
 */

import { useState } from "react";
import { Building2, FileText, Truck, User, UserPlus } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ROL_LABEL, motivoDocInvalido } from "@/lib/forestal/directorio";
import { listaDeDatos } from "@/lib/forestal/loth-importar-guia-directorio";
import type {
  DirectorioDeLaGuia,
  EstadoEnDirectorio,
  ExistenteEnDirectorio,
  ParteEnLaGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";
import { accionPosible, type DecisionFicha, type DecisionesDirectorio } from "./hooks/importar-guias-pantalla";
import { TONO } from "./LothImportarGuiasTablas";
import { CampoDocTipo, CampoTexto } from "./LothImportarGuiasCampos";

const CHIP: Record<EstadoEnDirectorio, { texto: string; clase: string }> = {
  nuevo: { texto: "Nuevo", clase: "bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" },
  /* La fila ya va sobre --surface-sunken: el chip neutro lleva su propio fondo y borde para verse. */
  existe: { texto: "Ya está en el directorio", clase: "bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--rule-base)]" },
  propio: { texto: "Es tu negocio", clase: "bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--rule-base)]" },
  no_valido: { texto: "No se puede guardar", clase: TONO.aviso },
};

type Cambiar = (ficha: string, cambio: Partial<DecisionFicha>) => void;

/** «dirección, licencia, papel de destinatario». */
const queCompleta = (e: ExistenteEnDirectorio) =>
  [listaDeDatos(e.faltan), ...e.rolesQueFaltan.map((r) => `papel de ${ROL_LABEL[r].toLowerCase()}`)].filter(Boolean).join(", ");

export default function LothImportarGuiasDirectorio({
  d,
  decisiones,
  onDecidir,
  activa,
}: {
  d: DirectorioDeLaGuia;
  decisiones: DecisionesDirectorio;
  onDecidir: Cambiar;
  /** La guía va en la importación: si no, nada de esto se guarda. */
  activa: boolean;
}) {
  const marcadas = Object.values(decisiones).filter((x) => x.marcada).length;
  /* Abierta al llegar si hay algo marcado; después la abre y cierra la persona
     (destildar la última no la cierra en la cara). */
  const [abiertaAlInicio] = useState(() => activa && marcadas > 0);
  const nuevas = [...d.partes.map((p) => p.estado), d.vehiculo?.estado, d.permiso?.estado].filter((e) => e === "nuevo").length;
  const resumen = [
    nuevas > 0 && `${nuevas} ${nuevas === 1 ? "nuevo" : "nuevos"}`,
    marcadas > 0 && (activa ? `${marcadas} se ${marcadas === 1 ? "guarda" : "guardan"}` : "no se guarda (guía sin marcar)"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className="border-t border-[var(--rule-soft)]" open={abiertaAlInicio}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 px-3 py-1 text-sm font-semibold text-[var(--text-primary)]">
        Directorio
        <span className="font-normal text-[var(--text-secondary)]">· {resumen || "todos ya están"}</span>
      </summary>
      <div className={`space-y-2 px-3 pb-3 ${activa ? "" : "opacity-60"}`}>
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          Quién de esta guía ya está en tu directorio
          <InfoTip
            title="Guardar en el directorio"
            what="Lo nuevo de la guía (titular, destinatario, transportista, placa y permiso) queda en el Directorio para elegirlo después sin tipear. Se guarda al importar la guía, no antes."
            affects="Se reconoce por el RUC o DNI, la placa o el código del permiso. Completar sólo agrega lo que falta: nunca cambia lo que ya escribiste."
            example="SERFOR no publica el RUC del titular cuando el propietario es otro: escríbelo acá si lo tienes."
            side="left"
          />
        </p>
        <ul className="space-y-2">
          {d.partes.map((p) => (
            <FilaParte key={p.clave} p={p} decision={decisiones[p.clave]} onDecidir={onDecidir} />
          ))}
          {d.vehiculo && (
            <Fila
              icono={<Truck className="h-4 w-4" aria-hidden />}
              papel="Vehículo"
              nombre={d.vehiculo.placa}
              detalle={[d.vehiculo.placaRemolque && `remolque ${d.vehiculo.placaRemolque}`, d.vehiculo.tipo].filter(Boolean).join(" · ")}
              estado={d.vehiculo.estado}
              existente={d.vehiculo.existente}
              aviso={d.vehiculo.aviso}
              clave="vehiculo"
              decision={decisiones.vehiculo}
              onDecidir={onDecidir}
            >
              <CampoTexto
                label="Placa"
                value={decisiones.vehiculo?.placa ?? d.vehiculo.placa}
                onChange={(placa) => onDecidir("vehiculo", { placa })}
                className="sm:max-w-[12rem]"
                mono
              />
            </Fila>
          )}
          {d.permiso && (
            <Fila
              icono={<FileText className="h-4 w-4" aria-hidden />}
              papel="Permiso"
              nombre={d.permiso.codigo}
              mono
              detalle={[d.permiso.tipo, d.permiso.titularNombre, d.permiso.resolucionNumero && `Res. ${d.permiso.resolucionNumero}`].filter(Boolean).join(" · ")}
              estado={d.permiso.estado}
              existente={d.permiso.existente}
              aviso={d.permiso.aviso}
              clave="permiso"
              decision={decisiones.permiso}
              onDecidir={onDecidir}
              notaAgregar="queda atado al titular y, si el plan del libro no tiene permiso, a ese plan"
            />
          )}
        </ul>
      </div>
    </details>
  );
}

function FilaParte({ p, decision, onDecidir }: { p: ParteEnLaGuia; decision: DecisionFicha | undefined; onDecidir: Cambiar }) {
  const Icono = p.docTipo === "RUC" ? Building2 : User;
  const docNumero = decision?.docNumero ?? "";
  const docTipo = decision?.docTipo ?? null;
  const motivo = docNumero.trim() && docTipo ? motivoDocInvalido(docTipo, docNumero) : docNumero.trim() && !docTipo ? "Elige si es RUC o DNI." : null;
  return (
    <Fila
      icono={<Icono className="h-4 w-4" aria-hidden />}
      papel={p.papel}
      /* El nombre de la GUÍA; si el directorio lo escribe distinto, lo dice el aviso. */
      nombre={p.nombre}
      detalle={[p.docNumero && `${p.docTipo ?? "Doc."} ${p.docNumero}`, p.roles.map((r) => ROL_LABEL[r].toLowerCase()).join(" y ")].filter(Boolean).join(" · ")}
      estado={p.estado}
      existente={p.existente}
      aviso={p.aviso}
      clave={p.clave}
      decision={decision}
      onDecidir={onDecidir}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]">
        <CampoTexto label="Nombre o razón social" value={decision?.nombre ?? p.nombre} onChange={(nombre) => onDecidir(p.clave, { nombre })} />
        <CampoDocTipo value={docTipo} onChange={(t) => onDecidir(p.clave, { docTipo: t })} />
        <CampoTexto
          label="N° de documento"
          value={docNumero}
          onChange={(v) => onDecidir(p.clave, { docNumero: v.replace(/\D/g, "").slice(0, 11) })}
          mono
          numerico
          error={motivo}
        />
      </div>
    </Fila>
  );
}

function Fila({
  icono,
  papel,
  nombre,
  mono,
  detalle,
  estado,
  existente,
  aviso,
  clave,
  decision,
  onDecidir,
  notaAgregar,
  children,
}: {
  icono: React.ReactNode;
  papel: string;
  nombre: string;
  mono?: boolean;
  detalle: string;
  estado: EstadoEnDirectorio;
  existente: ExistenteEnDirectorio | null;
  aviso: string | null;
  clave: string;
  decision: DecisionFicha | undefined;
  onDecidir: Cambiar;
  notaAgregar?: string;
  /** Lo que se corrige antes de agregar (sólo si es nuevo y va marcado). */
  children?: React.ReactNode;
}) {
  const accion = accionPosible(estado, existente);
  const chip = CHIP[estado];
  const marcada = !!decision?.marcada;
  return (
    <li className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[var(--text-tertiary)]">{icono}</span>
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">{papel}</span>
        <span className={`min-w-0 font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere] ${mono ? "font-mono" : ""}`}>{nombre}</span>
        <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold ${chip.clase}`}>{chip.texto}</span>
      </div>
      {detalle && <p className="mt-0.5 text-sm text-[var(--text-secondary)] [overflow-wrap:anywhere]">{detalle}</p>}
      {aviso && <p className="mt-0.5 text-sm text-[var(--data-warning-ink)]">{aviso}</p>}
      {accion && decision && (
        <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
            checked={marcada}
            onChange={(e) => onDecidir(clave, { marcada: e.target.checked })}
          />
          {accion === "agregar" ? (
            <span>
              {estado === "nuevo" && <UserPlus className="mr-1 inline h-4 w-4 align-[-3px]" aria-hidden />}
              Agregar al directorio
              {notaAgregar && <span className="font-normal text-[var(--text-secondary)]"> · {notaAgregar}</span>}
            </span>
          ) : (
            <span>
              Completar con la guía{existente && <span className="font-normal text-[var(--text-secondary)]">: {queCompleta(existente)}</span>}
            </span>
          )}
        </label>
      )}
      {accion === "agregar" && marcada && children}
    </li>
  );
}
