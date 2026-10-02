"use client";

/**
 * Lo que la foto de la placa dijo, cruzado con el censo: el árbol elegido, los
 * candidatos para confirmar o el código para corregir. Presentación pura: el
 * cruce lo decide `cruzarPlacaConCenso` y elegir lo hace el formulario.
 *
 * En una plantación (ADR-459) el censo son los «árboles marcados» y, si
 * ninguno coincide, se ofrece la especie del registro por la abreviatura del
 * código (`cruzarPlacaConRegistro`).
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search } from "@buleje/design-system/icons";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import {
  claveDeCodigo,
  porcentajeConfianza,
  type CrucePlaca,
  type CrucePlacaRegistro,
  type MotivoConfirmar,
  type MotivoConfirmarEspecie,
} from "@/lib/forestal/loth-placa";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { EspecieDelRegistro } from "@/lib/forestal/loth-tala-plantacion";
import type { LecturaVista } from "./hooks/use-placa-foto";
import { cls } from "./loth-entry-form-ui";
import { AMBAR } from "./loth-ficha-ui";

const OK = "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]";

function tituloConfirmar(motivo: MotivoConfirmar, lectura: LecturaVista, n: number, arbol: ArbolParaElegir | undefined, plantacion: boolean): string {
  if (motivo === "confianza") return `No estoy seguro de haber leído bien (${porcentajeConfianza(lectura.confianza)}). ¿Es este árbol?`;
  if (motivo === "varios") return `${n} ${plantacion ? "árboles marcados" : "árboles del censo"} encajan con «${lectura.codigo}». ¿Cuál es?`;
  if (motivo === "letras") return `El número es de ${plantacion ? "un árbol marcado" : "un árbol del censo"}, pero las letras no coinciden. ¿Es este árbol?`;
  return arbol?.reparo ? `${arbol.reparo.titulo}. ${arbol.reparo.detalle} ¿Cargarlo igual?` : "¿Es este árbol?";
}

const etiqueta = (a: ArbolParaElegir) => `${a.treeCode} · ${a.speciesCommon}`;

/** Plantación: lo que la placa dice de la especie del registro (ningún árbol marcado coincide). */
export interface RegistroDePlaca {
  cruce: CrucePlacaRegistro<EspecieDelRegistro> | null;
  cargando: boolean;
  /** La especie que la línea tiene ahora. */
  especieElegida: string;
  onEspecie: (e: EspecieDelRegistro, codigo: string) => void;
}

interface Props {
  lectura: LecturaVista;
  cruce: CrucePlaca | null;
  /** Código del árbol que la línea tiene ahora. */
  elegido: string;
  onConfirmar: (a: ArbolParaElegir) => void;
  onEscribir: (codigo: string) => void;
  /** El plan es una plantación: el censo son sus «árboles marcados». */
  plantacion?: boolean;
  /** Plantación con especies en el registro. */
  registro?: RegistroDePlaca | null;
}

function tituloEspecie(motivo: MotivoConfirmarEspecie, lectura: LecturaVista, codigo: string, n: number): string {
  if (motivo === "confianza") return `No estoy seguro de haber leído bien (${porcentajeConfianza(lectura.confianza)}). ¿Es esta especie?`;
  if (motivo === "varias") return `Las letras de «${codigo}» sirven para ${n} especies del registro. ¿Cuál es?`;
  if (motivo === "sin_letras") return `«${codigo}» no es un árbol marcado. ¿De qué especie del registro es?`;
  return `Las letras de «${codigo}» no son de ninguna especie del registro. ¿De cuál es?`;
}

