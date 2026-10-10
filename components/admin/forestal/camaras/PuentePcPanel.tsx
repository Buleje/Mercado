"use client";

/**
 * «Puente desde la PC» dentro de «Conectar» (Brandon 2026-10-03, ADR-466).
 *
 * La cámara de la oficina va sólo por 4G y la única que la ve es Hik-Connect.
 * En la PC, Hik-Connect corre en BlueStacks (o el iVMS-4200) y el script
 * `camaras-puente-pc.ps1` captura esa ventana y la manda acá cada segundo.
 * Este panel da lo que el script necesita (la dirección y la clave, en un
 * comando listo para pegar), cuándo un cuadro pasa al historial —que es lo que
 * cuesta, porque ahí lo lee la IA— y qué parte de la captura es la cámara.
 */

import { useState } from "react";
import { Check, Coins, Copy, Download, Loader2, Lock, Monitor, PowerOff, ShieldAlert } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import RecorteCuadro from "./RecorteCuadro";
import { SOLO_ADMIN_DIRECCION } from "./camaras-ui";
import type { CamaraConConexion } from "./ConectarCamaraModal";
import type { AjustesPuente } from "./use-ajustes-puente";
import {
  comandoPuente,
  configPuente,
  costoMaximoDia,
  LIMITES_VIVO,
  textoDolares,
  urlPuente,
  VENTANAS_PUENTE,
  type AjustesVivo,
} from "./puente-pc";

const ETIQUETA = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const BOTON =
  "inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]";
const BLOQUE = "space-y-3 rounded-xl border border-[var(--rule-base)] p-3";
const TITULO = "flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]";

/** Los tres ajustes del modo vivo: rótulo, unidad y su ⓘ. */
const CAMPOS_VIVO: readonly {
  campo: keyof AjustesVivo;
  rotulo: string;
  unidad: string;
  what: string;
  example: string;
}[] = [
  {
    campo: "umbralPct",
    rotulo: "Si cambia más de",
    unidad: "%",
    what: "Cuánto de la imagen tiene que cambiar para guardarla y que la IA la lea. Se compara contra la última guardada, así un cambio lento (la luz de la tarde) igual se junta.",
    example: "Con 8 %, una persona que cruza el patio se guarda; el viento en las hojas, no.",
  },
  {
    campo: "cadaMin",
    rotulo: "Guardar igual cada",
    unidad: "min",
    what: "Aunque no cambie nada, una foto cada tanto: así el historial muestra que la cámara siguió mirando.",
    example: "Con 15 min, una noche tranquila deja 4 fotos por hora.",
  },
  {
    campo: "maxDia",
    rotulo: "Máximo por día",
    unidad: "fotos",
    what: "El tope de fotos guardadas en el día (de Lima). Es también el tope de lecturas de la IA, que es lo que cuesta.",
    example: "60 fotos ≈ US$0,60 al día como mucho.",
  },
];

interface Props {
  camara: CamaraConConexion;
  a: AjustesPuente;
}

