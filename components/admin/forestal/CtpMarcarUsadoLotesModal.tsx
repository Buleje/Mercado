"use client";

/**
 * «Ya salió sin guía (uso interno / merma)» para varios lotes — y su reverso,
 * «Volver a disponibles» (Brandon, 2026-10-02).
 *
 * Lo primero es la pregunta: «¿salió con guía de transporte?». Si salió con
 * guía, lo correcto es registrar la guía —así la salida queda en el libro con
 * su número— y marcarla como uso interno la dejaría sin papel. Recién con un
 * «no» se cuenta qué se marcaría (`dryRun`: el servidor decide qué corridas, el
 * cliente no suma nada), se pide el motivo y se confirma.
 *
 * Nunca dice «Despachado» ni lleva camión en lo que marca: no hubo guía.
 */

import { useEffect, useState } from "react";
import { Loader2, PackageX, Truck, Undo2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { motivoLegible } from "@/lib/forestal/motivo";
import { productLabel } from "./ctp-shared";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CampoMotivo, MarcoModalLotes } from "./ctp-lotes-modal-marco";
import { marcarUsadoLotes, type MotivoSaltado, type RespuestaMarcarUsado } from "./ctp-lotes-seleccion-api";

const m3 = (v: number) => formatNumber(v, 2);

function textoSaltado(motivo: MotivoSaltado, usado: boolean): string {
  switch (motivo) {
    case "sin_produccion":
      return "todavía no pasó por la sierra";
    case "sin_saldo":
      return "no le queda madera en patio";
    case "ya_marcado":
      return usado ? "ya estaba marcado como salido sin guía" : "no tenía nada marcado";
    case "apartado":
      return "tiene madera apartada para un cliente";
    case "no_existe":
      return "ya no existe (recarga la pantalla)";
  }
}

