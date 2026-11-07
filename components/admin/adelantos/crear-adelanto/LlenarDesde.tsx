"use client";

/**
 * La franja de arriba del alta: «Llenar desde: Foto · Cámara · Dictar».
 *
 * FOTO. La captura del Yape, Plin o de la transferencia: elegirla, sacarla con
 * la cámara, pegarla con Ctrl+V (desde WhatsApp Web, en cualquier parte del
 * alta) o soltarla sobre la franja. La lee el OCR del navegador: la foto no
 * sale del equipo hasta que guardes, y entonces va privada.
 *
 * DICTAR. La fila se vuelve un campo «Escribe o dicta»: el micrófono del
 * navegador (es-PE), o lo que Handy o el teclado del celular escriban ahí.
 * Enter, «Llenar» o pegar una frase entera llenan el alta. Dictar en dos
 * tiempos («mil doscientos» … «a la mamá de Alex») vuelve a leer la frase
 * completa: no suma dos montos.
 *
 * Ninguna de las dos guarda: dejan todo marcado para revisar.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, Loader2, Mic, MicOff, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useVozContinua } from "@/hooks/use-voz-continua";
import { useIsTouch } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import CapturaFoto from "../CapturaFoto";
import type { LeerVoucher } from "../hooks/use-leer-voucher";
import { inputCls } from "../shared";
import type { DictarAdelanto } from "./use-dictar-adelanto";

const BOTON = button({ variant: "secondary", className: "rounded-xl px-3 max-sm:px-2.5" });
const ICONO = button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });

/** La foto de la cámara en vivo llega como data URL: el OCR y el adjunto piden un File. */
function archivoDeDataUrl(dataUrl: string): File {
  const [cabecera, datos = ""] = dataUrl.split(",");
  const tipo = /data:([^;]+)/.exec(cabecera ?? "")?.[1] ?? "image/jpeg";
  const bin = atob(datos);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], "camara.jpg", { type: tipo });
}

/** La cámara en vivo sólo si el sitio la deja (en /admin puede venir apagada por cabecera). */
function camaraEnVivo(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") return false;
  const politica = (document as Document & { featurePolicy?: { allowsFeature?: (f: string) => boolean } }).featurePolicy;
  return politica?.allowsFeature?.("camera") !== false;
}

