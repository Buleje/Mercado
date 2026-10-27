"use client";

/**
 * «Con formato» (27-10): imprimir o bajar en PDF la guía y su lista de trozas
 * en hoja blanca, con el formato entero y cada valor en su renglón
 * (`gtf-formato-completo`). Lo usan el modal del talonario (con sus datos ya
 * cargados), el menú ⋯ de cada guía y la barra de las guías tildadas (los
 * piden al elegir: el titular y la fecha del talonario y, si la guía no trae
 * su ficha, la carátula). La tinta, la marca «COPIA» y el emisor se recuerdan
 * en el navegador y valen para los tres.
 */

import { useCallback, useState } from "react";
import { Check, Download, FileText, Palette, Stamp, UserCheck } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { DisposicionTalonario, FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { MARCA_COPIA, emisorDeLaGuia, hojasConFormato, htmlFormatoCompleto, type OpcionesConFormato } from "@/lib/forestal/gtf-formato-completo";
import { imprimirEnMarco, type HojaConFormato } from "@/lib/forestal/gtf-matricial-print";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { descargarBlob } from "@/lib/forestal/gtf-cola-monte-imprimir";
import { ESTILO_CON_FORMATO, type TintaFormato } from "@/lib/forestal/gtf-talonario-plantilla-svg";
import type { EntradasGuiaLoth } from "@/lib/forestal/loth-guia-print";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { Gtf } from "../gtf-tabla-columnas";
import { RUTA_TALONARIO } from "./use-gtf-matricial-formas";

export interface DatosConFormato extends Pick<OpcionesConFormato, "titular" | "separador"> {
  entradas: EntradasGuiaLoth;
}

type Ocupado = "imprimir" | "pdf" | null;

const CLAVE = "forestal:gtf-con-formato:";

/** Tinta, marca y emisor: los mismos en el modal, el menú de la guía y la barra (`useLocalStorage` avisa a las otras instancias). */
function usePreferencias() {
  const [tinta, setTinta] = useLocalStorage<TintaFormato>(`${CLAVE}tinta`, "celeste");
  const [copia, setCopia] = useLocalStorage<boolean>(`${CLAVE}copia`, true);
  const [emisor, setEmisor] = useLocalStorage<boolean>(`${CLAVE}emisor`, true);
  return { tinta, setTinta, copia, setCopia, emisor, setEmisor };
}

/** El PDF de unas hojas, con lo elegido (pdf-lib se carga recién acá: no pesa en el panel). */
async function bajarPdf(hojas: HojaConFormato[], titulo: string, nombre: string, p: { tinta: TintaFormato; copia: boolean }): Promise<void> {
  const { pdfConFormato } = await import("@/lib/forestal/gtf-formato-completo-pdf");
  const bytes = await pdfConFormato(hojas, titulo, ESTILO_CON_FORMATO[p.tinta], p.copia ? MARCA_COPIA : null);
  descargarBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), nombre);
}

/** La carátula del libro, una sola vez por pedido (la usan las guías sin ficha de SERFOR). */
const leerCaratula = (): Promise<LothGtfCaratula | null> =>
  fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
    .then((r) => (r.ok ? (r.json() as Promise<{ active?: LothGtfCaratula | null }>) : null))
    .then((j) => j?.active ?? null);

/** Para una guía de la tabla: lo mismo que arma el modal (titular y fecha de su talonario), pedido al servidor. */
async function leerDatos(g: Gtf, caratula: () => Promise<LothGtfCaratula | null>): Promise<DatosConFormato> {
  const [talonario, car] = await Promise.all([
    fetch(`${RUTA_TALONARIO}?${new URLSearchParams({ gtf: g.id }).toString()}`, { credentials: "include" }).then((r) =>
      r.ok ? (r.json() as Promise<{ titular?: { nombre: string } | null; disposicion?: DisposicionTalonario }>) : null,
    ),
    g.gtfDatos ? Promise.resolve(null) : caratula(),
  ]);
  return {
    entradas: entradasDeLaGuia(g as unknown as LothGtfDoc, car),
    titular: talonario?.titular?.nombre ?? null,
    separador: { guia: talonario?.disposicion?.guia.separadorFecha, lista: talonario?.disposicion?.lista.separadorFecha },
  };
}

/** Una carátula compartida por todas las guías de un mismo pedido. */
function caratulaUnaVez(): () => Promise<LothGtfCaratula | null> {
  let p: Promise<LothGtfCaratula | null> | null = null;
  return () => (p ??= leerCaratula());
}

