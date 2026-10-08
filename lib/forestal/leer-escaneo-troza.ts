/**
 * leer-escaneo-troza.ts — qué troza es la que se acaba de escanear.
 *
 * «Escanear para trabajar» (Brandon, 2026-09-26): con el celular o con una
 * pistola lectora —que para la computadora es un teclado: tipea el código y
 * da Enter— la troza queda marcada sin buscarla en la tabla.
 *
 * Un escaneo puede traer cinco cosas:
 *   · el QR chico de la etiqueta: `https://<host>/admin/q/<trozaId>`;
 *   · el QR chico de la etiqueta del LIBRO TH (ADR-450 R3):
 *     `https://<host>/verificar/<código de troza>` — el código, no un id: al
 *     recibir la guía la troza todavía no existe en el CTP. Desde el 08-10
 *     `…/verificar/troza/<id de la línea>?c=<código>`: el código sigue viajando
 *     (`?c=`, lo que vale sin internet) y el id de la línea va en `linea`
 *     para quien tenga las líneas del libro. La base puede llevar `/t/<slug>`;
 *   · el QR grande, con la ficha en texto (`TROZA 118\nEspecie: …`,
 *     `ficha-texto-troza.ts`): vale su primera línea, el código;
 *   · el QR viejo: `…/admin?tab=…&vista=trozas&troza=<trozaId>`;
 *   · un código de barras (Code128) o un tipeo: el código de planta (`118`,
 *     `115-A`) o la codificación del bosque (`13/A (0000008)`).
 *
 * Un código que está en DOS trozas no se resuelve a ciegas: se devuelven las
 * candidatas para que el operador elija (en `main` el `118` está dos veces).
 *
 * PURO y client-safe.
 */

import { esSinCodigo, type TrozaConsumible } from "./consumo-trozas";
import { codigoDeFichaTexto, esFichaDeTroza, esLineaDeFicha } from "./ficha-texto-troza";

export { esFichaDeTroza, esLineaDeFicha };

export type LecturaEscaneo =
  | { tipo: "id"; id: string }
  /** `linea`: el id de la línea del Libro TH, cuando el QR lo trae (no se repite entre permisos). */
  | { tipo: "codigo"; codigo: string; linea?: string };

/** La ruta de verificación, con o sin el prefijo `/t/<slug>` de la base pública. */
const RUTA_VERIFICAR = /^(?:\/t\/[^/]+)?\/verificar\/(.+)$/;

/** Lo mínimo que hace falta de una troza para reconocerla por su código. */
export interface TrozaEscaneable {
  id: string;
  codificacion?: string | null;
  codigoPlanta?: string | null;
}

export type ResultadoEscaneo<T> =
  | { estado: "una"; troza: T }
  | { estado: "varias"; trozas: T[] }
  | { estado: "ninguna" };

/** Un id de troza: letras, números, guion o guion bajo, sin espacios. */
const PARECE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * La clave con la que se comparan dos códigos: mayúsculas, sin tildes y sin
 * espacios. «13/a (0000008)» y «13/A(0000008)» son la misma pieza — la pistola
 * y el dedo no ponen los espacios igual.
 */
