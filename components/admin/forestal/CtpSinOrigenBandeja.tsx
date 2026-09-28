"use client";

/**
 * Las producciones ya declaradas que no dicen de qué trozas salieron (27-09).
 *
 * Reemplaza a los chips sueltos de «sin materia prima»: esos contaban con el
 * volumen de entrada (39 en Blas) y escondían las que tenían volumen escrito
 * sin ninguna troza (las 5 del 01/08). Acá cuenta el servidor (44), y cada
 * producción cae en UNA fila según por qué no se puede vincular todavía: una
 * fila, un botón, el arreglo en su pantalla. Lo largo va en el ⓘ.
 *
 * Vincular nunca es automático: «Revisar y vincular» muestra la propuesta de
 * cada una y la persona firma.
 */
import { useState } from "react";
import { Loader2, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AdminModal from "@/components/admin/shared/AdminModal";
import { formatNumber } from "@/lib/format";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DiagnosticoCorrida, DiagnosticoSinOrigen, MotivoSinOrigen } from "@/lib/forestal/vincular-trozas";
import { filasDeBandeja, type FilaDeBandeja } from "@/hooks/use-vincular-trozas";
import { useMiRol } from "@/hooks/use-mi-rol";
import { Btn, ModalBody, type CtpIngresosFiltroRapido } from "./ctp-shared";
import CtpRevisarVinculosModal from "./CtpRevisarVinculosModal";
import { puedeFirmarVinculo } from "./CtpVincularMixtoModal";
import DeclararAperturaModal from "./saldos/DeclararAperturaModal";

const LINK =
  "inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]";

const de = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Qué dice cada fila, en frases cortas. El porqué largo va en el ⓘ. */
function copiaDe(f: FilaDeBandeja): { texto: string; ayuda: string; boton: string | null } {
  const n = f.corridas.length;
  /* Una corrida con `mesCerrado` no cuenta como «lista»: el servidor la
     rechaza igual (PERIODO_CERRADO) aunque tenga trozas propuestas. Sin esto
     el aviso prometía un vínculo que el POST de todos modos iba a negar. */
  const listas = f.motivo === "lista" ? f.corridas.filter((c) => !c.mesCerrado).length : n;
  const copias: Record<MotivoSinOrigen, { texto: string; ayuda: string; boton: string | null }> = {
    lista:
      listas > 0
        ? {
            texto: `Listas para vincular: ${listas}`,
            ayuda: "Hay trozas de su especie en el patio. Revisa cada una y confirma.",
            boton: "Revisar y vincular",
          }
        : {
            texto: `El mes está cerrado: ${de(n, "corrida", "corridas")}`,
            ayuda: "Reábrelo para vincular.",
            boton: null,
          },
    llegada_posterior: {
      texto: f.guias > 0 ? `Corrige la llegada de ${de(f.guias, "guía", "guías")}` : `Trozas llegadas después: ${n}`,
      ayuda: "Sus trozas figuran llegadas después de producir. Corrige la fecha de llegada en Ingresos.",
      boton: "Ir a Ingresos",
    },
    fila_de_otra_especie: {
      texto: f.trozas > 0 ? `Acomoda ${de(f.trozas, "troza", "trozas")} de otra especie` : `Trozas en otra especie: ${n}`,
      ayuda: "Sus trozas están en la fila de otra especie. Acomódalas en Ingresos.",
      boton: "Ir a Ingresos",
    },
    guia_sin_recibir: {
      texto: f.guias > 0 ? `Recibe ${de(f.guias, "guía", "guías")} primero` : `Guías sin recibir: ${n}`,
      ayuda: "La guía de sus trozas todavía no se recibió. Recíbela en Ingresos.",
      boton: "Recibir en Ingresos",
    },
    apertura: {
      texto: `Madera de antes del libro: ${n}`,
      ayuda: "Salió de madera que ya estaba antes del libro. Declárala como apertura.",
      boton: "Declarar apertura",
    },
    sin_trozas_de_la_especie: {
      texto: `No hay trozas de esa especie: ${n}`,
      ayuda: "No entró madera de esa especie. Queda sin origen hasta que llegue su guía.",
      boton: null,
    },
  };
  return copias[f.motivo];
}

/** «N.º 12 · jueves 10/09 · Tacho · 0,530 m³». */
function lineaDeCorrida(c: DiagnosticoCorrida): string {
  return `N.º ${c.lineNo ?? "—"} · ${etiquetaLarga(c.fecha)} · ${c.especie} · ${formatNumber(c.m3Producido, 3)} m³`;
}

function Fila({ f, onAccion }: { f: FilaDeBandeja; onAccion: (() => void) | null }) {
  const [ver, setVer] = useState(false);
  const { texto, ayuda, boton } = copiaDe(f);
  return (
    <li className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold text-[var(--text-primary)]">{texto}</span>
        <InfoTip title={texto} what={ayuda} />
        {f.motivo !== "lista" && (
          <button type="button" onClick={() => setVer((v) => !v)} aria-expanded={ver} className={LINK}>
            {ver ? "Ocultar" : "Ver cuáles"}
          </button>
        )}
        {boton && onAccion && (
          <Btn
            variant={f.motivo === "lista" ? "primary" : "secondary"}
            onClick={onAccion}
            className="ml-auto max-sm:w-full"
          >
            {boton}
          </Btn>
        )}
      </div>
      {ver && (
        <ul className="mt-1.5 space-y-1 border-t border-[var(--rule-soft)] pt-1.5 text-sm text-[var(--text-secondary)]">
          {f.corridas.slice(0, 12).map((c) => (
            <li key={c.corridaId}>
              <span className="tabular-nums">{lineaDeCorrida(c)}</span>
              {c.detalle && <span className="block text-[var(--text-tertiary)]">{c.detalle}</span>}
            </li>
          ))}
          {f.corridas.length > 12 && <li className="text-[var(--text-tertiary)]">y {f.corridas.length - 12} más</li>}
        </ul>
      )}
    </li>
  );
}

