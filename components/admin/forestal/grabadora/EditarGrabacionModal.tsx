"use client";

/**
 * Editar una grabación: nombre, nota y recorte de inicio/fin. El recorte se
 * hace en el navegador (decodifica, corta, WAV mono 16 kHz) y sube como
 * versión nueva del mismo documento: la original queda en el historial del
 * Archivo por si hay que volver.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Scissors } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Button } from "@/components/ui-system/Button";
import type { DbDocument } from "@/lib/types/documents";
import { formatoDuracion, limpiarNombre } from "@/lib/grabadora/formato";
import { decodificarAudio, notaDe } from "@/lib/grabadora/archivo";
import { recortarAWav } from "@/lib/grabadora/wav";
import { CAMPO, ReproductorAudio, TEXTO_META } from "./compartido";

type Decodificado = Awaited<ReturnType<typeof decodificarAudio>>;

/** Pasos del recorte: décimas de segundo alcanzan para cortar un «eh…». */
const PASO = 0.1;

export function EditarGrabacionModal({
  doc,
  onCerrar,
  onGuardar,
}: {
  doc: DbDocument;
  onCerrar: () => void;
  onGuardar: (o: { nombre: string; nota: string; recorte?: File }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(doc.name);
  const [nota, setNota] = useState(notaDe(doc));
  const [audio, setAudio] = useState<Decodificado | null>(null);
  const [errorAudio, setErrorAudio] = useState<string | null>(null);
  const [inicio, setInicio] = useState(0);
  const [fin, setFin] = useState(0);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlPrueba = useRef<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    decodificarAudio(doc, ac.signal)
      .then((d) => {
        if (ac.signal.aborted) return;
        setAudio(d);
        setFin(Math.floor(d.segundos * 10) / 10);
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setErrorAudio(err instanceof Error ? err.message : "No se pudo leer el audio.");
      });
    return () => ac.abort();
  }, [doc]);

  useEffect(() => () => {
    if (urlPrueba.current) URL.revokeObjectURL(urlPrueba.current);
  }, []);

  const total = audio?.segundos ?? 0;
  const recorta = audio !== null && (inicio > 0.05 || fin < total - 0.05);
  const valido = !audio || fin - inicio >= 0.5;

  function wavDelRecorte(): Uint8Array<ArrayBuffer> | null {
    if (!audio) return null;
    return recortarAWav(audio.canales, audio.tasa, inicio, fin);
  }

  function escucharRecorte() {
    const wav = wavDelRecorte();
    if (!wav) return;
    if (urlPrueba.current) URL.revokeObjectURL(urlPrueba.current);
    urlPrueba.current = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    setPrueba(urlPrueba.current);
  }

  async function guardar() {
    if (guardando || !valido) return;
    setGuardando(true);
    setError(null);
    try {
      const wav = recorta ? wavDelRecorte() : null;
      const limpio = limpiarNombre(nombre) || doc.name;
      await onGuardar({
        nombre: limpio,
        nota: nota.trim(),
        recorte: wav ? new File([wav], `${limpio}.wav`, { type: "audio/wav" }) : undefined,
      });
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Editar grabación"
      icon={Scissors}
      size="md"
      aboveModals
      footer={
        <ModalFooter error={error} nota={recorta ? `Queda de ${formatoDuracion((fin - inicio) * 1000)}` : undefined}>
          <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando || !valido} data-accion="guardar-edicion">
            {guardando && <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden />}
            {guardando ? (recorta ? "Recortando…" : "Guardando…") : "Guardar"}
          </Button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <label className="block space-y-1">
          <span className={TEXTO_META}>Nombre</span>
          <input className={CAMPO} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className={TEXTO_META}>Nota</span>
          <textarea
            className={`${CAMPO} h-auto min-h-[5rem] py-2`}
            value={nota}
            maxLength={2000}
            placeholder="Qué dice, de qué lote es, a quién va…"
            onChange={(e) => setNota(e.target.value)}
          />
        </label>

        <fieldset className="space-y-3 rounded-xl border border-[var(--rule-base)] p-3">
          <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">Recortar</legend>
          {errorAudio ? (
            <p className="text-sm text-[var(--data-error-ink)]" role="alert">{errorAudio}</p>
          ) : !audio ? (
            <p className={`${TEXTO_META} flex items-center gap-2`} role="status">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Leyendo el audio…
            </p>
          ) : (
            <>
              <Deslizador
                etiqueta="Empieza en"
                valor={inicio}
                max={total}
                onCambio={(v) => setInicio(Math.min(v, Math.max(0, fin - 0.5)))}
              />
              <Deslizador
                etiqueta="Termina en"
                valor={fin}
                max={total}
                onCambio={(v) => setFin(Math.max(v, Math.min(total, inicio + 0.5)))}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="lg" onClick={escucharRecorte} disabled={!valido}>
                  <Play className="h-5 w-5" aria-hidden /> Escuchar el recorte
                </Button>
                <span className={TEXTO_META}>
                  Dura {formatoDuracion(total * 1000)}; queda {formatoDuracion((fin - inicio) * 1000)}
                </span>
              </div>
              {prueba && <ReproductorAudio src={prueba} autoPlay etiqueta="Escuchar el recorte" />}
              {recorta && (
                <p className={TEXTO_META}>
                  Se guarda como versión nueva (WAV); la original queda en el historial del Archivo.
                </p>
              )}
            </>
          )}
        </fieldset>
      </div>
    </AdminModal>
  );
}

function Deslizador({
  etiqueta,
  valor,
  max,
  onCambio,
}: {
  etiqueta: string;
  valor: number;
  max: number;
  onCambio: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between text-sm text-[var(--text-primary)]">
        {etiqueta}
        <span className="font-semibold tabular-nums">{formatoDuracion(valor * 1000)}.{Math.floor((valor * 10) % 10)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={PASO}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        className="h-11 w-full accent-[var(--accent)]"
        aria-valuetext={formatoDuracion(valor * 1000)}
      />
    </label>
  );
}
