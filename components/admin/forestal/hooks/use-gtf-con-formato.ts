"use client";

/**
 * «Con formato» (27-10): imprimir o bajar en PDF la guía y su lista de trozas
 * en hoja blanca, con el formato entero y cada valor en su renglón
 * (`gtf-formato-completo`). Lo usan el modal del talonario (con sus datos ya
 * cargados), el menú ⋯ de cada guía y la barra de las guías tildadas (los
 * piden al elegir: el titular y la fecha del talonario y, si la guía no trae
 * su ficha, la carátula). La tinta, la marca «COPIA» y el emisor se recuerdan
 * en el navegador y valen para los tres.
 *
 * La guía puede ser del Libro TH (`fuenteLoth`) o la de SALIDA de un despacho
 * del Libro CTP (`fuenteSalida`, 27-10): ésa trae sus valores del servidor y,
 * si es madera aserrada, sale sin lista de trozas (`conLista: false`).
 */

import { useCallback, useState } from "react";
import { Check, Download, FileText, Palette, Printer, Stamp, UserCheck } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { DisposicionTalonario, FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import { MARCA_COPIA, emisorDeLaGuia, hojasConFormato, htmlFormatoCompleto, type OpcionesConFormato } from "@/lib/forestal/gtf-formato-completo";
import { htmlConFormato, imprimirEnMarco, type HojaConFormato } from "@/lib/forestal/gtf-matricial-print";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { descargarBlob } from "@/lib/forestal/gtf-cola-monte-imprimir";
import { ESTILO_CON_FORMATO, type TintaFormato } from "@/lib/forestal/gtf-talonario-plantilla-svg";
import type { EntradasGuiaLoth } from "@/lib/forestal/loth-guia-print";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { faltanParaImprimir } from "@/lib/forestal/guia-salida-imprimible";
import type { Gtf } from "../gtf-tabla-columnas";
import { AvisoGuiaSalida, leerGuiaSalida } from "./use-guia-salida";
import { RUTA_TALONARIO } from "./use-gtf-matricial-formas";

export interface DatosConFormato extends Pick<OpcionesConFormato, "titular" | "separador"> {
  entradas: EntradasGuiaLoth;
  /** `false` = madera aserrada: sale la guía sola (no hay trozas para la lista). */
  conLista?: boolean;
}

type LeerCaratula = () => Promise<LothGtfCaratula | null>;

/** De qué guía se imprime con formato. Sin `leer`, van los `datos` que pasa el modal del talonario. */
export interface GuiaConFormato {
  numero: string;
  /** Si se sabe antes de leer: `false` esconde las opciones de la lista. */
  conLista?: boolean;
  leer?: (caratula: LeerCaratula) => Promise<DatosConFormato>;
}

/** Una guía que se lee al elegir (el menú de la tabla y la barra de las tildadas). */
export interface FuenteConFormato extends GuiaConFormato {
  anulada: boolean;
  leer: (caratula: LeerCaratula) => Promise<DatosConFormato>;
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

/** El titular y la fecha que guardó el talonario de esa guía (`?gtf=` o `?despacho=`). */
const leerTalonario = (q: Record<string, string>) =>
  fetch(`${RUTA_TALONARIO}?${new URLSearchParams(q).toString()}`, { credentials: "include" }).then((r) =>
    r.ok ? (r.json() as Promise<{ titular?: { nombre: string } | null; disposicion?: DisposicionTalonario }>) : null,
  );

const separadorDe = (d: DisposicionTalonario | undefined): DatosConFormato["separador"] => ({ guia: d?.guia.separadorFecha, lista: d?.lista.separadorFecha });

/** Para una guía de la tabla: lo mismo que arma el modal (titular y fecha de su talonario), pedido al servidor. */
async function leerDatos(g: Gtf, caratula: LeerCaratula): Promise<DatosConFormato> {
  const [talonario, car] = await Promise.all([leerTalonario({ gtf: g.id }), g.gtfDatos ? Promise.resolve(null) : caratula()]);
  return {
    entradas: entradasDeLaGuia(g as unknown as LothGtfDoc, car),
    titular: talonario?.titular?.nombre ?? null,
    separador: separadorDe(talonario?.disposicion),
  };
}

/** Una carátula compartida por todas las guías de un mismo pedido. */
function caratulaUnaVez(): LeerCaratula {
  let p: Promise<LothGtfCaratula | null> | null = null;
  return () => (p ??= leerCaratula());
}

/** Una guía del Libro TH. Memoízala donde se use (`useMemo`): es la dependencia de las acciones. */
export const fuenteLoth = (g: Gtf): FuenteConFormato => ({
  numero: g.gtfNumber,
  anulada: g.status === "anulada" || Boolean(g.deletedAt),
  conLista: true,
  leer: (caratula) => leerDatos(g, caratula),
});

/**
 * La guía de SALIDA de un despacho del Libro CTP: los valores los arma el
 * servidor (los de la hoja SERFOR); el titular y la fecha, los de su talonario.
 * Con trozas que salen sin aserrar va con su lista; aserrada, la guía sola.
 */
export const fuenteSalida = (despachoId: string, numero: string, anulada = false): FuenteConFormato => ({
  numero,
  anulada,
  leer: async () => {
    const [{ guia, entradas }, talonario] = await Promise.all([leerGuiaSalida(despachoId), leerTalonario({ despacho: despachoId })]);
    /* El original no sale a medias, tampoco en hoja blanca (lo mismo que la hoja SERFOR). */
    const faltan = faltanParaImprimir(guia);
    if (faltan) throw new AvisoGuiaSalida(`GTF ${numero}: ${faltan}`);
    return {
      entradas,
      titular: talonario?.titular?.nombre ?? (guia.titular || null),
      separador: separadorDe(talonario?.disposicion),
      conLista: guia.trozas.length > 0,
    };
  },
});

/** Las hojas que se piden menos la lista si la guía no la lleva. */
const conSuLista = (cuales: FormatoTalonario[], d: DatosConFormato): FormatoTalonario[] =>
  d.conLista === false ? cuales.filter((c) => c !== "lista") : cuales;

/** La madera aserrada no lleva lista: pedir SÓLO la lista es un error que se dice, no una hoja en blanco. */
const SIN_LISTA = "Esta guía no lleva lista de trozas: es madera aserrada.";

export function useGtfConFormato(fuente: GuiaConFormato, datos: DatosConFormato | null = null) {
  const pref = usePreferencias();
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [error, setError] = useState<string | null>(null);
  const titulo = `GTF ${fuente.numero} · con formato`;

  const correr = useCallback(
    async (cual: Exclude<Ocupado, null>, cuales: FormatoTalonario[], hacer: (d: DatosConFormato, cuales: FormatoTalonario[]) => Promise<void> | void) => {
      setOcupado(cual);
      setError(null);
      try {
        const d = datos ?? (fuente.leer ? await fuente.leer(caratulaUnaVez()) : null);
        if (!d) throw new Error("[gtf-con-formato] sin datos ni cómo leerlos");
        const hojas = conSuLista(cuales, d);
        if (hojas.length === 0) {
          setError(SIN_LISTA);
          return;
        }
        await hacer(d, hojas);
      } catch (err) {
        console.warn("[gtf-con-formato] no salió", err);
        /* El aviso del servidor (la guía no está emitida) se dice tal cual; lo demás, el genérico. */
        if (err instanceof AvisoGuiaSalida) setError(err.message);
        else setError(cual === "pdf" ? "No se pudo armar el PDF con formato. Prueba de nuevo." : "No se pudo imprimir con formato. Prueba de nuevo.");
      } finally {
        setOcupado(null);
      }
    },
    [datos, fuente],
  );

  const { tinta, copia, emisor } = pref;
  const imprimir = useCallback(
    (cuales: FormatoTalonario[]) =>
      correr("imprimir", cuales, (d, hojas) => imprimirEnMarco(htmlFormatoCompleto(hojas, d.entradas, titulo, { ...d, tinta, copia, emisor }))),
    [correr, tinta, copia, emisor, titulo],
  );

  const pdf = useCallback(
    (cuales: FormatoTalonario[]) =>
      correr("pdf", cuales, (d, hojas) => bajarPdf(hojasConFormato(hojas, d.entradas, { ...d, emisor }), titulo, `GTF-${fuente.numero}-con-formato.pdf`, { tinta, copia })),
    [correr, fuente.numero, tinta, copia, emisor, titulo],
  );

  /** Quién firmaría (para decirlo en el menú): con los datos del modal; en la tabla, se sabe al imprimir. */
  const firmante = datos ? emisorDeLaGuia(datos.entradas) : null;
  /** Lleva lista de trozas (si todavía no se sabe, se ofrece: al leer, la aserrada sale sin ella). */
  const conLista = (datos?.conLista ?? fuente.conLista) !== false;
  return { ...pref, ocupado, error, imprimir, bajarPdf: pdf, firmante, conLista };
}

export type EstadoConFormato = ReturnType<typeof useGtfConFormato>;

/** De a cuántas guías se piden los datos a la vez (cada una son 1-2 pedidos). */
const TANDA = 4;

/** Varias guías en UN PDF o en una sola impresión (la barra de las tildadas): cada una con su lista (si la lleva), en orden; las anuladas no salen. */
export function useGtfConFormatoVarias(guias: readonly FuenteConFormato[]) {
  const { tinta, copia, emisor } = usePreferencias();
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [error, setError] = useState<string | null>(null);
  const vivas = guias.filter((g) => !g.anulada);

  const correr = useCallback(
    async (cual: Exclude<Ocupado, null>) => {
      if (vivas.length === 0) return;
      setOcupado(cual);
      setError(null);
      try {
        const caratula = caratulaUnaVez();
        const hojas: HojaConFormato[] = [];
        for (let i = 0; i < vivas.length; i += TANDA) {
          const datos = await Promise.all(vivas.slice(i, i + TANDA).map((g) => g.leer(caratula)));
          for (const d of datos) hojas.push(...hojasConFormato(conSuLista(["guia", "lista"], d), d.entradas, { ...d, emisor }));
        }
        const n = vivas.length;
        const titulo = `${n} GTF con formato`;
        if (cual === "imprimir") imprimirEnMarco(htmlConFormato(hojas, titulo, ESTILO_CON_FORMATO[tinta], copia ? MARCA_COPIA : null));
        else await bajarPdf(hojas, titulo, n === 1 ? `GTF-${vivas[0].numero}-con-formato.pdf` : `GTF-con-formato-${n}-guias.pdf`, { tinta, copia });
      } catch (err) {
        console.warn("[gtf-con-formato] no salieron las guías elegidas", err);
        setError(
          err instanceof AvisoGuiaSalida
            ? `GTF elegidas: ${err.message}`
            : cual === "pdf"
              ? "No se pudo armar el PDF de las guías elegidas. Prueba de nuevo."
              : "No se pudieron imprimir las guías elegidas. Prueba de nuevo.",
        );
      } finally {
        setOcupado(null);
      }
    },
    [vivas, tinta, copia, emisor],
  );

  const bajar = useCallback(() => correr("pdf"), [correr]);
  const imprimir = useCallback(() => correr("imprimir"), [correr]);
  return { vivas: vivas.length, anuladas: guias.length - vivas.length, ocupado: ocupado !== null, cual: ocupado, error, bajar, imprimir };
}

/** «Imprimir con formato» y «Bajar en PDF» de las guías tildadas (barra del Libro TH y de Guías emitidas del CTP). */
/** Las opciones del botón «Con formato» de la barra de las tildadas: UN botón, para que a 400 px la barra no ocupe tres filas. */
export function accionesConFormatoVarias(v: ReturnType<typeof useGtfConFormatoVarias>): MenuAccion[] {
  const apagada = v.ocupado || v.vivas === 0;
  const sinVivas = v.vivas === 0 ? "Las anuladas no salen con formato: tilda una vigente" : null;
  return [
    { id: "imprimir", label: "Imprimir con formato", hint: sinVivas ?? "Cada guía entera en hoja blanca, con su lista de trozas si la lleva", icon: Printer, busy: v.cual === "imprimir", disabled: apagada, onSelect: () => void v.imprimir() },
    { id: "pdf", label: "Bajar en PDF", hint: sinVivas ?? "Todas las tildadas en un solo PDF", icon: Download, busy: v.cual === "pdf", disabled: apagada, onSelect: () => void v.bajar() },
  ];
}

const TINTAS: ReadonlyArray<{ id: TintaFormato; label: string; hint: string }> = [
  { id: "celeste", label: "Tinta celeste", hint: "Como la imprenta: franjas celestes y el N° en rojo" },
  { id: "negro", label: "Tinta negra", hint: "Para impresora en blanco y negro y fotocopias" },
];

/** Las opciones del botón «Con formato» del modal: imprimir, bajar en PDF, la tinta y lo que lleva la hoja. */
export function accionesConFormato(c: EstadoConFormato): MenuAccion[] {
  const firmante = c.firmante ? `${c.firmante.nombre}${c.firmante.documento ? ` · ${c.firmante.documento}` : ""}` : "La guía no trae Rep. Legal: se escribe a mano";
  /* Madera aserrada (guía de salida sin trozas): la guía sola, sin opciones de lista. */
  const imprimir: MenuAccion[] = c.conLista
    ? [
        { id: "ambas", seccion: "Imprimir", label: "Guía y lista de trozas", hint: "En hoja blanca: el formato entero y cada valor en su renglón", icon: FileText, busy: c.ocupado === "imprimir", onSelect: () => void c.imprimir(["guia", "lista"]) },
        { id: "guia", seccion: "Imprimir", label: "Sólo la guía", hint: "La GTF con todos sus rótulos y valores", icon: FileText, onSelect: () => void c.imprimir(["guia"]) },
        { id: "lista", seccion: "Imprimir", label: "Sólo la lista de trozas", hint: "Todas sus hojas, con el formato", icon: FileText, onSelect: () => void c.imprimir(["lista"]) },
      ]
    : [{ id: "guia", seccion: "Imprimir", label: "La guía", hint: "En hoja blanca: el formato entero y cada valor en su renglón", icon: FileText, busy: c.ocupado === "imprimir", onSelect: () => void c.imprimir(["guia"]) }];
  return [
    ...imprimir,
    {
      id: "pdf",
      seccion: "Bajar",
      label: c.conLista ? "PDF de la guía y su lista" : "PDF de la guía",
      hint: "Un archivo para mandar por WhatsApp o correo",
      icon: Download,
      busy: c.ocupado === "pdf",
      onSelect: () => void c.bajarPdf(c.conLista ? ["guia", "lista"] : ["guia"]),
    },
    ...TINTAS.map((t): MenuAccion => ({ id: `tinta-${t.id}`, seccion: "Tinta", label: t.label, hint: t.hint, icon: c.tinta === t.id ? Check : Palette, activo: c.tinta === t.id, onSelect: () => c.setTinta(t.id) })),
    { id: "copia", seccion: "En la hoja", label: "Marca «COPIA»", hint: "Cruzada y con su pie: no pasa por la guía del talonario", icon: Stamp, activo: c.copia, onSelect: () => c.setCopia(!c.copia) },
    { id: "emisor", seccion: "En la hoja", label: "Nombre y DNI del emisor", hint: firmante, icon: UserCheck, activo: c.emisor, disabled: !c.firmante, onSelect: () => c.setEmisor(!c.emisor) },
  ];
}
