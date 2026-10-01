"use client";

/**
 * «Contar al bajar» (ADR-450 L1): mientras el camión descarga, cada troza de
 * la guía se escanea (pistola o cámara) o se marca a mano. La que no bajó se
 * marca «No llegó»; la que bajó con otra medida, «Llegó distinta», con sus
 * D1/D2/L de planta — la guía no se toca, lo medido va aparte.
 *
 * El estado vive en `useConteoGuiaTh`; acá sólo se pinta. A 400 px la fila se
 * parte en dos renglones y los botones miden 44 px.
 */

import { useMemo } from "react";
import { AlertTriangle, Ban, CheckCheck, Ruler, Undo2 } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { TOLERANCIA_DIAMETRO_CM, TOLERANCIA_LARGO_M } from "@/lib/forestal/conteo-guia-th";
import EscanerTrozas, { type TrozaDelEscaner } from "./EscanerTrozas";
import type { ConteoGuiaTh, FilaConteo, MedidaEscrita } from "./hooks/use-conteo-guia-th";

const cm = (v: number | null) => (v == null ? "—" : formatNumber(v, { max: 1 }));
const m = (v: number | null) => (v == null ? "—" : formatNumber(v, { max: 2 }));
/** «−0.122» con el signo tipográfico: la diferencia se lee de un vistazo. */
const conSigno = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtM3(Math.abs(v))}`;

const BOTON =
  "inline-flex h-11 items-center justify-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50 sm:h-9 @3xl:gap-1.5 @3xl:px-3";

const CHIP: Record<FilaConteo["estado"], string> = {
  sin_contar: "border border-dashed border-[var(--rule-strong)] text-[var(--text-secondary)]",
  llego: "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  distinta: "bg-[var(--accent-muted)] text-[var(--accent-ink)] dark:text-[var(--accent)]",
  no_llego: "bg-[var(--data-warning-500)]/18 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
};

/** El texto del chip: largo con la fila en una línea, corto en la angosta (la casilla ya dice «llegó»). */
function textoDelChip(f: FilaConteo): { largo: string; corto: string } {
  if (f.estado === "sin_contar") return { largo: "Sin contar", corto: "Sin contar" };
  if (f.estado === "no_llego") return { largo: "No llegó", corto: "No llegó" };
  if (f.estado === "distinta") return { largo: "Llegó distinta", corto: "Distinta" };
  return f.como === "escaneada" ? { largo: "Llegó · escaneada", corto: "Escaneada" } : { largo: "Llegó · a mano", corto: "A mano" };
}

/** Un casillero de «Llegó distinta»: cm o m, tipeado con coma o punto. */
function CampoMedida({ id, rotulo, unidad, valor, onChange }: { id: string; rotulo: string; unidad: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {rotulo} <span className="normal-case">({unidad})</span>
      </span>
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        className="h-11 w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-right font-mono text-base tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
      />
    </label>
  );
}

function FilaTroza({ f, conteo }: { f: FilaConteo; conteo: ConteoGuiaTh }) {
  const t = f.troza;
  const o = t.orden;
  const llego = f.estado === "llego" || f.estado === "distinta";
  const chip = textoDelChip(f);
  const idBase = `conteo-th-${o}`;
  const escribir = (campo: keyof MedidaEscrita) => (v: string) => conteo.escribirMedida(o, campo, v);
  const abrirDistinta = () => {
    conteo.abrirDistinta(o);
    /* El primer casillero, con el foco: se mide y se tipea sin buscarlo. */
    setTimeout(() => document.getElementById(`${idBase}-d1`)?.focus(), 0);
  };
  return (
    <li
      className={cn(
        "rounded-xl border px-2 py-1.5 sm:px-3",
        f.estado === "sin_contar" ? "border-[var(--rule-base)]" : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
      )}
      data-conteo-fila={f.codigo}
      data-estado={f.estado}
    >
      {/* El ancho lo decide la lista (container query), no la pantalla: el
          modal puede estar a media ventana en un monitor grande. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 @3xl:flex-nowrap @3xl:gap-x-3">
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center sm:h-9 sm:w-9">
          <input
            type="checkbox"
            checked={llego}
            onChange={(e) => (e.target.checked ? conteo.marcarLlego(o, "a_mano") : conteo.desmarcar(o))}
            aria-label={`Llegó la troza ${f.codigo}`}
            className="h-5 w-5 accent-[var(--accent)]"
          />
        </label>
        <span className="shrink-0 font-mono text-lg font-bold text-[var(--text-primary)] @3xl:w-32">{f.codigo}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)] @3xl:w-28 @3xl:flex-none" title={f.especie}>{f.especie}</span>
        <span className={cn("ml-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold @3xl:order-1 @3xl:ml-0 @3xl:w-32 @3xl:text-center", CHIP[f.estado])}>
          <span className="@3xl:hidden">{chip.corto}</span>
          <span className="hidden @3xl:inline">{chip.largo}</span>
        </span>
        {/* Angosto (400 px, o el modal a media ventana), la fila se parte acá:
            medidas y botones en el 2º renglón. */}
        <span className="basis-full @3xl:hidden" aria-hidden />
        <span className="min-w-0 flex-1 pl-1 font-mono text-sm tabular-nums text-[var(--text-secondary)] @3xl:pl-0">
          <span className="whitespace-nowrap">{cm(t.d1Cm)}·{cm(t.d2Cm)} cm</span> · <span className="whitespace-nowrap">{m(t.largoM)} m</span>
          <span className="hidden @3xl:inline"> · </span>
          {/* Angosta: el m³ abajo de las medidas, no partido en tres líneas. */}
          <b className="block whitespace-nowrap text-[var(--text-primary)] @3xl:inline">{t.volumenM3 == null ? "—" : fmtM3(t.volumenM3)} m³</b>
        </span>
        <span className="flex shrink-0 gap-1.5 @3xl:order-2">
          {f.estado === "no_llego" ? (
            <button type="button" className={BOTON} onClick={() => conteo.marcarLlego(o, "a_mano")}>
              <Undo2 className="hidden h-4 w-4 @md:block" aria-hidden /> Sí llegó
            </button>
          ) : (
            <button type="button" className={BOTON} onClick={() => conteo.marcarNoLlego(o)} aria-label={`La troza ${f.codigo} no llegó`}>
              <Ban className="hidden h-4 w-4 @md:block" aria-hidden /> No llegó
            </button>
          )}
          {f.estado === "distinta" ? (
            <button type="button" className={BOTON} onClick={() => conteo.cerrarDistinta(o)} aria-label={`La troza ${f.codigo} llegó igual a la guía`}>
              <span className="@md:hidden">Igual</span>
              <span className="hidden @md:inline">Igual a la guía</span>
            </button>
          ) : (
            f.estado !== "no_llego" && (
              <button type="button" className={BOTON} onClick={abrirDistinta} aria-label={`La troza ${f.codigo} llegó con otra medida`}>
                <Ruler className="hidden h-4 w-4 @md:block" aria-hidden /> Distinta
              </button>
            )
          )}
        </span>
      </div>

      {f.estado === "distinta" && f.medida && (
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--rule-soft)] pt-2 @xl:grid-cols-[repeat(3,7rem)_1fr] @xl:items-end">
          <CampoMedida id={`${idBase}-d1`} rotulo="D1" unidad="cm" valor={f.medida.d1} onChange={escribir("d1")} />
          <CampoMedida id={`${idBase}-d2`} rotulo="D2" unidad="cm" valor={f.medida.d2} onChange={escribir("d2")} />
          <CampoMedida id={`${idBase}-largo`} rotulo="Largo" unidad="m" valor={f.medida.largo} onChange={escribir("largo")} />
          <p className="col-span-3 text-sm @xl:col-span-1 @xl:pb-2.5" aria-live="polite">
            {f.errorMedida ? (
              <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{f.errorMedida}</span>
            ) : f.final?.volumenM3 != null && f.diferenciaM3 != null ? (
              <>
                <span className="text-[var(--text-secondary)]">En planta </span>
                <b className="font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(f.final.volumenM3)} m³</b>
                <span className={cn("ml-2 font-mono font-bold tabular-nums", f.diferenciaM3 < 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--accent-ink)] dark:text-[var(--accent)]")}>
                  {conSigno(f.diferenciaM3)} m³
                </span>
                {f.diferenciaM3 > 0 && <span className="block text-[var(--data-warning-ink)]">Mide más que la guía: ¿es otra troza?</span>}
              </>
            ) : (
              <span className="text-[var(--text-tertiary)]">
                Igual a la guía (la cinta no distingue {formatNumber(TOLERANCIA_DIAMETRO_CM)} cm de diámetro ni {formatNumber(TOLERANCIA_LARGO_M * 100)} cm de largo).
              </span>
            )}
          </p>
        </div>
      )}
    </li>
  );
}

/** Un id de troza del libro (cuid): una etiqueta del CTP, no un código de esta guía. */
const ES_ID_DEL_LIBRO = /^c[a-z0-9]{20,30}$/;

export default function ContarAlBajar({ conteo }: { conteo: ConteoGuiaTh }) {
  const { filas, resumen } = conteo;
  const trozas = useMemo<TrozaDelEscaner[]>(
    () => filas.map((f) => ({ id: String(f.troza.orden), codificacion: f.troza.codificacion, codigoPlanta: null, especieComun: f.especie, volumenM3: f.troza.volumenM3 })),
    [filas],
  );
  const llegadas = useMemo(
    () => new Set(filas.filter((f) => f.estado === "llego" || f.estado === "distinta").map((f) => String(f.troza.orden))),
    [filas],
  );
  if (!resumen) return null;
  const hayQueFaltan = resumen.sinContar > 0;

  return (
    <section aria-labelledby="conteo-th-titulo" className="flex flex-col gap-3 rounded-2xl border border-[var(--rule-base)] p-3 sm:p-4" data-testid="contar-al-bajar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <BlockTitle id="conteo-th-titulo" as="h3" className="text-base">Contar al bajar</BlockTitle>
          <InfoTip
            title="Contar al bajar"
            ariaLabel="Cómo se cuentan las trozas"
            what="Escanea cada troza que baja del camión o márcala a mano. La que no bajó, «No llegó»; la que bajó con otra medida, «Distinta»."
            affects="La que no llegó entra al libro marcada «no llegó» y no se puede aserrar. El ingreso sigue con los m³ de la guía: la diferencia queda como faltante."
            example="La guía trae 8 y bajan 7: escaneas las 7, tocas «El resto no llegó» y recibes 7 de 8."
          />
        </span>
        <p className="text-sm font-bold tabular-nums text-[var(--text-secondary)]" aria-live="polite" data-testid="conteo-th-cuenta">
          <span className="text-[var(--text-primary)]">{resumen.contadas} de {resumen.total}</span> contadas
          {hayQueFaltan && <> · {resumen.sinContar} sin contar</>}
        </p>
        <span className="ml-auto flex flex-wrap gap-2">
          {resumen.llegaron < resumen.total && (
            <button type="button" className={BOTON} onClick={conteo.llegaronTodas}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Llegaron todas
            </button>
          )}
          {hayQueFaltan && resumen.llegaron > 0 && (
            <button type="button" className={BOTON} onClick={conteo.elRestoNoLlego}>
              <Ban className="h-4 w-4" aria-hidden /> El resto no llegó
            </button>
          )}
        </span>
      </div>

      <EscanerTrozas
        trozas={trozas}
        yaElegidas={llegadas}
        accion="contada"
        total={resumen.total}
        mostrarCuenta={false}
        onTroza={(t) => conteo.marcarLlego(Number(t.id), "escaneada")}
        onDesconocido={(codigo) => {
          if (ES_ID_DEL_LIBRO.test(codigo)) return "Esa etiqueta es de una troza que ya está en tu libro: no viene en esta guía.";
          conteo.anotarSobrante(codigo);
          return `La ${codigo} no viene en esta guía.`;
        }}
      />

      {conteo.sobrantes.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10" data-testid="conteo-th-sobrantes">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {conteo.sobrantes.length === 1 ? "Escaneaste una troza que no viene en esta guía" : `Escaneaste ${conteo.sobrantes.length} trozas que no vienen en esta guía`}:{" "}
            <b className="font-mono">{conteo.sobrantes.join(", ")}</b>. No entra{conteo.sobrantes.length === 1 ? "" : "n"} al libro; queda anotado al recibir.
          </span>
        </p>
      )}

      <ul className="@container flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto" aria-label="Trozas de la guía">
        {filas.map((f) => (
          <FilaTroza key={f.troza.orden} f={f} conteo={conteo} />
        ))}
      </ul>
    </section>
  );
}