export default function CtpSinOrigenBandeja({
  datos,
  cargando,
  error,
  onReleer,
  onCambio,
  onIr,
  onElegirAMano,
}: {
  datos: DiagnosticoSinOrigen | null;
  cargando: boolean;
  error: string | null;
  onReleer: () => void;
  /** Algo cambió en el libro (se vinculó, se declaró apertura): releer y avisar. */
  onCambio: (mensaje: string) => void;
  onIr?: (vista: string, filtro?: CtpIngresosFiltroRapido) => void;
  onElegirAMano?: (c: DiagnosticoCorrida) => void;
}) {
  const [revisar, setRevisar] = useState<DiagnosticoCorrida[] | null>(null);
  const [aperturas, setAperturas] = useState(false);
  const [aperturaDe, setAperturaDe] = useState<DiagnosticoCorrida | null>(null);
  /* Vincular es del dueño o un administrador (el servidor lo exige igual). */
  const rol = useMiRol();
  const firma = rol == null || puedeFirmarVinculo(rol);

  if (!datos) {
    return error ? (
      <p role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
        No se pudo revisar las producciones. {error}
        <button type="button" onClick={onReleer} className={LINK}>
          Reintentar
        </button>
      </p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Revisando las producciones…
      </p>
    );
  }

  const filas = filasDeBandeja(datos);
  const deApertura = datos.corridas.filter((c) => c.motivo === "apertura");
  const accion = (f: FilaDeBandeja): (() => void) | null => {
    if (f.motivo === "lista") {
      /* Sólo las de verdad vinculables: una con el mes cerrado no tiene nada
         que revisar (el modal la rechazaría igual). */
      const vinculables = f.corridas.filter((c) => !c.mesCerrado);
      return firma && vinculables.length > 0 ? () => setRevisar(vinculables) : null;
    }
    if (f.motivo === "apertura") return () => setAperturas(true);
    if (f.motivo === "guia_sin_recibir") return onIr ? () => onIr("ingresos", "pendiente") : null;
    if (f.motivo === "llegada_posterior" || f.motivo === "fila_de_otra_especie")
      return onIr ? () => onIr("ingresos") : null;
    return null;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2">
        <CardTitle as="h4" className="text-base font-bold text-[var(--text-primary)]">
          {de(datos.total, "producción sin trozas", "producciones sin trozas")}
        </CardTitle>
        <InfoTip
          title="Producciones sin trozas"
          what="No dicen de qué trozas salieron."
          affects="Sin eso no puedes seguir una tabla hasta su guía."
          example="El fiscalizador pregunta por una tabla: le muestras su troza y su guía."
        />
        <button
          type="button"
          onClick={onReleer}
          disabled={cargando}
          aria-label="Volver a revisar"
          className="ml-auto grid h-11 w-11 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>
      {error && <p className="text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{error}</p>}
      <ul className="space-y-2">
        {filas.map((f) => (
          <Fila key={f.motivo} f={f} onAccion={accion(f)} />
        ))}
      </ul>

      {revisar && (
        <CtpRevisarVinculosModal
          corridas={revisar}
          onCerrar={() => setRevisar(null)}
          onVinculada={onCambio}
          onElegirAMano={
            onElegirAMano
              ? (c) => {
                  setRevisar(null);
                  onElegirAMano(c);
                }
              : undefined
          }
        />
      )}

      {/* La lista se esconde mientras el modal de apertura está arriba: apilar
          dos Radix deja el de abajo con los clics apagados. */}
      <AdminModal
        open={aperturas && !aperturaDe}
        onClose={() => setAperturas(false)}
        title="Madera de antes del libro"
        description="Declara cada una como apertura."
        variant="default"
      >
        <ModalBody>
          {deApertura.length === 0 ? (
            <p className="text-base text-[var(--text-secondary)]">Ya no queda ninguna.</p>
          ) : (
            <ul className="space-y-2">
              {deApertura.map((c) => (
                <li key={c.corridaId} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 py-2">
                  <span className="min-w-0 flex-1 basis-[14rem] text-sm tabular-nums text-[var(--text-primary)]">
                    {lineaDeCorrida(c)}
                  </span>
                  <Btn variant="secondary" onClick={() => setAperturaDe(c)} className="max-sm:w-full">
                    Declarar apertura
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
      </AdminModal>
      {aperturaDe && (
        <DeclararAperturaModal
          corridaId={aperturaDe.corridaId}
          lote={aperturaDe.lineNo != null ? `N.º ${aperturaDe.lineNo}` : null}
          onClose={() => setAperturaDe(null)}
          onListo={() => {
            const c = aperturaDe;
            setAperturaDe(null);
            onCambio(`N.º ${c.lineNo ?? "—"} quedó como madera de apertura.`);
          }}
        />
      )}
    </div>
  );
}
