"use client";

/**
 * «Foto de la placa» — la tala entra con UNA foto: la placa del tocón se lee,
 * el árbol del censo se elige (sólo si lo leído es inequívoco), la foto queda
 * como evidencia y el GPS del teléfono como la ubicación del tocón.
 *
 * Por qué (Brandon 28-09): de las 4 talas de Blas, 1 tenía foto y las primeras
 * copiaron el GPS del censo. La RDE 264-2019 (sección 1, ítem 3) pide el
 * código marcado en fuste y tocón; la foto de la placa con el GPS del tocón es
 * lo que lo prueba ante OSINFOR. El marcado en el tocón se declara sólo si la
 * persona lo confirma: leer la placa no prueba dónde estaba clavada.
 *
 * En una PLANTACIÓN (ADR-459) el censo son los «árboles marcados»; si ninguno
 * coincide, la placa propone la especie del registro por la abreviatura del
 * código («003-BOL» → Bolaina) y deja ese código en la línea.
 */

import { useRef } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DISTANCIA_ALERTA_M, distanciaAlArbol, type ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import { porcentajeConfianza } from "@/lib/forestal/loth-placa";
import type { EspecieDelRegistro } from "@/lib/forestal/loth-tala-plantacion";
import { formatDistance } from "@/lib/forestal/loth-utm";
import { usePlacaFoto, type EstadoPaso, type GpsTelefono } from "./hooks/use-placa-foto";
import LothPlacaCruce, { CorregirCodigo, type RegistroDePlaca } from "./LothPlacaCruce";
import { AMBAR } from "./loth-ficha-ui";
import AvisoClaveIa from "@/components/admin/shared/AvisoClaveIa";

const OK = "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]";
const ERROR = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

interface Props {
  arboles: readonly ArbolParaElegir[];
  cargandoCenso: boolean;
  /** Código del árbol que la línea tiene ahora. */
  elegido: string;
  onElegir: (a: ArbolParaElegir) => void;
  onFoto: (url: string) => void;
  onGps: (lat: number, lng: number) => void;
  marcadoTocon: boolean;
  onMarcadoTocon: (v: boolean) => void;
  /** El plan es una plantación: el censo son sus «árboles marcados». */
  plantacion?: boolean;
  /** Plantación con especies en el registro: si ningún árbol marcado coincide, la especie por el código. */
  registro?: {
    especies: readonly EspecieDelRegistro[];
    cargando: boolean;
    /** La especie que la línea tiene ahora. */
    especieElegida: string;
    onEspecie: (e: EspecieDelRegistro, codigo: string) => void;
  } | null;
}