export function claveDeCodigo(v: string | null | undefined): string {
  return (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Interpreta lo que llegó del lector. `null` si no hay nada utilizable (vacío,
 * o una dirección que no es de una troza).
 */
export function leerEscaneo(texto: string | null | undefined): LecturaEscaneo | null {
  const crudo = (texto ?? "").trim();
  if (!crudo) return null;

  /* La ficha en texto trae el código en su primera línea: la cámara del
     sistema puede agarrar el QR grande en vez del chico. */
  const deFicha = codigoDeFichaTexto(crudo);
  if (deFicha) return { tipo: "codigo", codigo: deFicha.replace(/\s+/g, " ").toUpperCase() };
  /* `TROZA —`: la ficha de una pieza sin código. Buscarla entera como código
     daba «ninguna troza con el código TROZA — ESPECIE: …». */
  if (esFichaDeTroza(crudo)) return null;

  const esDireccion =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(crudo) || crudo.startsWith("/admin") || crudo.startsWith("/verificar/") || crudo.startsWith("/t/");
  if (esDireccion) {
    let url: URL;
    try {
      url = new URL(crudo, "http://local");
    } catch {
      return null;
    }
    /* ADR-450 R3: el QR chico del Libro TH lleva el CÓDIGO de la troza.
       `/verificar/lote/…`, `/despacho/…` y `/guia/…` son de otra cosa. */
    const ruta = RUTA_VERIFICAR.exec(url.pathname)?.[1] ?? "";
    const porLinea = /^troza\/([^/?#]+)\/?$/.exec(ruta);
    if (porLinea?.[1]) {
      const codigo = (url.searchParams.get("c") ?? "").trim();
      if (!codigo) return null;
      let linea: string;
      try {
        linea = decodeURIComponent(porLinea[1]);
      } catch {
        return null;
      }
      return { tipo: "codigo", codigo: codigo.replace(/\s+/g, " ").toUpperCase(), linea };
    }
    const delTh = /^([^/?#]+)\/?$/.exec(ruta);
    if (delTh?.[1]) {
      let codigo: string;
      try {
        codigo = decodeURIComponent(delTh[1]).trim();
      } catch {
        return null;
      }
      if (!codigo || /^(lote|despacho|guia|troza)$/i.test(codigo)) return null;
      return { tipo: "codigo", codigo: codigo.replace(/\s+/g, " ").toUpperCase() };
    }
    const corta = /\/admin\/q\/([^/?#]+)/.exec(url.pathname);
    let id: string | null;
    try {
      /* `/admin/q/%E0` tiraba URIError sin capturar (revisión 29-09). */
      id = corta?.[1] ? decodeURIComponent(corta[1]) : url.searchParams.get("troza");
    } catch {
      return null;
    }
    return id && PARECE_ID.test(id) ? { tipo: "id", id } : null;
  }

  const codigo = crudo.replace(/\s+/g, " ").toUpperCase();
  return { tipo: "codigo", codigo };
}

/**
 * Busca la troza de un escaneo. Primero el código de planta (es el que se
 * pinta en la testa y el que imprime el Code128); si nadie lo tiene, la
 * codificación del bosque. Comparación EXACTA: «118» no es «1180».
 *
 * Un tipeo que resulta ser el id pelado de una troza también la encuentra.
 */
export function buscarTrozaEscaneada<T extends TrozaEscaneable>(
  trozas: readonly T[],
  lectura: LecturaEscaneo | null,
): ResultadoEscaneo<T> {
  if (!lectura) return { estado: "ninguna" };

  if (lectura.tipo === "id") {
    const t = trozas.find((x) => x.id === lectura.id);
    return t ? { estado: "una", troza: t } : { estado: "ninguna" };
  }
  /* El QR por línea del Libro TH: si la lista es de líneas del libro (el
     despacho escaneando), el id decide aunque el código esté dos veces. */
  if (lectura.linea) {
    const t = trozas.find((x) => x.id === lectura.linea);
    if (t) return { estado: "una", troza: t };
  }

  const clave = claveDeCodigo(lectura.codigo);
  /* «-» o «...» es «sin código» (49 trozas de Blas lo tienen): no identifica nada. */
  if (!clave || esSinCodigo({ codificacion: lectura.codigo })) return { estado: "ninguna" };

  const porPlanta = trozas.filter((t) => claveDeCodigo(t.codigoPlanta) === clave);
  const porBosque =
    porPlanta.length > 0
      ? porPlanta
      : trozas.filter((t) => !esSinCodigo(t) && claveDeCodigo(t.codificacion) === clave);
  const halladas =
    porBosque.length > 0 ? porBosque : trozas.filter((t) => t.id.toUpperCase() === clave);

  if (halladas.length === 0) return { estado: "ninguna" };
  if (halladas.length === 1) return { estado: "una", troza: halladas[0]! };
  return { estado: "varias", trozas: halladas };
}

/**
 * Pone primero las que coinciden EXACTO con lo buscado. La búsqueda del patio
 * es por «contiene» (sirve para tipear a medias); con un escaneo, la pieza
 * exacta tiene que salir arriba de sus parecidas («118» antes que «1180»).
 */
export function exactasPrimero<T extends TrozaEscaneable>(
  trozas: readonly T[],
  texto: string,
): T[] {
  const clave = claveDeCodigo(texto);
  if (!clave) return [...trozas];
  const exacta = (t: T) =>
    claveDeCodigo(t.codigoPlanta) === clave || claveDeCodigo(t.codificacion) === clave;
  return [...trozas.filter(exacta), ...trozas.filter((t) => !exacta(t))];
}

/** La ficha de una troza (`/api/admin/forestal/trozas/ficha`), lo que el patio usa. */
export interface FichaTrozaJson {
  troza: {
    id: string;
    codificacion: string | null;
    codigoPlanta: string | null;
    especieComun: string | null;
    especieCientifica?: string | null;
    parcela?: string | null;
    volumenM3: number | null;
    d1Cm?: number | null;
    d2Cm?: number | null;
    diametroCm?: number | null;
    largoM?: number | null;
    noRecepcionada?: boolean | null;
    descarte?: boolean | null;
    fechaRecepcion?: string | null;
    /** ADR-450: el árbol del Libro TH (copia para el acta). */
    arbolCodigo?: string | null;
    lothTrozadoId?: string | null;
  };
  ingreso: {
    id: string;
    libroNro?: number | null;
    constanciaSniffs?: string | null;
    gtfNumber: string | null;
    permiso?: string | null;
    resolucion?: string | null;
    proveedor?: string | null;
    entryDate?: string | null;
    fechaRecepcion?: string | null;
  };
  lote?: { id: string; code: string } | null;
  /** El lote mixto abierto donde está apartada (ADR-441); `null` = en ninguno. */
  loteMixto?: { id: string; code: string } | null;
  retrozos?: unknown[];
  corrida?: { id: string; vigente: boolean } | null;
  despacho?: { id: string; vigente: boolean } | null;
}

/**
 * La ficha, traducida a la forma que el veredicto del patio sabe leer. Una
 * corrida o un despacho ANULADO no bloquea: esa madera volvió al patio (la
 * ficha lo dice con `vigente`, el patio con el id en `null`).
 */
export function consumibleDeFicha(f: FichaTrozaJson): TrozaConsumible {
  return {
    id: f.troza.id,
    woodEntryId: f.ingreso.id,
    codificacion: f.troza.codificacion,
    codigoPlanta: f.troza.codigoPlanta,
    especieComun: f.troza.especieComun,
    especieCientifica: f.troza.especieCientifica ?? null,
    parcela: f.troza.parcela ?? null,
    volumenM3: f.troza.volumenM3,
    d1Cm: f.troza.d1Cm ?? null,
    d2Cm: f.troza.d2Cm ?? null,
    diametroCm: f.troza.diametroCm ?? null,
    largoM: f.troza.largoM ?? null,
    gtfNumber: f.ingreso.gtfNumber,
    libroNro: f.ingreso.libroNro ?? null,
    constanciaSniffs: f.ingreso.constanciaSniffs ?? null,
    permiso: f.ingreso.permiso ?? null,
    resolucion: f.ingreso.resolucion ?? null,
    proveedor: f.ingreso.proveedor ?? null,
    /* Lo que la ficha del patio muestra al escanear (2026-09-26): fechas y lote. */
    fechaIngreso: f.ingreso.entryDate ?? null,
    fechaRecepcion: f.troza.fechaRecepcion ?? null,
    guiaFechaRecepcion: f.ingreso.fechaRecepcion ?? null,
    loteAserrioId: f.lote?.id ?? null,
    loteAserrioCode: f.lote?.code ?? null,
    loteMixtoId: f.loteMixto?.id ?? null,
    loteMixtoCode: f.loteMixto?.code ?? null,
    noRecepcionada: f.troza.noRecepcionada ?? null,
    descarte: f.troza.descarte ?? null,
    retrozos: f.retrozos?.length ?? 0,
    consumidaEnId: f.corrida?.vigente ? f.corrida.id : null,
    despachadaEnId: f.despacho?.vigente ? f.despacho.id : null,
    arbolCodigo: f.troza.arbolCodigo ?? null,
    lothTrozadoId: f.troza.lothTrozadoId ?? null,
  };
}

/**
 * La etiqueta trae DOS códigos de la misma troza (ADR-436): el QR
 * (`/admin/q/<id>`) y el Code128 (código de planta). La cámara o la pistola
 * pueden leer los dos seguidos, y el segundo decía «ya estaba» — un aviso
 * falso que enseña a ignorar los avisos. Dentro de esta ventana, la misma
 * troza recién aceptada es el eco de la misma etiqueta: se ignora en silencio.
 */
export const ECO_DE_ETIQUETA_MS = 2000;

/**
 * Después de leer `TROZA <código>` (la ficha del QR grande), lo que llega en
 * estos ms y no es una troza se toma como el resto de la ficha que la pistola
 * sigue tipeando, y se calla. Hace falta porque una pistola en modo teclado
 * puede no tipear los íconos (emoji) con que arranca cada línea: sin ellos,
 * `Cachimbo` o `2.412 m³` no se reconocen como línea de la ficha (revisión
 * 26-09). Se renueva con cada línea: una ficha larga no se sale de la ventana.
 */
export const VENTANA_FICHA_MS = 3000;

/** ¿Esta lectura es el segundo código de la etiqueta que se acaba de aceptar? */
export function esEcoDeEtiqueta(
  ultima: { id: string; en: number } | null,
  trozaId: string,
  ahora: number,
  ventanaMs: number = ECO_DE_ETIQUETA_MS,
): boolean {
  if (!ultima || ultima.id !== trozaId) return false;
  const pasaron = ahora - ultima.en;
  return pasaron >= 0 && pasaron < ventanaMs;
}