function FilaDictado({ dictado, onCerrar }: { dictado: DictarAdelanto; onCerrar: () => void }) {
  const [texto, setTexto] = useState("");
  const textoRef = useRef("");
  const campoRef = useRef<HTMLInputElement>(null);
  const poner = (t: string) => {
    textoRef.current = t;
    setTexto(t);
  };
  /* Cada frase final del micrófono se suma a lo escrito y se lee TODO otra vez. */
  const voz = useVozContinua((final) => {
    const nuevo = `${textoRef.current} ${final}`.replace(/\s+/g, " ").trim();
    poner(nuevo);
    dictado.llenar(nuevo);
  });
  useEffect(() => {
    const id = requestAnimationFrame(() => campoRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  const cerrar = () => {
    voz.detener();
    onCerrar();
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2" data-llenar-desde="dictar">
        {voz.supported && (
          <button
            type="button"
            onClick={voz.toggle}
            aria-pressed={voz.listening}
            aria-label={voz.listening ? "Dejar de escuchar" : "Dictar con el micrófono"}
            title={voz.listening ? "Dejar de escuchar" : "Dictar con el micrófono"}
            className={cn(ICONO, voz.listening && "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40")}
          >
            {voz.listening ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
          </button>
        )}
        <input
          ref={campoRef}
          value={texto}
          onChange={(e) => {
            const v = e.target.value;
            const antes = textoRef.current;
            poner(v);
            /* Handy y el pegado escriben la frase de golpe: se llena sin esperar el Enter. */
            const tipo = (e.nativeEvent as InputEvent).inputType;
            if (tipo === "insertFromPaste" || v.length - antes.length >= 8) dictado.llenar(v);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            dictado.llenar(texto);
          }}
          enterKeyHint="done"
          aria-label="Escribe o dicta el adelanto"
          placeholder="Escribe o dicta: «le di 500 a Wasaco por aserrío»"
          className={cn(inputCls, "min-w-0 flex-1")}
        />
        <button type="button" onClick={() => dictado.llenar(texto)} disabled={!texto.trim()} className={cn(BOTON, "max-sm:hidden")}>
          Llenar
        </button>
        <button type="button" onClick={cerrar} aria-label="Cerrar el dictado" title="Cerrar el dictado" className={ICONO}>
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {voz.listening && (
        <p className="text-sm italic text-[var(--text-secondary)]" aria-live="polite">
          {voz.liveText || "Te escucho…"}
        </p>
      )}
      {voz.errMsg && <p className="text-sm font-semibold text-[var(--data-error-ink)]">{voz.errMsg}</p>}
    </div>
  );
}

export default function LlenarDesde({ voucher, dictado }: { voucher: LeerVoucher; dictado: DictarAdelanto }) {
  const [dictando, setDictando] = useState(false);
  const [enVivo, setEnVivo] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const tactil = useIsTouch();
  const leyendo = voucher.estado.fase === "leyendo";
  const { leer } = voucher;

  /* Ctrl+V con una imagen en cualquier parte del alta. El texto se pega como siempre. */
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (!f) return;
      e.preventDefault();
      void leer(f);
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [leer]);

  const alElegir = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    /* Vaciarlo: elegir la misma captura otra vez tiene que volver a leerla. */
    e.target.value = "";
    if (f) void leer(f);
  };

  if (dictando) return <FilaDictado dictado={dictado} onCerrar={() => setDictando(false)} />;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 sm:gap-2"
      data-llenar-desde="botones"
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0];
        if (!f) return;
        e.preventDefault();
        void leer(f);
      }}
    >
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-secondary)]">
        Llenar desde:
        <InfoTip
          what="La captura del Yape, Plin o de la transferencia: pongo el monto, la fecha, la persona y el N° de operación. O dilo con tus palabras."
          example="«le di 500 a Wasaco por aserrío» · «Wasaco me prestó 300» · la captura pegada con Ctrl+V desde WhatsApp Web."
          affects="Nada se guarda solo: queda marcado para que lo revises y confirmes con el botón de abajo."
        />
      </span>
      <button type="button" onClick={() => archivoRef.current?.click()} disabled={leyendo} className={BOTON} title="Elige la captura del Yape, Plin o de la transferencia">
        {leyendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />} Foto
      </button>
      <button
        type="button"
        onClick={() => (!tactil && camaraEnVivo() ? setEnVivo(true) : camaraRef.current?.click())}
        disabled={leyendo}
        className={cn(BOTON, "max-sm:w-12 max-sm:px-0")}
        title="Sácale una foto al comprobante"
      >
        {/* A 400 px sólo el ícono: así «Llenar desde» y los tres entran en una fila. */}
        <Camera className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Cámara</span>
      </button>
      <button type="button" onClick={() => setDictando(true)} className={BOTON} title="Escribe o dicta el adelanto con tus palabras">
        <Mic className="h-4 w-4" aria-hidden /> Dictar
      </button>
      <span className="hidden text-sm text-[var(--text-tertiary)] md:inline">o pega la captura con Ctrl+V</span>
      <input ref={archivoRef} type="file" accept="image/*" aria-label="Captura del comprobante" data-llenar-archivo className="hidden" onChange={alElegir} />
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" aria-label="Foto del comprobante" className="hidden" onChange={alElegir} />
      {enVivo && <CapturaFoto onFoto={(jpeg) => void leer(archivoDeDataUrl(jpeg))} onCerrar={() => setEnVivo(false)} />}
    </div>
  );
}
