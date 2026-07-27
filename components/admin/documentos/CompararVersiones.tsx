"use client";

/**
 * CompararVersiones — qué cambió entre dos versiones, sin bajar ninguna.
 *
 * El historial mostraba tamaño y fecha: para saber si en la v4 subieron el
 * precio del arroz había que descargar la v3, descargar la v4 y abrirlas al
 * lado en Excel. Acá se leen las dos versiones en el navegador (los mismos
 * lectores de la vista previa) y se listan las diferencias: celda por celda en
 * una planilla, párrafo por párrafo en un documento.
 *
 * Sólo lectura y sólo en el cliente: comparar no toca el archivo ni crea
 * versiones nuevas.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Minus, Plus } from "@buleje/design-system/icons";
import { descargarArchivo, descargarTexto } from "@/lib/documentos/archivo-remoto";
import { esHojaLegible, formatoDe } from "@/lib/documentos/hoja-calculo";
import { esTextoLegible, formatoTextoDe } from "@/lib/documentos/texto-docx";
import { esOds, esOdt } from "@/lib/documentos/odf";
import { hojaDesdeCsv, hojasDesdeDatos } from "@/lib/documentos/hoja-lectura";
import type { HojaFormato } from "@/lib/documentos/xlsx-formato";
import {
  compararLibros, compararTextos, resumenTexto,
  type DiffLibro, type LineaDiff,
} from "@/lib/documentos/comparar";
import AvisoArchivo from "./AvisoArchivo";

/** Cuántas líneas de un documento de texto se listan (las iguales se saltean). */
const MAX_LINEAS = 300;

type Datos =
  | { tipo: "hoja"; diff: DiffLibro }
  | { tipo: "texto"; lineas: LineaDiff[] }
  | { tipo: "otro" };

/** Lee una versión (o el archivo actual) como libro de planilla. */
async function leerLibro(url: string, mimeType: string | null, nombre: string): Promise<HojaFormato[]> {
  if (esOds(mimeType, nombre)) {
    const [{ default: JSZip }, { leerOds }] = await Promise.all([import("jszip"), import("@/lib/documentos/odf")]);
    return hojasDesdeDatos(await leerOds(await JSZip.loadAsync(await descargarArchivo(url))));
  }
  if (formatoDe(mimeType, nombre) === "csv") return [hojaDesdeCsv(await descargarTexto(url), "Hoja 1")];
  const [{ leerXlsxConFormato }, datos] = await Promise.all([
    import("@/lib/documentos/xlsx-formato"),
    descargarArchivo(url),
  ]);
  return leerXlsxConFormato(datos);
}

/** Lee una versión como lista de párrafos. */
async function leerParrafos(url: string, mimeType: string | null, nombre: string): Promise<string[]> {
  if (esOdt(mimeType, nombre)) {
    const [{ default: JSZip }, { leerOdt }] = await Promise.all([import("jszip"), import("@/lib/documentos/odf")]);
    const doc = await leerOdt(await JSZip.loadAsync(await descargarArchivo(url)));
    return doc.bloques.map((b) => b.texto);
  }
  if (formatoTextoDe(mimeType, nombre) === "plano") {
    const { leerPlano } = await import("@/lib/documentos/texto-docx");
    return leerPlano(await descargarTexto(url)).bloques.map((b) => b.texto);
  }
  const [{ leerDocx }, datos] = await Promise.all([
    import("@/lib/documentos/texto-docx"),
    descargarArchivo(url),
  ]);
  return (await leerDocx(datos)).bloques.map((b) => b.texto);
}

