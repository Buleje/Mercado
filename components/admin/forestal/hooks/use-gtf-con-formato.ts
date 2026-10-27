"use client";

/**
 * «Con formato» (27-10): imprimir o bajar en PDF la guía y su lista de trozas
 * en hoja blanca, con el formato entero y cada valor en su renglón
 * (`gtf-formato-completo`). Lo usan el modal del talonario (con sus datos ya
 * cargados) y el menú ⋯ de cada guía (los pide al elegir: el titular y la
 * fecha del talonario y, si la guía no trae su ficha, la carátula).
 * La tinta (celeste o negro) se recuerda en el navegador.
 */

import { useCallback, useState } from "react";
import { Check, Download, FileText, Palette } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { hojasConFormato, htmlFormatoCompleto, type OpcionesConFormato } from "@/lib/forestal/gtf-formato-completo";
import { imprimirEnMarco } from "@/lib/forestal/gtf-matricial-print";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { descargarBlob } from "@/lib/forestal/gtf-cola-monte-imprimir";
import { ESTILO_CON_FORMATO, type TintaFormato } from "@/lib/forestal/gtf-talonario-plantilla-svg";
import type { EntradasGuiaLoth } from "@/lib/forestal/loth-guia-print";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { DisposicionTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import type { Gtf } from "../gtf-tabla-columnas";
import { RUTA_TALONARIO } from "./use-gtf-matricial-formas";

export interface DatosConFormato extends Omit<OpcionesConFormato, "tinta"> {
  entradas: EntradasGuiaLoth;
}

type Ocupado = "imprimir" | "pdf" | null;

/** Para una guía de la tabla: lo mismo que arma el modal, pedido al servidor en paralelo. */
async function leerDatos(g: Gtf): Promise<DatosConFormato> {
  const [talonario, caratula] = await Promise.all([
    fetch(`${RUTA_TALONARIO}?${new URLSearchParams({ gtf: g.id }).toString()}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ titular?: { nombre: string } | null; disposicion?: DisposicionTalonario }>) : null)),
    g.gtfDatos
      ? Promise.resolve(null)
      : fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
          .then((r) => (r.ok ? (r.json() as Promise<{ active?: LothGtfCaratula | null }>) : null))
          .then((j) => j?.active ?? null),
  ]);
  return {
    entradas: entradasDeLaGuia(g as unknown as LothGtfDoc, caratula),
    titular: talonario?.titular?.nombre ?? null,
    separador: { guia: talonario?.disposicion?.guia.separadorFecha, lista: talonario?.disposicion?.lista.separadorFecha },
  };
}

export function useGtfConFormato(g: Gtf, datos: DatosConFormato | null = null) {
  const [tinta, setTinta] = useLocalStorage<TintaFormato>("forestal:gtf-con-formato:tinta", "celeste");
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [error, setError] = useState<string | null>(null);
  const titulo = `GTF ${g.gtfNumber} · con formato`;

  const correr = useCallback(
    async (cual: Exclude<Ocupado, null>, hacer: (d: DatosConFormato) => Promise<void> | void) => {
      setOcupado(cual);
      setError(null);
      try {
        await hacer(datos ?? (await leerDatos(g)));
      } catch (err) {
        console.warn("[gtf-con-formato] no salió", err);
        setError(cual === "pdf" ? "No se pudo armar el PDF con formato. Prueba de nuevo." : "No se pudo imprimir con formato. Prueba de nuevo.");
      } finally {
        setOcupado(null);
      }
    },
    [datos, g],
  );

  const imprimir = useCallback(
    (cuales: FormatoTalonario[]) => correr("imprimir", (d) => imprimirEnMarco(htmlFormatoCompleto(cuales, d.entradas, titulo, { ...d, tinta }))),
    [correr, tinta, titulo],
  );

  const bajarPdf = useCallback(
    (cuales: FormatoTalonario[]) =>
      correr("pdf", async (d) => {
        /* pdf-lib sólo se carga al bajarlo: no pesa en el panel. */
        const { pdfConFormato } = await import("@/lib/forestal/gtf-formato-completo-pdf");
        const bytes = await pdfConFormato(hojasConFormato(cuales, d.entradas, d), titulo, ESTILO_CON_FORMATO[tinta]);
        descargarBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `GTF-${g.gtfNumber}-con-formato.pdf`);
      }),
    [correr, g.gtfNumber, tinta, titulo],
  );

  return { tinta, setTinta, ocupado, error, imprimir, bajarPdf };
}

export type EstadoConFormato = ReturnType<typeof useGtfConFormato>;

const TINTAS: ReadonlyArray<{ id: TintaFormato; label: string; hint: string }> = [
  { id: "celeste", label: "Tinta celeste", hint: "Como la imprenta: franjas celestes y el N° en rojo" },
  { id: "negro", label: "Tinta negra", hint: "Para impresora en blanco y negro y fotocopias" },
];

/** Las opciones del botón «Con formato» del modal: imprimir, bajar en PDF y la tinta. */
export function accionesConFormato(c: EstadoConFormato): MenuAccion[] {
  return [
    { id: "ambas", seccion: "Imprimir", label: "Guía y lista de trozas", hint: "En hoja blanca: el formato entero y cada valor en su renglón", icon: FileText, busy: c.ocupado === "imprimir", onSelect: () => void c.imprimir(["guia", "lista"]) },
    { id: "guia", seccion: "Imprimir", label: "Sólo la guía", hint: "La GTF con todos sus rótulos y valores", icon: FileText, onSelect: () => void c.imprimir(["guia"]) },
    { id: "lista", seccion: "Imprimir", label: "Sólo la lista de trozas", hint: "Todas sus hojas, con el formato", icon: FileText, onSelect: () => void c.imprimir(["lista"]) },
    { id: "pdf", seccion: "Bajar", label: "PDF de la guía y su lista", hint: "Un archivo para mandar por WhatsApp o correo", icon: Download, busy: c.ocupado === "pdf", onSelect: () => void c.bajarPdf(["guia", "lista"]) },
    ...TINTAS.map((t): MenuAccion => ({ id: `tinta-${t.id}`, seccion: "Tinta", label: t.label, hint: t.hint, icon: c.tinta === t.id ? Check : Palette, activo: c.tinta === t.id, onSelect: () => c.setTinta(t.id) })),
  ];
}
