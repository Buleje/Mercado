"use client";

/**
 * Una guía en la vista previa de «Importar guías despachadas» (ADR-461): de
 * qué guía se trata y qué avisa (arriba, siempre a la vista) y, en tres
 * pestañas (07-10-2026): «Datos de la guía» (titular, propietario,
 * destinatario, transporte), «Trozas y resumen» (la lista con el ≈pt aserrable,
 * el resumen por especie, el (37) y la tala referencial) y «Directorio» (quién
 * de ella entra al directorio). Todo lo calculó el servidor; acá
 * se muestra y se decide si entra.
 */

import { useId, useState } from "react";
import { AlertOctagon, AlertTriangle, Info } from "@buleje/design-system/icons";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import type {
  AvisoImportacion,
  GuiaVistaPrevia,
  SobreAutorizadoDeLaGuia,
} from "@/lib/forestal/loth-importar-guia-tipos";
import {
  esImportable,
  estadoEfectivo,
  sobreAutorizadoConMotivo,
  sobreCupoEfectivo,
  type DecisionFicha,
  type DecisionesDirectorio,
} from "./hooks/importar-guias-pantalla";
import { TONO } from "./LothImportarGuiasTablas";
import LothImportarGuiasDatos, { resumenDelViaje } from "./LothImportarGuiasDatos";
import LothImportarGuiasDirectorio, { resumenDelDirectorio } from "./LothImportarGuiasDirectorio";
import LothImportarGuiasPestanas, {
  idPanelPestana,
  idPestana,
  type PestanaGuia,
} from "./LothImportarGuiasPestanas";
import LothImportarGuiasTrozas from "./LothImportarGuiasTrozas";
import LothImportarGuiasCupo, { InfoT6 } from "./LothImportarGuiasCupo";
import LothImportarGuiasRenombres from "./LothImportarGuiasRenombres";

const ETIQUETA_ESTADO: Record<
  GuiaVistaPrevia["estado"],
  { texto: string; tono: "ok" | "aviso" | "error" | "neutro" }
> = {
  lista: { texto: "Lista", tono: "ok" },
  elegir_permiso: { texto: "Elige el permiso", tono: "aviso" },
  ya_importada: { texto: "Ya está en el libro", tono: "neutro" },
  bloqueada: { texto: "No se puede importar", tono: "error" },
  no_encontrada: { texto: "No encontrada", tono: "error" },
  sin_respuesta: { texto: "SERFOR no respondió", tono: "error" },
};

/** Sin ficha (SERFOR no la encontró): la guía se nombra por lo que se pidió. */
function tituloDeFuente(g: GuiaVistaPrevia): string {
  const f = g.fuente;
  if (f.tipo === "serfor") return `Registro ${f.numeroRegistro}`;
  if (f.tipo === "ctp") return "Ingreso del aserradero";
  return f.ficha.gtfNumber ? `GTF ${f.ficha.gtfNumber}` : "Guía leída de un documento";
}

