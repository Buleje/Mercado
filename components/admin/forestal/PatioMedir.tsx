"use client";

/**
 * «Medir escaneando» (Brandon 2026-09-26) — la cubicación Oxapampa, troza por
 * troza, parado frente a la pila.
 *
 * En Blas, 77 de 84 trozas del patio no traen D1/D2 de la guía y ninguna tiene
 * su cubicación propia: las dos puntas en pulgadas y el largo en pies, con las
 * que se trabaja con los dueños, las compras, las ventas y el flete
 * (pt = Dp² × L / 24,5). Acá: se escanea la troza, se tipean sus medidas, Enter
 * guarda y el cursor vuelve al escáner para la siguiente.
 *
 * Sin señal no se pierde nada: la medida va a la cola del patio (se sube sola)
 * y la tanda queda guardada en la tablet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCcw, Ruler, WifiOff } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { antiguedad } from "@/lib/forestal/patio-cache";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { codigoDeTroza } from "@/lib/forestal/conteo-patio";
import { VENTANA_FICHA_MS, buscarTrozaEscaneada, leerEscaneo } from "@/lib/forestal/leer-escaneo-troza";
import { conMedidaDeTanda, escaneoReciente, restoDelEscaneo, type EscaneoReciente } from "@/lib/forestal/medir-patio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import EscanerTrozas, { nombreDeTroza } from "./EscanerTrozas";
import FormMedida from "./patio-medir-form";
import TandaMedida from "./patio-medir-tanda";
import { useMedirPatio } from "./hooks/use-medir-patio";

/** Se puede volver a escanear la misma troza cuantas veces haga falta (corregirla). */
const SIN_MARCAR: ReadonlySet<string> = new Set();

const BOTON_BORDE =
  "inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] px-4 text-base font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]";

type Aviso = { tono: "ok" | "tablet" | "aviso" | "error"; texto: string };

const TONO: Record<Aviso["tono"], string> = {
  ok: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  tablet: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  aviso: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  error: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
};

const noLlego = (t: TrozaConsumible) =>
  t.noRecepcionada ? "Figura como no llegada al patio: márcala como recibida antes de medirla" : null;

