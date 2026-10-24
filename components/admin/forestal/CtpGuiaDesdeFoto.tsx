"use client";

/**
 * CtpGuiaDesdeFoto — «Leer de una foto» en el alta de una guía guardada
 * (ADR-442): el botón y lo que se leyó, con el estado de la foto frente a su
 * casillero «GTF». La lógica (leer, llenar, subir) vive en
 * `hooks/use-guia-desde-foto.ts`; el modal sólo lo monta y avisa cuándo la
 * guía quedó guardada.
 *
 * Con N° de registro leído, se busca en SERFOR con el MISMO guardado del botón
 * «Buscar en SERFOR» (la ficha manda en GTF, titular, permiso y fecha). Sin él,
 * se llenan los huecos con lo que se leyó y la persona revisa y guarda.
 */

import { useRef, type Dispatch, type SetStateAction } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  X,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AvisoClaveIa from "@/components/admin/shared/AvisoClaveIa";
import { formatDateNumeric } from "@/lib/format";
import { formConLectura, type GuiaDesdeFoto, type LecturaDeGuia } from "@/hooks/use-guia-desde-foto";
import { Btn } from "./ctp-shared";
import type { FormGuia } from "./guia-guardada-form";

/* ── El botón ─────────────────────────────────────────────────────────────── */

