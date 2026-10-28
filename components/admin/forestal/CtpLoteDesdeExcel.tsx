"use client";

/**
 * «Pegar de Excel» en «Programar un lote de aserrío» (Brandon 27-10): la lista
 * de trozas del SNIFFS se pega acá y cada lote de la columna «Lote» entra al
 * libro YA CONSUMIDO, con sus trozas del patio. Antes de importar se ve qué
 * troza del libro es cada fila y si entra; la fecha del consumo sale de la
 * «Fecha del Estado» y se puede corregir. El estado vive en
 * `use-lote-desde-excel` (el botón Importar está en el pie del modal).
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diaLegible, fechaFueraDeRango } from "@/lib/forestal/lote-desde-excel-cruce";
import { Btn, I } from "./ctp-shared";
import CtpLoteDesdeExcelTabla from "./CtpLoteDesdeExcelTabla";
import type { LoteDelExcel, LoteDesdeExcel } from "./hooks/use-lote-desde-excel";

const ERROR = "text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";

function ZonaPegar({ error, onPegar }: { error: string | null; onPegar: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label htmlFor="lote-excel-pegar" className="text-sm text-[var(--text-secondary)]">
          Copia del Excel del SNIFFS las filas del lote{" "}
          <b className="text-[var(--text-primary)]">con su fila de títulos</b> y pégalas aquí
          (Ctrl+V)
        </label>
        <InfoTip
          what="Las trozas que el SNIFFS ya pasó a consumo en un lote: entran al libro con ese lote y quedan consumidas, listas para declarar su producción."
          affects="Cada fila se busca en el patio por su guía y su Código Planta. Se consume el volumen del libro (el de la guía); el D1/D2 del Excel sólo completa los vacíos."
          example="Contrato · Número Resolución · Documento de Ingreso · Troza Padre · Código Planta · Especie · Lote · D1(cm) · D2(cm) · Largo(m) · Volumen · Tipo de Producto · Estado Actual · Fecha del Estado"
        />
      </div>
      <textarea
        id="lote-excel-pegar"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={(e) => {
          const pegado = e.clipboardData.getData("text/plain");
          if (!pegado.trim()) return;
          e.preventDefault();
          setTexto("");
          onPegar(pegado);
        }}
        rows={6}
        placeholder={
          "Contrato\tNumero Resolución\tDocumento de Ingreso\t\tTroza Padre\t\tCodigo Planta\tEspecie\tLote\t…\n19-SEC/REG-…\t…\tGTF\t019-001-0000012\t\t28\t13703182\tCedrelinga cateniformis\t28-2026\t…"
        }
        className={`${I} h-auto py-2 font-mono`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" disabled={texto.trim() === ""} onClick={() => onPegar(texto)}>
          <ClipboardPaste className="h-4 w-4" aria-hidden /> Leer lo pegado
        </Btn>
        {error && (
          <span className={ERROR} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function TarjetaLote({ l, estado }: { l: LoteDelExcel; estado: LoteDesdeExcel }) {
  const { hoy, poner, cruzarDeNuevo, importando } = estado;
  const c = l.cruce;
  const fuera = c ? fechaFueraDeRango(l.fecha, c.fechaMinima, hoy) : null;
  const titulo = l.code.trim() || "Lote sin N° (correlativo automático)";
  if (l.hecho) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-[var(--data-success-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {l.hecho}
      </p>
    );
  }
  return (
    <section
      className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3"
      aria-label={titulo}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={ROTULO} htmlFor={`lote-excel-code-${l.clave}`}>
            N° de lote
          </label>
          <input
            id={`lote-excel-code-${l.clave}`}
            value={l.code}
            onChange={(e) => poner(l.clave, { code: e.target.value })}
            onBlur={() => cruzarDeNuevo(l.clave)}
            onKeyDown={(e) => {
              if (e.key === "Enter") cruzarDeNuevo(l.clave);
            }}
            placeholder="LA-2026-00N"
            maxLength={60}
            disabled={importando}
            className={`${I} font-mono`}
          />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`lote-excel-fecha-${l.clave}`}>
            Fecha del consumo
          </label>
          <input
            id={`lote-excel-fecha-${l.clave}`}
            type="date"
            value={l.fecha}
            min={c?.fechaMinima ?? undefined}
            max={hoy}
            onChange={(e) => poner(l.clave, { fecha: e.target.value })}
            disabled={importando}
            className={I}
          />
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {l.cargando ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las trozas en el
            libro…
          </span>
        ) : c ? (
          <>
            <b className="text-[var(--text-primary)]">{c.especie?.comun ?? "—"}</b>
            {c.permiso ? ` · permiso ${c.permiso}` : ""} ·{" "}
            <span className="font-mono tabular-nums">
              {c.piezas} de {l.filas.length} trozas · {fmtM3(c.volumenM3)} m³
            </span>
            {c.conMedidas > 0 ? ` · completa D1/D2 de ${c.conMedidas}` : ""}
          </>
        ) : null}
      </p>

      {c?.existente && c.existente.status === "abierto" && c.bloqueos.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          El lote <b className="font-mono text-[var(--text-primary)]">{c.existente.code}</b> ya
          estaba programado: las trozas se le suman y se consume.
        </p>
      )}
      {l.error && (
        <p className={ERROR} role="alert">
          {l.error}
        </p>
      )}
      {c?.avisos.map((a) => (
        <p
          key={a}
          className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}
        </p>
      ))}
      {c?.bloqueos.map((b) => (
        <p key={b} className={`${ERROR} flex items-start gap-1.5`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {b}
        </p>
      ))}
      {c && fuera && c.bloqueos.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className={ERROR}>{fuera}</p>
          {c.fechaMinima && l.fecha < c.fechaMinima && c.fechaMinima <= hoy && (
            <Btn size="sm" onClick={() => poner(l.clave, { fecha: c.fechaMinima! })}>
              Usar el {diaLegible(c.fechaMinima)}
            </Btn>
          )}
        </div>
      )}
      <CtpLoteDesdeExcelTabla filas={l.filas} cruzadas={c?.filas ?? null} />
    </section>
  );
}

export default function CtpLoteDesdeExcel({ estado }: { estado: LoteDesdeExcel }) {
  const { lotes, errorPegado, conTitulos, pegar, limpiar, importando } = estado;
  if (lotes.length === 0) return <ZonaPegar error={errorPegado} onPegar={pegar} />;
  const trozas = lotes.reduce((a, l) => a + l.filas.length, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        <FileSpreadsheet
          className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          aria-hidden
        />
        <span>
          <b className="text-[var(--text-primary)]">
            {trozas} troza{trozas === 1 ? "" : "s"} · {lotes.length} lote
            {lotes.length === 1 ? "" : "s"}
          </b>
          {conTitulos ? "" : " · sin fila de títulos: leídas en el orden de la lista del SNIFFS"}
        </span>
        <Btn size="sm" onClick={limpiar} disabled={importando} className="ml-auto">
          <RotateCcw className="h-4 w-4" aria-hidden /> Pegar otro
        </Btn>
      </div>
      {lotes.map((l) => (
        <TarjetaLote key={l.clave} l={l} estado={estado} />
      ))}
    </div>
  );
}