export default function PatioMedir({
  onVolver,
  online,
  pendientes,
}: {
  onVolver: () => void;
  online: boolean;
  /** Anotaciones del patio sin subir (la cola): al bajar, la tanda se pone al día. */
  pendientes: number;
}) {
  const m = useMedirPatio();
  const { recargar } = m;
  const [actualId, setActualId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const escanerRef = useRef<HTMLDivElement>(null);
  /** De qué troza y cuándo fue el escaneo que abrió la tarjeta (`restoDelEscaneo`). */
  const recienteRef = useRef<EscaneoReciente | null>(null);

  const actual = useMemo(() => {
    const t = m.trozas.find((x) => x.id === actualId);
    return t ? conMedidaDeTanda(t, m.tanda) : null;
  }, [m.trozas, m.tanda, actualId]);
  /** Lo que el servidor rechazó de esta troza: la tarjeta abre con eso para reenviarlo. */
  const rechazada = useMemo(
    () => m.tanda.find((x) => x.id === actualId && x.estado === "rechazada") ?? null,
    [m.tanda, actualId],
  );

  /* La cola subió algo (o volvió la señal): se relee el patio para que lo
     anotado en la tablet pase a «Guardada» con el PT del servidor. */
  const pendientesAntes = useRef(pendientes);
  useEffect(() => {
    if (pendientes < pendientesAntes.current && online) void recargar();
    pendientesAntes.current = pendientes;
  }, [pendientes, online, recargar]);

  const volverAlEscaner = useCallback(() => {
    requestAnimationFrame(() => escanerRef.current?.querySelector<HTMLInputElement>("input")?.focus());
  }, []);

  const elegir = useCallback((t: TrozaConsumible) => {
    recienteRef.current = escaneoReciente(t.id, Date.now());
    setActualId(t.id);
    setAviso(null);
  }, []);

  /** El otro código de la etiqueta o una línea de la ficha que cayó en una medida: se calla. */
  const esRestoDelEscaneo = (texto: string, previo: string) => {
    const ahora = Date.now();
    const r = restoDelEscaneo(texto, previo, recienteRef.current, m.trozas, ahora);
    if (r === "ficha" && recienteRef.current) {
      recienteRef.current = { ...recienteRef.current, fichaHasta: ahora + VENTANA_FICHA_MS };
    }
    return r != null;
  };

  /** La pistola tipeó un código en una casilla de medida. */
  const escaneoEnCampo = (texto: string, conDatos: boolean) => {
    const r = buscarTrozaEscaneada(m.trozas, leerEscaneo(texto));
    if (r.estado === "una" && r.troza.id === actualId) return;
    if (r.estado === "una" && !conDatos && !noLlego(r.troza)) return elegir(r.troza);
    const codigo = actual ? codigoDeTroza({ id: actual.id, codigoPlanta: actual.codigoPlanta ?? null, codificacion: actual.codificacion }) : "";
    setAviso({
      tono: "aviso",
      texto: conDatos
        ? `Escaneaste otra troza con la ${codigo} a medias: guárdala o toca «Otra troza».`
        : "El cursor estaba en una medida: vuelve a escanear con el cursor en el escáner.",
    });
    if (!conDatos) volverAlEscaner();
  };

  const guardar = async (cambio: Parameters<typeof m.guardar>[1], ptTablet: number | null) => {
    if (!actual) return;
    const nombre = nombreDeTroza(actual);
    const r = await m.guardar(actual, cambio, ptTablet);
    if (r.estado === "error") return setAviso({ tono: "error", texto: r.mensaje });
    const pt = r.pt != null ? `${fmtPt(r.pt)} PT` : "sin PT";
    setAviso(
      r.estado === "en-equipo"
        ? {
            tono: "tablet",
            texto: `Anotada en la tablet: ${nombre} · ${pt}. ${r.aviso ?? "Se sube sola al volver la señal."}`,
          }
        : r.estado === "borrada"
          ? { tono: "ok", texto: `Medida borrada: ${nombre}.` }
          : r.estado === "rechazada"
            ? { tono: "error", texto: `No se guardó ${nombre}: ${r.aviso} Queda en la tanda para reenviarla.` }
            : r.estado === "con-aviso"
              ? { tono: "aviso", texto: `${nombre} · ${pt} guardada, pero: ${r.aviso}` }
              : { tono: "ok", texto: `Guardada: ${nombre} · ${pt}.` },
    );
    setActualId(null);
    volverAlEscaner();
  };

  return (
    <main className="mx-auto min-h-dvh max-w-[48rem] space-y-4 p-4" data-medir-patio>
      <button type="button" onClick={onVolver} className={BOTON_BORDE}>
        <ArrowLeft className="h-5 w-5" aria-hidden /> Volver al patio
      </button>

      <header className="flex items-center gap-2">
        <PageTitle className="flex items-center gap-2 text-[length:var(--ts-xl)] sm:text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">
          <Ruler className="h-6 w-6 text-[var(--accent)]" aria-hidden /> Medir escaneando
        </PageTitle>
        <InfoTip
          title="Medir escaneando"
          what="Escanea la troza y anota sus dos puntas en pulgadas y el largo en pies: sale el PT Oxapampa, el que se usa con los dueños, las compras, las ventas y el flete."
          affects="PT = ((D1 + D2) ÷ 2)² × L ÷ 24,5. No cambia los m³ de la guía. Si la guía no trae D1/D2 en cm, puedes anotarlos (nunca se pisan los de SERFOR)."
          example="Puntas de 18″ y 22″, 12 pies → 20 × 20 × 12 ÷ 24,5 = 196 PT. Enter guarda y el cursor vuelve al escáner."
          side="left"
        />
      </header>

      {!online && (
        <p role="status" className={cn("flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-base font-bold", TONO.tablet)}>
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          Sin señal: lo que midas queda en esta tablet y se sube solo al volver la señal.
        </p>
      )}
      {m.deCache && (
        <p className="text-base text-[var(--text-secondary)]">
          Trozas del patio guardadas {antiguedad(m.deCache, new Date())}.
        </p>
      )}

      {m.estado === "cargando" && (
        <p className="flex items-center gap-2 py-4 text-base text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Leyendo el patio…
        </p>
      )}
      {m.estado === "error" && (
        <div className={cn("space-y-3 rounded-2xl border-2 px-4 py-3", TONO.error)}>
          <p className="flex items-start gap-2 text-base font-bold">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {m.error}
          </p>
          <button type="button" onClick={() => void recargar()} className={BOTON_BORDE}>
            <RotateCcw className="h-5 w-5" aria-hidden /> Reintentar
          </button>
        </div>
      )}

      <div ref={escanerRef}>
        <EscanerTrozas
          trozas={m.trozas}
          onTroza={elegir}
          yaElegidas={SIN_MARCAR}
          bloqueo={noLlego}
          mostrarCuenta={false}
          avisoAlTomar={(t) => ({
            tono: "ok",
            mensaje:
              t.oxPt != null
                ? `Troza ${nombreDeTroza(t)}: ya medida (${fmtPt(t.oxPt)} PT). Puedes corregirla.`
                : `Troza ${nombreDeTroza(t)}: anota sus medidas.`,
          })}
          onDesconocido={(codigo) =>
            m.estado === "cargando"
              ? `Todavía se está leyendo el patio: vuelve a escanear ${codigo} en un momento.`
              : `Ninguna troza del patio con el código ${codigo}.`
          }
        />
      </div>

      {aviso && (
        <p
          role={aviso.tono === "error" ? "alert" : "status"}
          className={cn("flex items-start gap-2 rounded-2xl border-2 px-4 py-3 text-base font-bold", TONO[aviso.tono])}
          data-aviso-medida={aviso.tono}
        >
          {aviso.tono === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          ) : aviso.tono === "tablet" ? (
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          )}
          <span className="min-w-0">{aviso.texto}</span>
        </p>
      )}

      {actual && (
        <FormMedida
          key={actual.id}
          troza={actual}
          guardando={m.guardando}
          propuesta={rechazada?.cambio ?? null}
          motivo={rechazada?.aviso ?? null}
          esRestoDelEscaneo={esRestoDelEscaneo}
          onGuardar={(c, pt) => void guardar(c, pt)}
          onOtra={() => {
            setActualId(null);
            setAviso(null);
            volverAlEscaner();
          }}
          onEscaneoEnCampo={escaneoEnCampo}
        />
      )}

      <TandaMedida
        tanda={m.tanda}
        onElegir={(id) => {
          const t = m.trozas.find((x) => x.id === id);
          if (t) elegir(t);
          else setAviso({ tono: "aviso", texto: "Esa troza ya no está en el patio que se leyó." });
        }}
        onVaciar={m.vaciarTanda}
      />
    </main>
  );
}