/** Ningún árbol marcado coincide: la especie del registro por la abreviatura, con el código de la placa. */
function CruceConRegistro({ r, lectura }: { r: RegistroDePlaca; lectura: LecturaVista }) {
  const c = r.cruce;
  if (!c) {
    return r.cargando ? (
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando en el registro…
      </p>
    ) : null;
  }
  if (c.tipo === "ilegible") return <p className="text-sm font-semibold text-[var(--text-secondary)]">No se ve un código en la foto: escríbelo.</p>;
  if (c.tipo === "especie") {
    return (
      <p className={`flex items-start gap-1.5 text-sm font-semibold ${OK}`} data-placa-registro={c.especie.especie}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          {c.especie.especie} del registro · código <span className="font-mono">{c.codigo}</span>
        </span>
      </p>
    );
  }
  const elegida = claveEspecie(r.especieElegida);
  return (
    <div className={`space-y-1.5 rounded-lg border px-2.5 py-2 text-sm ${AMBAR}`}>
      <p className="flex items-start gap-1.5 font-semibold">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">{tituloEspecie(c.motivo, lectura, c.codigo, c.candidatas.length)}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {c.candidatas.map((e) => {
          const es = elegida !== "" && claveEspecie(e.especie) === elegida;
          return (
            <button
              key={e.clave}
              type="button"
              aria-pressed={es}
              onClick={() => r.onEspecie(e, c.codigo)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-current bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent)]/10"
            >
              {es && <CheckCircle2 className={`h-4 w-4 ${OK}`} />}
              {e.especie}
              <span className="font-mono font-medium text-[var(--text-secondary)]">{c.codigo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LothPlacaCruce({ lectura, cruce, elegido, onConfirmar, onEscribir, plantacion = false, registro = null }: Props) {
  if (!cruce) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> {plantacion ? "Buscando…" : "Buscando en el censo…"}
      </p>
    );
  }

  const esElegido = (a: ArbolParaElegir) => a.treeCode === elegido;
  const leido = lectura.codigo;
  /* La persona tomó otro árbol de la lista después de la foto: la foto prueba
     OTRO código. Se dice, no se corrige solo. */
  const desacuerdo =
    Boolean(elegido.trim() && leido) &&
    claveDeCodigo(elegido) !== claveDeCodigo(leido) &&
    !(cruce.tipo === "elegido" && esElegido(cruce.arbol)) &&
    !(cruce.tipo === "confirmar" && cruce.candidatos.some(esElegido));

  return (
    <div className="space-y-1.5">
      {cruce.tipo === "elegido" && (
        <p className={`flex items-start gap-1.5 text-sm font-semibold ${OK}`}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            Árbol {etiqueta(cruce.arbol)}
            {cruce.como === "numero" && <span className="font-normal"> (la placa dice «{leido}»)</span>}
          </span>
        </p>
      )}

      {cruce.tipo === "confirmar" && (
        <div className={`space-y-1.5 rounded-lg border px-2.5 py-2 text-sm ${AMBAR}`}>
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">{tituloConfirmar(cruce.motivo, lectura, cruce.candidatos.length, cruce.candidatos[0], plantacion)}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cruce.candidatos.map((a) => {
              const puede = a.disponibilidad === "disponible";
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={!puede}
                  aria-pressed={esElegido(a)}
                  title={a.motivoNoDisponible ?? undefined}
                  onClick={() => onConfirmar(a)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-current bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent)]/10"
                >
                  {esElegido(a) && <CheckCircle2 className={`h-4 w-4 ${OK}`} />}
                  <span className="font-mono">{a.treeCode}</span>
                  <span className="font-medium text-[var(--text-secondary)]">{a.speciesCommon}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cruce.tipo === "no_disponible" && (
        <p className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${AMBAR}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            El árbol {etiqueta(cruce.arbol)} no se puede talar: {cruce.arbol.motivoNoDisponible ?? "no está en pie"}.
          </span>
        </p>
      )}

      {cruce.tipo === "sin_censo" &&
        (registro ? (
          <CruceConRegistro r={registro} lectura={lectura} />
        ) : (
          <p className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${AMBAR}`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              {plantacion
                ? `«${leido}» no es un árbol marcado de esta plantación. Corrige el código o elige en la lista.`
                : `«${leido}» no está en el censo de este plan. Corrige el código o elige el árbol en la lista.`}
            </span>
          </p>
        ))}

      {cruce.tipo === "ilegible" && (
        <p className="text-sm font-semibold text-[var(--text-secondary)]">No se ve un código en la foto: escríbelo.</p>
      )}

      {desacuerdo && (
        <p className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${AMBAR}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">La línea es del árbol {elegido} y la placa de la foto dice «{leido}».</span>
        </p>
      )}

      {/* `key`: cada lectura trae su código al campo (y se pliega cuando el registro lo resolvió). */}
      <CorregirCodigo
        key={`${lectura.vez}-${registro?.cruce?.tipo ?? ""}`}
        inicial={leido}
        abierto={cruce.tipo !== "elegido" && registro?.cruce?.tipo !== "especie"}
        onBuscar={onEscribir}
      />
    </div>
  );
}

/**
 * El código a mano: dentro del formulario de la línea NO puede ser un `<form>`
 * (Enter registraría la línea), así que Enter busca y se come el evento.
 */
export function CorregirCodigo({ inicial, abierto, onBuscar }: { inicial: string; abierto: boolean; onBuscar: (codigo: string) => void }) {
  const [texto, setTexto] = useState(inicial);
  const [visible, setVisible] = useState(abierto);
  if (!visible) {
    return (
      <button type="button" onClick={() => setVisible(true)} className="text-xs font-semibold text-[var(--text-secondary)] underline underline-offset-2">
        ¿No es? Corregir el código
      </button>
    );
  }
  const buscar = () => {
    if (texto.trim()) onBuscar(texto);
  };
  return (
    <div className="flex items-center gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          buscar();
        }}
        aria-label="Código de la placa"
        placeholder="Ej. 114"
        autoCapitalize="characters"
        className={`${cls.input} max-w-[14rem] font-mono`}
      />
      <button
        type="button"
        onClick={buscar}
        disabled={!texto.trim()}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Search className="h-4 w-4" /> Buscar
      </button>
    </div>
  );
}