export default function CtpMarcarUsadoLotesModal({
  lotes,
  usado,
  onClose,
  onDespachar,
  onListo,
}: {
  lotes: { id: string; code: string }[];
  /** `true` = «salió sin guía»; `false` = «volver a disponibles». */
  usado: boolean;
  onClose: () => void;
  /** «Sí, salió con guía»: registrar la guía con estos mismos lotes. */
  onDespachar: () => void;
  onListo: (texto: string) => void;
}) {
  /* Para volver a disponibles no hay pregunta: la guía no cambia nada ahí. */
  const [paso, setPaso] = useState<"pregunta" | "conGuia" | "revisar">(usado ? "pregunta" : "revisar");
  const [preview, setPreview] = useState<RespuestaMarcarUsado | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = lotes.map((l) => l.id).join(",");

  useEffect(() => {
    if (paso !== "revisar") return;
    let vivo = true;
    setCargando(true);
    setError(null);
    marcarUsadoLotes({ loteIds: ids.split(","), usado, dryRun: true })
      .then((r) => vivo && setPreview(r))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [paso, ids, usado]);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await marcarUsadoLotes({ loteIds: ids.split(","), usado, motivo, dryRun: false });
      const n = r.marcadas.length;
      onListo(
        usado
          ? `Quedó como salida sin guía (uso interno / merma): ${n} corrida${n === 1 ? "" : "s"}, ${m3(r.totalM3)} m³ · ${formatNumber(r.totalPt, 0)} pt.`
          : `Volvieron a Productos disponibles ${n} corrida${n === 1 ? "" : "s"}: ${m3(r.totalM3)} m³ · ${formatNumber(r.totalPt, 0)} pt.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  };

  const titulo = usado ? "Ya salió sin guía" : "Volver a disponibles";
  const nLotes = `${lotes.length} lote${lotes.length === 1 ? "" : "s"}`;
  const hayQueMarcar = (preview?.marcadas.length ?? 0) > 0;
  const listo = paso === "revisar" && hayQueMarcar && motivoLegible(motivo) && !enviando;

  const pie =
    paso === "pregunta" ? (
      <button type="button" className={BOTON_SECUNDARIO} onClick={onClose}>
        Cancelar
      </button>
    ) : paso === "conGuia" ? (
      <>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPaso("pregunta")}>
          Volver
        </button>
        <button type="button" className={BOTON_PRIMARIO} onClick={onDespachar}>
          <Truck className="h-5 w-5" aria-hidden /> Registrar la guía
        </button>
      </>
    ) : (
      <>
        <button type="button" className={BOTON_SECUNDARIO} onClick={usado ? () => setPaso("pregunta") : onClose} disabled={enviando}>
          {usado ? "Volver" : "Cancelar"}
        </button>
        <button type="button" className={BOTON_PRIMARIO} onClick={() => void confirmar()} disabled={!listo}>
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : usado ? <PackageX className="h-5 w-5" aria-hidden /> : <Undo2 className="h-5 w-5" aria-hidden />}
          {usado ? "Marcar como salida sin guía" : "Volver a disponibles"}
        </button>
      </>
    );

  return (
    <MarcoModalLotes
      titulo={titulo}
      icono={usado ? <PackageX className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden /> : <Undo2 className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />}
      ayuda={
        <InfoTip
          title={titulo}
          what={
            usado
              ? "Para la madera que ya no está en el patio y no salió con guía: la usaste acá, se regaló o se perdió como merma."
              : "Quita la marca de «salió sin guía»: la madera vuelve a Productos disponibles y se puede poner en una guía."
          }
          affects="Deja de sumar (o vuelve a sumar) en Productos disponibles. No toca el libro de producción."
          example="Lote 13-2026: 1.10 m³ de tablas usadas en el techo del galpón → motivo «techo del galpón»."
        />
      }
      onClose={onClose}
      ocupado={enviando}
      pie={pie}
    >
      <p className="text-sm text-[var(--text-secondary)]">
        {nLotes}: <b className="font-mono text-[var(--text-primary)]">{lotes.map((l) => l.code).join(", ")}</b>
      </p>

      {paso === "pregunta" && (
        <div className="space-y-3">
          <p className="text-lg font-bold">¿Salió con guía de transporte?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPaso("conGuia")}>
              Sí, con guía
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setPaso("revisar")}>
              No, sin guía
            </button>
          </div>
        </div>
      )}

      {paso === "conGuia" && (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-base">
          Entonces registra la guía: así la salida queda en el libro con su número y el saldo baja solo. Marcarla
          como uso interno la dejaría sin guía en el libro.
        </p>
      )}

      {paso === "revisar" && (
        <ResumenMarcado preview={preview} cargando={cargando} usado={usado} />
      )}

      {paso === "revisar" && preview && hayQueMarcar && (
        <CampoMotivo
          value={motivo}
          onChange={setMotivo}
          disabled={enviando}
          placeholder={usado ? "Ej.: techo del galpón, merma por rajadura, venta local" : "Ej.: se marcó por error"}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-semibold text-[var(--data-error-ink)]">
          {error}
        </p>
      )}
    </MarcoModalLotes>
  );
}

/** Lo que el servidor marcaría (dryRun): corrida por corrida, lo que se salta y lo compartido. */
function ResumenMarcado({
  preview,
  cargando,
  usado,
}: {
  preview: RespuestaMarcarUsado | null;
  cargando: boolean;
  usado: boolean;
}) {
  if (cargando || !preview) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Contando la madera de esos lotes…
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {preview.marcadas.length === 0 ? (
        <p className="text-base font-bold">{usado ? "No hay madera para marcar en esos lotes." : "No hay nada marcado en esos lotes."}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rule-base)]">
          <ul className="divide-y divide-[var(--rule-soft)]">
            {preview.marcadas.map((c) => (
              <li key={c.corridaId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <b className="font-mono">{c.loteCode}</b>
                  <span className="text-[var(--text-secondary)]"> · corrida N° {c.lineNo ?? "—"}</span>
                  {c.producto && <span className="text-[var(--text-secondary)]"> · {productLabel(c.producto)}</span>}
                </span>
                <span className="whitespace-nowrap font-mono tabular-nums">
                  <b>{m3(c.m3)}</b> m³ · {formatNumber(c.pt, 0)} pt
                </span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between gap-3 bg-[var(--surface-sunken)] px-3 py-2 text-base font-bold">
            <span>{usado ? "Sale sin guía" : "Vuelve a disponibles"}</span>
            <span className="font-mono tabular-nums">
              {m3(preview.totalM3)} m³ · {formatNumber(preview.totalPt, 0)} pt
            </span>
          </p>
        </div>
      )}

      {preview.saltados.length > 0 && (
        <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
          <p className="font-bold">No se tocan:</p>
          <ul className="mt-1 space-y-0.5 text-[var(--text-secondary)]">
            {preview.saltados.map((s) => (
              <li key={s.loteId}>
                <b className="font-mono text-[var(--text-primary)]">{s.code}</b> — {textoSaltado(s.motivo, usado)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.compartidas.length > 0 && (
        <div className="rounded-xl border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--text-primary)]">
          {preview.compartidas.map((c) => (
            <p key={c.corridaId}>
              La corrida N° {c.lineNo ?? "—"} también tiene madera de{" "}
              <b className="font-mono">{c.otrosLotes.join(", ")}</b>: se marca entera.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