export default function LothPlacaFoto({
  arboles,
  cargandoCenso,
  elegido,
  onElegir,
  onFoto,
  onGps,
  marcadoTocon,
  onMarcadoTocon,
  plantacion = false,
  registro = null,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const p = usePlacaFoto(
    arboles,
    cargandoCenso,
    { onElegir, onFoto, onGps, onEspecie: registro?.onEspecie },
    registro ? { especies: registro.especies, cargando: registro.cargando } : null,
  );
  const deRegistro: RegistroDePlaca | null = registro
    ? { cruce: p.cruceRegistro, cargando: registro.cargando, especieElegida: registro.especieElegida, onEspecie: p.confirmarEspecie }
    : null;
  const arbolActual = elegido.trim() ? arboles.find((a) => a.treeCode === elegido.trim()) ?? null : null;

  return (
    <section aria-label="Foto de la placa" className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* `capture`: en el celular abre directo la cámara de atrás. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label="Foto de la placa del tocón"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void p.procesar(f);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={p.procesando}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--accent)]/10 disabled:cursor-wait disabled:opacity-70"
        >
          {p.procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" />}
          {p.procesando ? "Leyendo la placa…" : p.activa ? "Otra foto de la placa" : "Foto de la placa"}
        </button>
        <span className="flex min-w-0 items-center gap-1 text-sm text-[var(--text-secondary)]">
          {registro ? "Lee el código, elige la especie y toma el GPS." : "Lee el código, elige el árbol y toma el GPS."}
          {registro ? (
            <InfoTip
              title="Foto de la placa"
              what="Toma la foto de la placa clavada en el tocón: se lee el código y, si no es un árbol marcado, se elige la especie del registro por sus letras. La foto queda con el GPS del teléfono."
              affects="Es la prueba del marcado (RDE 264-2019, ítem 3) si OSINFOR supervisa. Si las letras sirven para más de una especie, te pide elegir: nunca elige solo."
              example="Foto a la placa «003-BOL» → Bolaina del registro, código 003-BOL, con la foto y el GPS del tocón."
            />
          ) : (
            <InfoTip
              title="Foto de la placa"
              what={`Toma la foto de la placa clavada en el tocón: se lee el código, se busca ${plantacion ? "entre los árboles marcados" : "el árbol en el censo"} y la foto queda con el GPS del teléfono.`}
              affects="Es la prueba del marcado (RDE 264-2019, ítem 3) si OSINFOR supervisa. Si lo leído es dudoso, te pide confirmar: nunca elige solo."
              example="Foto a la placa «114» → se elige el 114 · Lupuna, con la foto y el GPS del tocón."
            />
          )}
        </span>
      </div>

      {p.activa && (
        <div className="flex gap-3" aria-live="polite">
          {p.vista && (
            // eslint-disable-next-line @next/next/no-img-element -- vista local (blob:) antes de subirla
            <img src={p.vista} alt="Foto de la placa" className="h-20 w-20 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover" />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <LineaLectura p={p} elegido={elegido} onConfirmar={p.confirmar} plantacion={plantacion} registro={deRegistro} />
            <LineaGps gps={p.gps} procesando={p.procesando} arbol={arbolActual} plantacion={plantacion} />
            <LineaFoto foto={p.foto} procesando={p.procesando} />
            {p.lectura.estado === "listo" && p.lectura.valor.codigo && (
              <label className="flex min-h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={marcadoTocon}
                  onChange={(e) => onMarcadoTocon(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-[var(--accent-dark)]"
                />
                El código está marcado en el tocón
              </label>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type Placa = ReturnType<typeof usePlacaFoto<EspecieDelRegistro>>;

function LineaLectura({
  p,
  elegido,
  onConfirmar,
  plantacion,
  registro,
}: {
  p: Placa;
  elegido: string;
  onConfirmar: (a: ArbolParaElegir) => void;
  plantacion: boolean;
  registro: RegistroDePlaca | null;
}) {
  const l = p.lectura;
  if (l.estado === "espera") {
    return p.procesando ? (
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el código…
      </p>
    ) : null;
  }
  if (l.estado === "error") {
    return (
      <div className="space-y-1.5">
        {/* Sin la IA de la plataforma no es un error de la foto: el aviso único, en tono neutro. */}
        {l.sinClave ? (
          <AvisoClaveIa mensaje={l.error} conInstrucciones={l.instrucciones} />
        ) : (
          <p className={`flex items-start gap-1.5 text-sm font-semibold ${l.sinLector ? "text-[var(--text-secondary)]" : ERROR}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">{l.error}</span>
          </p>
        )}
        <p className="text-sm text-[var(--text-secondary)]">Escribe el código de la placa:</p>
        <CorregirCodigo inicial="" abierto onBuscar={p.escribirCodigo} />
      </div>
    );
  }
  const v = l.valor;
  return (
    <div className="space-y-1.5">
      {v.codigo && (
        <p className="text-sm text-[var(--text-primary)]">
          {v.escrito ? "Código escrito" : "Leí"} <b className="font-mono">«{v.codigo}»</b>
          {!v.escrito && <span className="text-[var(--text-secondary)]"> · {porcentajeConfianza(v.confianza)} de seguridad</span>}
          {v.nota && <span className="block text-xs text-[var(--text-tertiary)]">{v.nota}</span>}
        </p>
      )}
      <LothPlacaCruce
        lectura={v}
        cruce={p.cruce}
        elegido={elegido}
        onConfirmar={onConfirmar}
        onEscribir={p.escribirCodigo}
        plantacion={plantacion}
        registro={registro}
      />
    </div>
  );
}

function LineaGps({
  gps,
  procesando,
  arbol,
  plantacion,
}: {
  gps: EstadoPaso<GpsTelefono>;
  procesando: boolean;
  arbol: ArbolParaElegir | null;
  plantacion: boolean;
}) {
  const marcado = plantacion ? "marcado" : "censado";
  if (gps.estado === "espera") {
    return procesando ? (
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Tomando el GPS del teléfono…
      </p>
    ) : null;
  }
  if (gps.estado === "error") {
    return (
      <p className="flex items-start gap-1.5 text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
        <MapPin className="mt-px h-3.5 w-3.5 shrink-0" /> {gps.error} La línea queda sin el GPS del tocón.
      </p>
    );
  }
  const g = gps.valor;
  const d = arbol ? distanciaAlArbol(arbol, g.lat, g.lng) : null;
  const precision = g.precisionM != null ? ` · ±${Math.round(g.precisionM)} m` : "";
  if (d != null && d > DISTANCIA_ALERTA_M) {
    return (
      <p className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${AMBAR}`}>
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          GPS del teléfono{precision}: estás a {formatDistance(d)} del árbol {arbol?.treeCode} {marcado}. ¿Es el árbol correcto?
        </span>
      </p>
    );
  }
  /* Un solo `<span>`: a 400 px el texto envuelve como frase, no en columnas. */
  return (
    <p className={`flex items-start gap-1.5 text-xs font-semibold ${OK}`}>
      <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        GPS del teléfono{precision}
        {d != null && <span className="font-normal"> · {d < 1 ? "a menos de 1 m" : `a ${formatDistance(d)}`} del árbol {marcado}</span>}
      </span>
    </p>
  );
}

function LineaFoto({ foto, procesando }: { foto: EstadoPaso<string>; procesando: boolean }) {
  if (foto.estado === "espera") {
    return procesando ? (
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando la foto…
      </p>
    ) : null;
  }
  if (foto.estado === "error") {
    return (
      <p className={`flex items-start gap-1.5 text-xs font-semibold ${ERROR}`}>
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {foto.error}
      </p>
    );
  }
  return (
    <p className={`flex items-center gap-1.5 text-xs font-semibold ${OK}`}>
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Foto guardada como evidencia de la línea
    </p>
  );
}