export default function LothImportarGuiasGuia({
  g,
  incluida,
  onIncluir,
  conTala,
  alDirectorio,
  onDirectorio,
  abiertaDeEntrada,
  motivoCupo,
  onMotivoCupo,
  renombresOk,
  onRenombres,
}: {
  g: GuiaVistaPrevia;
  incluida: boolean;
  onIncluir: (on: boolean) => void;
  /** El interruptor de la tala del grupo: apagado, la tabla de talas se ve tenue. */
  conTala: boolean;
  /** Lo marcado para el directorio en esta guía. */
  alDirectorio: DecisionesDirectorio | undefined;
  onDirectorio: (ficha: string, cambio: Partial<DecisionFicha>) => void;
  /** Con pocas guías en la vista previa, la tarjeta arranca abierta en «Datos de la guía». */
  abiertaDeEntrada: boolean;
  /** T9 (y T6 de una guía verificada, ADR-468): el motivo escrito para pasar lo autorizado (sin él, la guía no entra). */
  motivoCupo: string;
  onMotivoCupo: (texto: string) => void;
  /** ADR-474: los códigos únicos confirmados como OTRAS trozas (y cómo confirmarlos). */
  renombresOk: readonly string[];
  onRenombres: (codigos: string[] | null) => void;
}) {
  /* Con el interruptor de la tala apagado vale el estado «sin tala» y sus avisos de tala no aplican. */
  const est = ETIQUETA_ESTADO[estadoEfectivo(g, conTala)];
  const importable = esImportable(g, conTala);
  const idBase = useId();
  /* Con pocas guías arranca abierta en la primera sección; con muchas, plegada. */
  const [pestana, setPestana] = useState<string | null>(() =>
    abiertaDeEntrada && importable ? (g.ficha ? "datos" : "trozas") : null,
  );
  const avisos = conTala ? g.avisos : g.avisos.filter((a) => !a.soloConTala);
  const d = g.guia;
  const m3 = d?.volumenTrozasM3 ?? 0;
  const titulo = d?.gtfNumber
    ? `GTF ${d.gtfNumber}`
    : d?.numeroRegistro
      ? `Registro ${d.numeroRegistro}`
      : tituloDeFuente(g);

  /* Tres secciones, como pestañas (Brandon 07-10-2026): los datos del documento,
     lo que viaja (trozas, resúmenes, tala) y quién entra al directorio. Cada
     rótulo dice su cifra: plegada, la barra ya resume la guía. */
  const pestanas: PestanaGuia[] = [];
  if (g.ficha)
    pestanas.push({
      id: "datos",
      label: "Datos de la guía",
      cifra: resumenDelViaje(g.ficha) || undefined,
    });
  if (g.ficha || g.trozas.length > 0 || g.talas.length > 0) {
    pestanas.push({
      id: "trozas",
      label: "Trozas y resumen",
      cifra: `${g.trozas.length} ${g.trozas.length === 1 ? "troza" : "trozas"}`,
    });
  }
  if (g.directorio) {
    pestanas.push({
      id: "directorio",
      label: "Directorio",
      cifra: resumenDelDirectorio(g.directorio, alDirectorio ?? {}, importable && incluida),
    });
  }
  /* Lo pesado se dibuja recién al abrir la pestaña. */
  const abierta = pestanas.some((p) => p.id === pestana) ? pestana : null;

  return (
    <article
      className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] ${importable && !incluida ? "opacity-70" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
          checked={importable && incluida}
          disabled={!importable}
          onChange={(e) => onIncluir(e.target.checked)}
          aria-label={`Importar la ${titulo}`}
        />
        <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
        {d?.gtfNumber && d.numeroRegistro && (
          <span className="font-mono text-xs text-[var(--text-tertiary)]">
            Reg. {d.numeroRegistro}
          </span>
        )}
        {d?.fecha && (
          <span className="text-sm text-[var(--text-secondary)]">{fechaConDia(d.fecha)}</span>
        )}
        <span
          className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${TONO[est.tono]}`}
        >
          {est.texto}
        </span>
        {d && (
          <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
            {d.piezas} {d.piezas === 1 ? "troza" : "trozas"} ·{" "}
            <span className="font-mono">{fmtM3(m3)} m³</span> · ≈{fmtPt(ptAserrableDeRolliza(m3))}{" "}
            pt
          </span>
        )}
      </header>

      {/* El mensaje suele repetir un aviso: sólo va si dice otra cosa. */}
      {g.mensaje && !avisos.some((a) => a.mensaje === g.mensaje) && (
        <p className="px-3 pb-2 text-sm text-[var(--text-secondary)]">{g.mensaje}</p>
      )}
      {avisos.length > 0 && (
        <ul className="space-y-1 px-3 pb-2">
          {avisos.map((a, i) => (
            <Aviso
              key={`${a.codigo}-${i}`}
              a={a}
              t6={a.codigo === "exceso_autorizado" ? (g.sobreAutorizado ?? []) : undefined}
              verificada={d?.verificadaEnSerfor === true}
            />
          ))}
        </ul>
      )}

      {importable && (
        <LothImportarGuiasCupo
          filas={sobreCupoEfectivo(g, conTala)}
          t6={sobreAutorizadoConMotivo(g)}
          motivo={motivoCupo}
          onMotivo={onMotivoCupo}
          activa={incluida}
        />
      )}
      {importable && (
        <LothImportarGuiasRenombres
          trozas={g.trozas}
          confirmados={renombresOk}
          onConfirmar={onRenombres}
          activa={incluida}
        />
      )}

      {pestanas.length > 0 && (
        <LothImportarGuiasPestanas
          pestanas={pestanas}
          activa={abierta}
          onElegir={setPestana}
          idBase={idBase}
          etiqueta={`Secciones de la ${titulo}`}
        />
      )}
      {abierta && (
        <div
          role="tabpanel"
          id={idPanelPestana(idBase, abierta)}
          aria-labelledby={idPestana(idBase, abierta)}
        >
          {abierta === "datos" && g.ficha && <LothImportarGuiasDatos ficha={g.ficha} />}
          {abierta === "trozas" && (
            <LothImportarGuiasTrozas
              ficha={g.ficha ?? null}
              trozas={g.trozas}
              talas={g.talas}
              especies={d?.especies ?? []}
              conTala={conTala}
            />
          )}
          {abierta === "directorio" && g.directorio && (
            <LothImportarGuiasDirectorio
              d={g.directorio}
              decisiones={alDirectorio ?? {}}
              onDecidir={onDirectorio}
              activa={importable && incluida}
            />
          )}
        </div>
      )}
    </article>
  );
}

/** `t6`: el aviso de T6 lleva su ⓘ con las cuentas (para quien lo ve, no hay motivo que lo destrabe). */
function Aviso({
  a,
  t6,
  verificada,
}: {
  a: AvisoImportacion;
  t6?: SobreAutorizadoDeLaGuia[];
  verificada: boolean;
}) {
  const Icono =
    a.nivel === "bloquea" ? AlertOctagon : a.nivel === "atencion" ? AlertTriangle : Info;
  const color =
    a.nivel === "bloquea"
      ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      : a.nivel === "atencion"
        ? "text-[var(--data-warning-ink)]"
        : "text-[var(--text-secondary)]";
  return (
    <li className={`flex items-start gap-2 text-sm ${color}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className={t6 ? "font-semibold" : undefined}>{a.mensaje}</span>
      {t6 && <InfoT6 filas={t6} verificada={verificada} />}
    </li>
  );
}