export function useGtfConFormato(g: Gtf, datos: DatosConFormato | null = null) {
  const pref = usePreferencias();
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [error, setError] = useState<string | null>(null);
  const titulo = `GTF ${g.gtfNumber} · con formato`;

  const correr = useCallback(
    async (cual: Exclude<Ocupado, null>, hacer: (d: DatosConFormato) => Promise<void> | void) => {
      setOcupado(cual);
      setError(null);
      try {
        await hacer(datos ?? (await leerDatos(g, caratulaUnaVez())));
      } catch (err) {
        console.warn("[gtf-con-formato] no salió", err);
        setError(cual === "pdf" ? "No se pudo armar el PDF con formato. Prueba de nuevo." : "No se pudo imprimir con formato. Prueba de nuevo.");
      } finally {
        setOcupado(null);
      }
    },
    [datos, g],
  );

  const { tinta, copia, emisor } = pref;
  const imprimir = useCallback(
    (cuales: FormatoTalonario[]) => correr("imprimir", (d) => imprimirEnMarco(htmlFormatoCompleto(cuales, d.entradas, titulo, { ...d, tinta, copia, emisor }))),
    [correr, tinta, copia, emisor, titulo],
  );

  const pdf = useCallback(
    (cuales: FormatoTalonario[]) =>
      correr("pdf", (d) => bajarPdf(hojasConFormato(cuales, d.entradas, { ...d, emisor }), titulo, `GTF-${g.gtfNumber}-con-formato.pdf`, { tinta, copia })),
    [correr, g.gtfNumber, tinta, copia, emisor, titulo],
  );

  /** Quién firmaría (para decirlo en el menú): con los datos del modal; en la tabla, se sabe al imprimir. */
  const firmante = datos ? emisorDeLaGuia(datos.entradas) : null;
  return { ...pref, ocupado, error, imprimir, bajarPdf: pdf, firmante };
}

export type EstadoConFormato = ReturnType<typeof useGtfConFormato>;

/** De a cuántas guías se piden los datos a la vez (cada una son 1-2 pedidos). */
const TANDA = 4;

/** Varias guías en UN PDF (la barra de las tildadas): cada una con su lista, en orden; las anuladas no salen. */
export function useGtfConFormatoVarias(guias: readonly Gtf[]) {
  const { tinta, copia, emisor } = usePreferencias();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vivas = guias.filter((g) => g.status !== "anulada" && !g.deletedAt);

  const bajar = useCallback(async () => {
    if (vivas.length === 0) return;
    setOcupado(true);
    setError(null);
    try {
      const caratula = caratulaUnaVez();
      const hojas: HojaConFormato[] = [];
      for (let i = 0; i < vivas.length; i += TANDA) {
        const datos = await Promise.all(vivas.slice(i, i + TANDA).map((g) => leerDatos(g, caratula)));
        for (const d of datos) hojas.push(...hojasConFormato(["guia", "lista"], d.entradas, { ...d, emisor }));
      }
      const n = vivas.length;
      await bajarPdf(hojas, `${n} GTF con formato`, n === 1 ? `GTF-${vivas[0].gtfNumber}-con-formato.pdf` : `GTF-con-formato-${n}-guias.pdf`, { tinta, copia });
    } catch (err) {
      console.warn("[gtf-con-formato] no salió el PDF de varias", err);
      setError("No se pudo armar el PDF de las guías elegidas. Prueba de nuevo.");
    } finally {
      setOcupado(false);
    }
  }, [vivas, tinta, copia, emisor]);

  return { vivas: vivas.length, anuladas: guias.length - vivas.length, ocupado, error, bajar };
}

const TINTAS: ReadonlyArray<{ id: TintaFormato; label: string; hint: string }> = [
  { id: "celeste", label: "Tinta celeste", hint: "Como la imprenta: franjas celestes y el N° en rojo" },
  { id: "negro", label: "Tinta negra", hint: "Para impresora en blanco y negro y fotocopias" },
];

/** Las opciones del botón «Con formato» del modal: imprimir, bajar en PDF, la tinta y lo que lleva la hoja. */
export function accionesConFormato(c: EstadoConFormato): MenuAccion[] {
  const firmante = c.firmante ? `${c.firmante.nombre}${c.firmante.documento ? ` · ${c.firmante.documento}` : ""}` : "La guía no trae Rep. Legal: se escribe a mano";
  return [
    { id: "ambas", seccion: "Imprimir", label: "Guía y lista de trozas", hint: "En hoja blanca: el formato entero y cada valor en su renglón", icon: FileText, busy: c.ocupado === "imprimir", onSelect: () => void c.imprimir(["guia", "lista"]) },
    { id: "guia", seccion: "Imprimir", label: "Sólo la guía", hint: "La GTF con todos sus rótulos y valores", icon: FileText, onSelect: () => void c.imprimir(["guia"]) },
    { id: "lista", seccion: "Imprimir", label: "Sólo la lista de trozas", hint: "Todas sus hojas, con el formato", icon: FileText, onSelect: () => void c.imprimir(["lista"]) },
    { id: "pdf", seccion: "Bajar", label: "PDF de la guía y su lista", hint: "Un archivo para mandar por WhatsApp o correo", icon: Download, busy: c.ocupado === "pdf", onSelect: () => void c.bajarPdf(["guia", "lista"]) },
    ...TINTAS.map((t): MenuAccion => ({ id: `tinta-${t.id}`, seccion: "Tinta", label: t.label, hint: t.hint, icon: c.tinta === t.id ? Check : Palette, activo: c.tinta === t.id, onSelect: () => c.setTinta(t.id) })),
    { id: "copia", seccion: "En la hoja", label: "Marca «COPIA»", hint: "Cruzada y con su pie: no pasa por la guía del talonario", icon: Stamp, activo: c.copia, onSelect: () => c.setCopia(!c.copia) },
    { id: "emisor", seccion: "En la hoja", label: "Nombre y DNI del emisor", hint: firmante, icon: UserCheck, activo: c.emisor, disabled: !c.firmante, onSelect: () => c.setEmisor(!c.emisor) },
  ];
}
