"use client";

/**
 * use-guia-desde-foto — guardar una guía (ADR-442) a partir de la FOTO de su
 * GTF, y que esa misma foto quede en su casillero «GTF».
 *
 * Pedido de Brandon (2026-09-27, eligió «Guardar con una foto»): «tomo foto a
 * la guía → se lee el número → se busca en SERFOR → la guía queda guardada →
 * la foto queda en el casillero GTF». Tres piezas:
 *   · `leerGuiaDeFoto` achica la foto y la manda al lector (`gtf-ocr`), que
 *     devuelve el N° de registro SÓLO si tiene la forma del SNIFFS;
 *   · `formConLectura` llena los huecos del formulario (lo escrito no se pisa);
 *   · `useGuiaDesdeFoto` guarda la foto hasta que la guía tiene su GTF y la
 *     sube al casillero. Si la foto dice OTRA GTF que la guardada (el lector
 *     leyó mal el registro y SERFOR trajo otra guía), no se sube sola.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { comprimirImagen } from "@/lib/documents/compress-image";
import { logger } from "@/lib/logger";
import { MAX_BYTES_DOC_GUIA } from "@/lib/forestal/documentos-guia";
import { esFechaReal, fechaDeSerfor } from "@/lib/forestal/guias-guardadas";
import type { FormGuia } from "@/components/admin/forestal/guia-guardada-form";

/** Lo que el lector sacó de la foto (vacío = no se leyó). */
export interface LecturaDeGuia {
  numeroRegistro: string;
  gtfNumber: string;
  /** `AAAA-MM-DD` si es un día real; si no, vacío. */
  fecha: string;
  titular: string;
  /** RUC o DNI del titular, sólo dígitos. */
  ruc: string;
}

/** La foto frente a su casillero «GTF». */
export type EstadoFoto = "pendiente" | "subiendo" | "guardada" | "error" | "revisar";

const LECTOR = "/api/admin/forestal/gtf-ocr";
const DOCUMENTOS = "/api/admin/forestal/guias/documentos";

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const soloDigitos = (v: string) => v.replace(/\D/g, "");

function fechaLeida(v: string): string {
  if (esFechaReal(v)) return v;
  const dmy = fechaDeSerfor(v);
  return dmy && esFechaReal(dmy) ? dmy : "";
}

/** Lo que devuelve `gtf-ocr`, con cada dato limpio o vacío. */
/** Todo lo que va antes del primer dígito es rótulo («N°», «NRO», «GTF N°»). */
const sinRotulo = (v: string) => v.replace(/^[^\d]+/, "");

/**
 * La GTF entera. Si el lector separó la serie (número `0000004`, serie
 * `019-001`), se unen: con la serie afuera la guía quedaba con `0000004` de
 * llave y sus papeles no llegaban al ingreso (que usa la GTF completa).
 */
function gtfLeida(numero: string, serie: string): string {
  const n = sinRotulo(numero);
  const s = sinRotulo(serie).replace(/-+$/, "");
  if (!n || !s || n.includes("-") || soloDigitos(n).startsWith(soloDigitos(s))) return n;
  return `${s}-${n}`;
}

export function lecturaDe(j: Record<string, unknown>): LecturaDeGuia {
  const ruc = soloDigitos(texto(j.ruc));
  return {
    numeroRegistro: texto(j.numeroRegistro),
    gtfNumber: gtfLeida(texto(j.gtfNumber), texto(j.gtfSeries)),
    fecha: fechaLeida(texto(j.fecha)),
    titular: texto(j.proveedor),
    ruc: ruc.length === 8 || ruc.length === 11 ? ruc : "",
  };
}

export const leyoAlgo = (l: LecturaDeGuia) => Boolean(l.numeroRegistro || l.gtfNumber);

/** Llena sólo lo vacío: lo que la persona ya escribió manda sobre la foto. */
export function formConLectura(form: FormGuia, l: LecturaDeGuia): FormGuia {
  const hueco = (actual: string, leido: string) => (actual.trim() ? actual : leido);
  return {
    ...form,
    numeroRegistro: hueco(form.numeroRegistro, l.numeroRegistro),
    gtfNumber: hueco(form.gtfNumber, l.gtfNumber),
    gtfDate: hueco(form.gtfDate, l.fecha),
    titularNombre: hueco(form.titularNombre, l.titular),
    titularDoc: hueco(form.titularDoc, l.ruc),
  };
}