export default function PuentePcPanel({ camara, a }: Props) {
  const [copiado, setCopiado] = useState<"comando" | "clave" | null>(null);
  const url = urlPuente(typeof window !== "undefined" ? window.location.origin : "");
  const comando = comandoPuente({ url, token: camara.token, ventana: a.ventana });
  const textos = { umbralPct: a.umbral, cadaMin: a.cadaMin, maxDia: a.maxDia };
  const setters = { umbralPct: a.setUmbral, cadaMin: a.setCadaMin, maxDia: a.setMaxDia };

  const copiar = async (que: "comando" | "clave", texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(que);
      setTimeout(() => setCopiado((k) => (k === que ? null : k)), 2500);
    } catch {
      setCopiado(null);
    }
  };

  const descargar = () => {
    const blob = new Blob([configPuente({ url, token: camara.token, ventana: a.ventana })], {
      type: "application/json",
    });
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = "camaras-puente-pc.json";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  };

  return (
    <div className="space-y-3">
      <section className={BLOQUE} aria-labelledby="puente-pc-paso1">
        <div className="flex flex-wrap items-center gap-2">
          <span id="puente-pc-paso1" className={cn(TITULO, "mr-auto")}>
            <Monitor className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
            1. En la PC
            <InfoTip
              title="Cómo funciona el puente"
              what="Abre Hik-Connect en BlueStacks (o el iVMS-4200) con la cámara a la vista. El script captura esa ventana y la manda acá cada segundo; puede quedar detrás de otras ventanas, pero no minimizada."
              affects="Con doble clic: deja el script, el lanzador .cmd y la configuración descargada en la misma carpeta. Los pasos completos están en docs/forestal/puente-camaras-pc.md."
              example="Si la PC del puente no es esta, cambia «localhost:3000» por la dirección del panel."
            />
          </span>
          <SegmentedControl
            value={a.ventana}
            onChange={a.setVentana}
            size="sm"
            label="Programa que tiene abierta la cámara"
            options={VENTANAS_PUENTE.map((v) => ({ value: v, label: v }))}
          />
        </div>
        {/* Sin clave no hay comando: el servidor sólo se la da a admin y dueño
            (revisión de seguridad 03-10), y un comando con `-Token ""` no anda. */}
        {!camara.token ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <Lock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            {SOLO_ADMIN_DIRECCION}
          </p>
        ) : (
          <>
            <code className="block break-all rounded-lg bg-[var(--surface-sunken)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
              {comando}
            </code>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copiar("comando", comando)} className={BOTON}>
                {copiado === "comando" ? <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copiado === "comando" ? "Copiado" : "Copiar comando"}
              </button>
              <button type="button" onClick={() => void copiar("clave", camara.token)} className={BOTON}>
                {copiado === "clave" ? <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copiado === "clave" ? "Copiada" : "Copiar clave"}
              </button>
              <button type="button" onClick={descargar} className={BOTON}>
                <Download className="h-4 w-4" aria-hidden /> Descargar configuración
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              La clave va en el comando y en el archivo: no los compartas.
              <InfoTip
                title="Quien tiene la clave, manda imágenes"
                what="El comando y camaras-puente-pc.json llevan la clave de esta cámara en texto plano: con ellos cualquiera puede mandar imágenes como si fuera la cámara."
                affects="Guárdalos sólo en la PC del puente. Si se filtraron, «Cambiar la dirección» de la cámara (el botón de las flechas) crea una clave nueva y la vieja deja de entrar."
                example="No los mandes por WhatsApp ni los subas al drive."
              />
            </p>
          </>
        )}
      </section>

      <section className={BLOQUE} aria-labelledby="puente-pc-paso2">
        <span id="puente-pc-paso2" className={TITULO}>
          2. Cuándo pasa al historial
        </span>
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {CAMPOS_VIVO.map((c) => (
            <div key={c.campo} className="block">
              <span className="flex items-center gap-1">
                <label htmlFor={`puente-${c.campo}`} className={ETIQUETA}>{c.rotulo}</label>
                <InfoTip title={c.rotulo} what={c.what} example={c.example} />
              </span>
              <span className="relative mt-1 block">
                <input
                  id={`puente-${c.campo}`}
                  value={textos[c.campo]}
                  onChange={(e) => setters[c.campo](e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
                  inputMode="numeric"
                  aria-describedby={`puente-rango-${c.campo}`}
                  className={cn(CAMPO, "pr-14")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">
                  {c.unidad}
                </span>
              </span>
              <span id={`puente-rango-${c.campo}`} className="sr-only">
                Entre {LIMITES_VIVO[c.campo][0]} y {LIMITES_VIVO[c.campo][1]}
              </span>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <Coins className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          {/* Un solo span: sueltos, cada pedazo era una columna del flex y a 400 px se partía en cuatro. */}
          <span>
            Como mucho <b className="tabular-nums text-[var(--text-primary)]">{a.vivo.maxDia}</b> lecturas al día ≈{" "}
            <b className="tabular-nums text-[var(--text-primary)]">{textoDolares(costoMaximoDia(a.vivo.maxDia))}</b>
          </span>
          <InfoTip
            title="Lo que cuesta la IA"
            what="Cada foto que pasa al historial la lee la IA: unos US$0,01 por lectura. Los cuadros que no cambian no se guardan ni se leen."
            affects="Leer un cuadro por segundo serían US$864 al día por cámara: por eso se filtra por cambio. El panel además corta la IA si el mes pasa de US$20."
            example={`${a.vivo.maxDia} fotos por día × 30 días ≈ ${textoDolares(costoMaximoDia(a.vivo.maxDia) * 30)} al mes como mucho.`}
          />
        </p>
      </section>

      <section className={BLOQUE} aria-labelledby="puente-pc-paso3">
        <span id="puente-pc-paso3" className={TITULO}>
          3. Qué parte es la cámara
          <InfoTip
            title="Recorte"
            what="Arrastra un rectángulo sobre la imagen para quedarte sólo con el video, sin la barra ni los botones de Hik-Connect."
            affects="Con la vista de 4 cámaras, elige el cuadrante. El servidor recorta cada cuadro así antes de compararlo y guardarlo."
          />
        </span>
        <RecorteCuadro camaraId={camara.id} base={a.base} recorte={a.recorte} onCambiar={a.setRecorte} />
      </section>
    </div>
  );
}

/** El pie del modal en modo puente: guardar, cancelar y —si ya está andando— dejar de usarlo. */
export function PiePuente({
  a,
  guardando,
  onCerrar,
  onGuardar,
  onQuitar,
}: {
  a: AjustesPuente;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: () => void;
  onQuitar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.activo && (
        <button
          type="button"
          onClick={onQuitar}
          disabled={guardando}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)] disabled:opacity-50"
        >
          <PowerOff className="h-4 w-4" aria-hidden /> Dejar de usar el puente
        </button>
      )}
      <button
        type="button"
        onClick={onCerrar}
        className="ml-auto inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onGuardar}
        disabled={guardando || !a.hayCambios}
        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
      >
        {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        {a.activo ? "Guardar cambios" : "Usar el puente"}
      </button>
    </div>
  );
}