export default function CtpGuiaDesdeFoto({
  foto,
  form,
  onForm,
  guardarConSerfor,
  bloqueado,
}: {
  foto: GuiaDesdeFoto;
  /** El de la pantalla: mientras se lee, los campos están bloqueados y no cambia. */
  form: FormGuia;
  onForm: Dispatch<SetStateAction<FormGuia>>;
  /** El guardado de «Buscar en SERFOR», con el formulario que se le pasa. `null` = no se guardó. */
  guardarConSerfor: (f: FormGuia) => Promise<unknown>;
  bloqueado: boolean;
}) {
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const alElegir = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const l = await foto.leer(file);
    if (!l) return;
    if (!l.numeroRegistro) {
      onForm((prev) => formConLectura(prev, l));
      return;
    }
    /* La foto se sacó PARA leer el registro: ese manda sobre uno tipeado antes.
       El formulario viaja entero: el estado todavía no tiene el número. */
    const conRegistro = { ...form, numeroRegistro: l.numeroRegistro };
    onForm(conRegistro);
    const guardada = await guardarConSerfor(conRegistro);
    /* SERFOR no la encontró o no respondió: lo demás que se leyó queda puesto
       para guardarla a mano. */
    if (!guardada) onForm((prev) => formConLectura(prev, l));
  };

  const input = (ref: React.RefObject<HTMLInputElement | null>, camara: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture={camara ? "environment" : undefined}
      hidden
      onChange={(e) => {
        void alElegir(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const apagado = bloqueado || foto.leyendo;
  return (
    <div className="flex items-center gap-2 sm:ml-auto">
      {/* En el celular abre la cámara trasera; en la computadora, el explorador. */}
      <Btn
        variant="secondary"
        onClick={() => camaraRef.current?.click()}
        disabled={apagado}
        title="Saca foto a la GTF: se lee su N° de registro y se busca en SERFOR"
      >
        {foto.leyendo ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Camera className="h-4 w-4" aria-hidden />
        )}
        {foto.leyendo ? "Leyendo la guía…" : "Leer de una foto"}
      </Btn>
      {/* La guía que llegó por WhatsApp ya está en la galería del celular. */}
      <Btn
        variant="secondary"
        className="sm:hidden"
        onClick={() => galeriaRef.current?.click()}
        disabled={apagado}
        aria-label="Leer una foto de la galería"
        title="Leer una foto de la galería"
      >
        <ImagePlus className="h-4 w-4" aria-hidden />
      </Btn>
      <InfoTip
        title="Leer la guía de una foto"
        what="Saca foto a la GTF: se lee su N° de registro, se busca en SERFOR y la guía queda guardada con la foto en su casillero «GTF»."
        affects="Si la foto no deja leer el N° de registro, se llenan la GTF, la fecha y el titular que se lean: revísalos y guarda. La ficha de SERFOR manda sobre lo leído."
        example="Te mandan la guía por WhatsApp: en el celular, el botón de la galería la lee sin volver a sacarle foto."
        side="left"
      />
      {input(camaraRef, true)}
      {input(galeriaRef, false)}
    </div>
  );
}

/* ── Lo que se leyó ───────────────────────────────────────────────────────── */

function Leido({ label, valor, mono = false }: { label: string; valor: string; mono?: boolean }) {
  if (!valor) return null;
  return (
    <div className="min-w-0 max-w-full">
      <dt className="text-xs font-medium text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`truncate text-sm font-bold text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>{valor}</dd>
    </div>
  );
}

function DatosLeidos({ l }: { l: LecturaDeGuia }) {
  return (
    /* A lo ancho del contenido: en una grilla fija la GTF se cortaba («019-999-44204…»). */
    <dl className="flex flex-wrap gap-x-6 gap-y-1">
      <Leido label="N° de registro" valor={l.numeroRegistro} mono />
      <Leido label="N° de GTF" valor={l.gtfNumber} mono />
      <Leido label="Fecha" valor={l.fecha ? formatDateNumeric(l.fecha, { soloFecha: true }) : ""} />
      <Leido label="Titular" valor={l.titular} />
    </dl>
  );
}

/* `items-start` sin wrap: a 400 px el ícono se quedaba solo en su renglón. */
const LINEA = "flex items-start gap-2 text-sm";
const ICONO = "mt-0.5 h-4 w-4 shrink-0";
const ALERTA = "text-[var(--data-warning-ink)]";

/** Aviso con su acción debajo: el ícono no se queda solo en su renglón al partir el texto. */
function AvisoConAccion({ children, accion }: { children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 text-sm ${ALERTA}`}>
      <AlertTriangle className={ICONO} aria-hidden />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <span>{children}</span>
        {accion}
      </div>
    </div>
  );
}

/** Qué pasa con la foto: espera a la guía, se sube, ya está o hay que mirarla. */
function EstadoDeLaFoto({ foto, gtf }: { foto: GuiaDesdeFoto; gtf: string | null }) {
  const subir = (aunque = false) => gtf && void foto.subirA(gtf, aunque);
  switch (foto.estado) {
    case "subiendo":
      return (
        <p className={`${LINEA} text-[var(--text-secondary)]`}>
          <Loader2 className={`${ICONO} animate-spin`} aria-hidden /> Guardando la foto en el casillero «GTF»…
        </p>
      );
    case "guardada":
      return (
        <p className={`${LINEA} font-bold text-[var(--data-success-ink)]`}>
          <CheckCircle2 className={ICONO} aria-hidden /> La foto quedó en el casillero «GTF»
        </p>
      );
    case "error":
      return (
        <AvisoConAccion
          accion={
            gtf && (
              <Btn size="sm" onClick={() => subir()}>
                Reintentar
              </Btn>
            )
          }
        >
          {foto.aviso}
        </AvisoConAccion>
      );
    case "revisar":
      return (
        <AvisoConAccion
          accion={
            <Btn size="sm" onClick={() => subir(true)}>
              Es de esta guía: subirla
            </Btn>
          }
        >
          {foto.lectura?.gtfNumber ? (
            <>
              La foto dice GTF <b className="font-mono">{foto.lectura.gtfNumber}</b> y la guía guardada es{" "}
              <b className="font-mono">{gtf}</b>: no se subió.
            </>
          ) : (
            <>
              En la foto no se leyó la GTF: mira que sea la <b className="font-mono">{gtf}</b> antes de subirla.
            </>
          )}
        </AvisoConAccion>
      );
    case "pendiente":
      return gtf ? (
        <div className={LINEA}>
          <Btn size="sm" onClick={() => subir()}>
            Guardarla en el casillero «GTF»
          </Btn>
        </div>
      ) : (
        <p className={`${LINEA} text-[var(--text-secondary)]`}>
          <Clock className={ICONO} aria-hidden /> Queda en el casillero «GTF» al guardar la guía
        </p>
      );
    default:
      return null;
  }
}

/**
 * Lo leído, para confirmarlo contra la foto, y el estado de la foto. Sin
 * lectura, la línea de aviso (no se leyó nada, el lector no está…).
 */
export function LecturaDeFoto({ foto, gtf }: { foto: GuiaDesdeFoto; gtf: string | null }) {
  const l = foto.lectura;
  if (!l) {
    /* Falta la IA de la plataforma: el aviso único, en tono neutro (no es la foto). */
    if (foto.aviso && foto.sinClave) {
      return <AvisoClaveIa mensaje={foto.aviso} conInstrucciones={foto.sinClave.instrucciones} />;
    }
    return foto.aviso ? (
      <div role="status">
        <AvisoConAccion>{foto.aviso}</AvisoConAccion>
      </div>
    ) : null;
  }
  const quitable = foto.estado === "pendiente" || foto.estado === "revisar" || foto.estado === "error";
  return (
    <section
      aria-label="Leído de la foto"
      className="flex gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
    >
      {foto.miniatura && (
        <a href={foto.miniatura} target="_blank" rel="noreferrer" className="shrink-0" title="Ver la foto entera">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto local del navegador (blob:), no pasa por next/image */}
          <img
            src={foto.miniatura}
            alt="Foto de la guía"
            className="h-20 w-16 rounded-md border border-[var(--rule-base)] object-cover"
          />
        </a>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">Leído de la foto</span>
          <InfoTip
            title="Lo que se leyó"
            what="Compáralo con la foto. Con el N° de registro se buscó la ficha de SERFOR: ella manda en la GTF, el titular, el permiso y la fecha."
            example="Si la foto dice otra GTF que la guía guardada, la foto no se sube sola: la miras y confirmas."
          />
          {quitable && (
            <Btn
              size="sm"
              className="ml-auto"
              onClick={foto.descartar}
              aria-label="Quitar la foto"
              title="No guardar esta foto en el casillero «GTF»"
            >
              <X className="h-4 w-4" aria-hidden />
            </Btn>
          )}
        </div>
        <DatosLeidos l={l} />
        <div role="status" aria-live="polite">
          <EstadoDeLaFoto foto={foto} gtf={gtf} />
        </div>
      </div>
    </section>
  );
}