/**
 * ¿La foto dice otra GTF que la guía guardada? Se compara por el final: la
 * foto puede traer sólo el número (`0000004`) y la guía la GTF entera.
 */
export const fotoDiceOtraGtf = (l: LecturaDeGuia | null, gtf: string) => {
  const leida = soloDigitos(l?.gtfNumber ?? "");
  const guia = soloDigitos(gtf);
  return Boolean(leida && !(guia.endsWith(leida) || leida.endsWith(guia)));
};

/**
 * Sin GTF leída no hay con qué comparar: un dígito mal leído del registro
 * traería OTRA guía de SERFOR y la foto se subiría sola a ella. Pide confirmar.
 */
export const fotoSinGtfLeida = (l: LecturaDeGuia | null) => !soloDigitos(l?.gtfNumber ?? "");

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const j = (await res.json().catch((err: unknown) => {
    logger.warn("[guia-desde-foto] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as { message?: string; error?: string } | null;
  /* El 503 del lector trae su frase en `error` («La lectura automática de
     guías todavía no está activada…»); un código pelado no se muestra. */
  const frase = j?.error && /\s/.test(j.error) ? j.error : null;
  return j?.message ?? frase ?? porDefecto;
}

const comoDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se pudo abrir la foto"));
    fr.readAsDataURL(file);
  });

/** Falta la IA de la plataforma: va el aviso único de la clave (`AvisoClaveIa`), no un error. */
export interface SinClaveIa {
  /** Quien mira administra la clave (`codigo: "sin_lector"`): el aviso trae dónde va. */
  instrucciones: boolean;
}

type FalloDeLectura = { ok: false; mensaje: string; sinClave?: SinClaveIa };

/**
 * Lo que dijo el lector cuando no leyó. Con `codigo` (lector común, 02-10) la
 * frase ya es para la persona —sin crédito, saturada, foto que no es foto— y
 * se muestra tal cual; sin él, sólo 503/429 traen frase propia.
 */
async function falloDelLector(res: Response): Promise<FalloDeLectura> {
  const general = "El lector de guías no respondió. Prueba de nuevo o escribe el número.";
  const j = (await res.json().catch((err: unknown) => {
    logger.warn("[guia-desde-foto] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as { message?: string; error?: string; codigo?: string } | null;
  logger.warn("[guia-desde-foto] lector", { status: res.status, codigo: j?.codigo });
  const frase = j?.error && /\s/.test(j.error) ? j.error : null;
  if (j?.codigo === "sin_lector" || j?.codigo === "ia_no_disponible") {
    return { ok: false, mensaje: frase ?? general, sinClave: { instrucciones: j.codigo === "sin_lector" } };
  }
  if (j?.codigo && frase) return { ok: false, mensaje: frase };
  if (res.status === 422) return { ok: false, mensaje: "No se pudo leer la guía en la foto." };
  /* 503 (sin lector) y 429 (sin presupuesto) traen su frase para el patio;
     el resto («API error: 502»…) no le dice nada a quien sacó la foto. */
  const propia = res.status === 503 || res.status === 429 ? (j?.message ?? frase) : null;
  return { ok: false, mensaje: propia ?? general };
}

/** Manda la foto (ya achicada) al lector. Devuelve lo leído o el mensaje para la persona. */
export async function leerGuiaDeFoto(foto: File): Promise<{ ok: true; lectura: LecturaDeGuia } | FalloDeLectura> {
  try {
    const res = await fetch(LECTOR, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image: await comoDataUrl(foto) }),
    });
    if (!res.ok) return await falloDelLector(res);
    return { ok: true, lectura: lecturaDe((await res.json()) as Record<string, unknown>) };
  } catch (e) {
    logger.error("[guia-desde-foto] leer failed", { error: String(e) });
    return { ok: false, mensaje: "No se pudo mandar la foto. Revisa la señal y prueba de nuevo." };
  }
}

/** Sube la foto al casillero «GTF» de la guía. Devuelve el error para mostrar, o `null`. */
export async function subirFotoAlCasilleroGtf(gtf: string, foto: File): Promise<string | null> {
  if (foto.size > MAX_BYTES_DOC_GUIA) return "La foto pesa más de 4 MB: sácala con menos resolución.";
  const fd = new FormData();
  fd.append("gtf", gtf);
  fd.append("casillero", "gtf");
  fd.append("file", foto, foto.name || "guia.jpg");
  try {
    const res = await fetch(DOCUMENTOS, { method: "POST", credentials: "include", headers: csrfHeaders(), body: fd });
    return res.ok ? null : await mensajeDe(res, "No se pudo guardar la foto en el casillero GTF.");
  } catch (e) {
    logger.error("[guia-desde-foto] subir failed", { error: String(e) });
    return "No se pudo guardar la foto. Revisa la señal y prueba de nuevo.";
  }
}

/**
 * La foto de UNA guía nueva: leerla, recordarla y subirla cuando la guía ya
 * tiene su GTF. Todo lo que se lee después de un `await` sale de refs: quien
 * llama puede tener un render viejo (el guardado arranca antes de que la foto
 * entre al estado).
 */
export function useGuiaDesdeFoto() {
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<LecturaDeGuia | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoFoto | null>(null);
  /** Una línea para la persona: no se leyó nada, el lector no está, falló la subida. */
  const [aviso, setAviso] = useState<string | null>(null);
  /** El `aviso` es el de la clave de IA (va con `AvisoClaveIa`, no como alerta). */
  const [sinClave, setSinClave] = useState<SinClaveIa | null>(null);
  /** Fotos que ya quedaron en el casillero: quien muestra la grilla la remonta con esto. */
  const [subidas, setSubidas] = useState(0);
  const foto = useRef<File | null>(null);
  const leida = useRef<LecturaDeGuia | null>(null);
  const subiendo = useRef(false);
  useEffect(() => () => void (miniatura && URL.revokeObjectURL(miniatura)), [miniatura]);

  const descartar = useCallback(() => {
    foto.current = null;
    leida.current = null;
    setLectura(null);
    setMiniatura(null);
    setEstado(null);
    setAviso(null);
    setSinClave(null);
  }, []);

  /** Lee la foto. Devuelve lo leído sólo si trae un número; si no, la foto se suelta. */
  const leer = useCallback(
    async (original: File): Promise<LecturaDeGuia | null> => {
      descartar();
      setLeyendo(true);
      try {
        const lista = await comprimirImagen(original);
        const r = await leerGuiaDeFoto(lista);
        if (!r.ok) {
          setAviso(r.mensaje);
          setSinClave(r.sinClave ?? null);
          return null;
        }
        if (!leyoAlgo(r.lectura)) {
          setAviso("No se leyó ningún número en la foto: escríbelo a mano.");
          return null;
        }
        foto.current = lista;
        leida.current = r.lectura;
        setLectura(r.lectura);
        setMiniatura(URL.createObjectURL(lista));
        setEstado("pendiente");
        return r.lectura;
      } finally {
        setLeyendo(false);
      }
    },
    [descartar],
  );

  /**
   * Sube la foto que espera a la guía `gtf`. `aunqueNoCoincida` = la persona
   * miró la foto y confirmó que es de esta guía.
   */
  const subirA = useCallback(async (gtf: string, aunqueNoCoincida = false): Promise<boolean> => {
    const f = foto.current;
    if (!f || subiendo.current) return false;
    if (!aunqueNoCoincida && (fotoDiceOtraGtf(leida.current, gtf) || fotoSinGtfLeida(leida.current))) {
      setEstado("revisar");
      return false;
    }
    subiendo.current = true;
    setEstado("subiendo");
    setAviso(null);
    const err = await subirFotoAlCasilleroGtf(gtf, f);
    subiendo.current = false;
    if (err) {
      setEstado("error");
      setAviso(err);
      return false;
    }
    foto.current = null; // ya está en el casillero: no se sube dos veces
    setEstado("guardada");
    setSubidas((n) => n + 1);
    return true;
  }, []);

  return { leyendo, lectura, miniatura, estado, aviso, sinClave, subidas, leer, subirA, descartar };
}

export type GuiaDesdeFoto = ReturnType<typeof useGuiaDesdeFoto>;