export default function CompararVersiones({
  urlAntes, urlDespues, etiquetaAntes, etiquetaDespues, mimeType, nombre,
}: {
  urlAntes: string;
  urlDespues: string;
  /** "v2", "v3", "Actual"… */
  etiquetaAntes: string;
  etiquetaDespues: string;
  mimeType: string | null;
  nombre: string;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    (async () => {
      try {
        if (esHojaLegible(mimeType, nombre)) {
          const [a, b] = await Promise.all([
            leerLibro(urlAntes, mimeType, nombre),
            leerLibro(urlDespues, mimeType, nombre),
          ]);
          if (vivo) setDatos({ tipo: "hoja", diff: compararLibros(a, b) });
          return;
        }
        if (esTextoLegible(mimeType, nombre)) {
          const [a, b] = await Promise.all([
            leerParrafos(urlAntes, mimeType, nombre),
            leerParrafos(urlDespues, mimeType, nombre),
          ]);
          if (vivo) setDatos({ tipo: "texto", lineas: compararTextos(a, b) });
          return;
        }
        if (vivo) setDatos({ tipo: "otro" });
      } catch (e) {
        if (vivo) setError(e);
      }
    })();
    return () => { vivo = false; };
  }, [urlAntes, urlDespues, mimeType, nombre, intento]);

  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudieron comparar las versiones"
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  if (!datos) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo las dos versiones…
      </p>
    );
  }

  if (datos.tipo === "otro") {
    return (
      <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">
        Este tipo de archivo no se puede comparar por dentro. Abrí cada versión para verla.
      </p>
    );
  }

  const cabecera = (
    <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
      {etiquetaAntes} <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> {etiquetaDespues}
    </p>
  );

  if (datos.tipo === "hoja") {
    const { diff } = datos;
    if (diff.total === 0) {
      return <div>{cabecera}<p className="py-4 text-center text-sm text-[var(--text-secondary)]">Las dos versiones tienen el mismo contenido.</p></div>;
    }
    return (
      <div>
        {cabecera}
        <div className="space-y-3">
          {diff.hojas.filter((h) => h.estado !== "igual").map((h) => (
            <div key={h.nombre} className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
              <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                {h.nombre}
                {h.estado === "agregada" && <Etiqueta tono="mas">hoja nueva</Etiqueta>}
                {h.estado === "quitada" && <Etiqueta tono="menos">ya no está</Etiqueta>}
                {h.filasAgregadas > 0 && <Etiqueta tono="mas">+{h.filasAgregadas} filas</Etiqueta>}
                {h.filasQuitadas > 0 && <Etiqueta tono="menos">−{h.filasQuitadas} filas</Etiqueta>}
                {h.cambios.length > 0 && <span className="text-[var(--text-tertiary)]">{h.cambios.length} celdas</span>}
              </p>
              {h.cambios.length > 0 && (
                <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                  {h.cambios.map((c) => (
                    <li key={c.ref} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs odd:bg-[var(--surface-sunken)]">
                      <span className="w-14 shrink-0 font-mono font-bold text-[var(--text-tertiary)]">{c.ref}</span>
                      <span className="min-w-0 flex-1 truncate text-[var(--data-error-700)] line-through dark:text-[var(--data-error-500)]">{c.antes || "(vacía)"}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />
                      <span className="min-w-0 flex-1 truncate font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{c.despues || "(vacía)"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {h.recortados > 0 && (
                <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">y {h.recortados} cambios más.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const resumen = resumenTexto(datos.lineas);
  const cambiadas = datos.lineas.filter((l) => l.tipo !== "igual").slice(0, MAX_LINEAS);
  return (
    <div>
      {cabecera}
      <p className="mb-2 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"><Plus className="h-3 w-3" />{resumen.agregadas}</span>
        <span className="inline-flex items-center gap-1 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"><Minus className="h-3 w-3" />{resumen.quitadas}</span>
        <span className="text-[var(--text-tertiary)]">{resumen.iguales} párrafos sin tocar</span>
      </p>
      {cambiadas.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--text-secondary)]">Las dos versiones dicen lo mismo.</p>
      ) : (
        <ul className="max-h-72 space-y-0.5 overflow-y-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
          {cambiadas.map((l, i) => (
            <li
              key={`${l.tipo}-${i}`}
              className={`flex gap-2 rounded-lg px-2 py-1 text-xs ${
                l.tipo === "agregada"
                  ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              }`}
            >
              <span className="shrink-0 font-mono font-bold">{l.tipo === "agregada" ? "+" : "−"}</span>
              <span className="min-w-0 flex-1 break-words">{l.texto || "(párrafo vacío)"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Etiqueta({ tono, children }: { tono: "mas" | "menos"; children: React.ReactNode }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${
      tono === "mas"
        ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        : "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
    }`}>
      {children}
    </span>
  );
}
