import "server-only";

/**
 * Firma de las fotos de la carga (Libro CTP, 2026-09-26).
 *
 * Qué se cierra: la foto viaja de ida y vuelta por el navegador entre que se
 * sube (`POST /api/admin/forestal/fotos`) y que se guarda en la guía
 * (`POST`/`PATCH` de wood-entries). En ese viaje, quien edita la guía podía
 * reescribir `tomadaEn`, `lat/lng`, `sellada`, atrasar `subidaEn` o pegar la
 * foto privada de OTRA guía — y el libro la mostraba como evidencia del día
 * que llegó la madera.
 *
 * Cómo: al subir, el servidor firma con HMAC-SHA256 los datos que declaró la
 * foto; al guardar, una foto NUEVA sin firma válida se rechaza. Lo ya guardado
 * no se vuelve a verificar: se conserva como está en la base, diga lo que diga
 * el cliente.
 *
 * La clave se DERIVA de `AUTH_SECRET` con un contexto propio: nunca es la
 * misma que firma las sesiones, así que una firma de foto no sirve como token
 * ni al revés. Durante una rotación (`AUTH_SECRET_PREVIOUS`) se aceptan las
 * dos, para no rechazar una foto subida minutos antes del cambio.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { requireEnv } from "@/lib/env";
import { esPathDeCargaDelTenant, normalizarFoto, pathDeFoto, type FotoCarga } from "./fotos-carga";

const CONTEXTO = "buleje:forestal:fotos-carga:firma:v1";

function derivar(secreto: string): Buffer {
  return createHmac("sha256", secreto).update(CONTEXTO).digest();
}

/** Clave vigente primero; la anterior sólo mientras dura una rotación. */
function claves(): Buffer[] {
  const out = [derivar(requireEnv("AUTH_SECRET"))];
  const previa = process.env.AUTH_SECRET_PREVIOUS?.trim();
  if (previa) out.push(derivar(previa));
  return out;
}

/**
 * Para qué se subió la foto. Va DENTRO de lo firmado (revisión 2026-09-26):
 * sin eso, una foto de la carga subida por el almacenero valía como comprobante
 * de un pago, y al revés. Se elige al subir (`POST /api/admin/forestal/fotos`,
 * campo `proposito`) y lo exige quien la guarda.
 */
export const PROPOSITOS_FOTO = ["carga", "comprobante"] as const;
export type PropositoFoto = (typeof PROPOSITOS_FOTO)[number];

/**
 * Lo que se firma, en un orden fijo. Un array JSON y no `a|b|c`: con un `|`
 * dentro de `por` dos fotos distintas podrían dar el mismo texto.
 * Se firma la foto YA normalizada (`normalizarFoto`), que es lo mismo que el
 * servidor vuelve a armar al recibirla: recortes y números iguales en los dos lados.
 *
 * Versiones: la CARGA sigue firmando con el mensaje `v1` de siempre —así las
 * fotos de carga ya subidas y firmadas antes del cambio siguen valiendo, sin
 * migrar nada—. El COMPROBANTE firma `v2` con el propósito adentro: un mensaje
 * que ninguna foto de carga puede producir, y viceversa.
 */
function mensaje(f: FotoCarga, proposito: PropositoFoto): string {
  const datos = [
    f.url,
    f.tomadaEn ?? null,
    f.subidaEn ?? null,
    f.por ?? null,
    f.lat ?? null,
    f.lng ?? null,
    f.precisionM ?? null,
    f.sellada === true,
  ];
  return JSON.stringify(proposito === "carga" ? ["v1", ...datos] : ["v2", proposito, ...datos]);
}

function hmac(clave: Buffer, f: FotoCarga, proposito: PropositoFoto): Buffer {
  return createHmac("sha256", clave).update(mensaje(f, proposito)).digest();
}

/** La foto normalizada, con su `firma`. La usa sólo el endpoint que sube. */
export function firmarFoto(foto: FotoCarga, proposito: PropositoFoto = "carga"): FotoCarga {
  const limpia = normalizarFoto({ ...foto, firma: undefined });
  if (!limpia) throw new Error("No se puede firmar una foto sin URL válida");
  const { firma: _descartada, ...sinFirma } = limpia;
  return { ...sinFirma, firma: hmac(claves()[0]!, sinFirma, proposito).toString("hex") };
}

/**
 * ¿La firma corresponde EXACTAMENTE a estos datos y a este propósito?
 * Comparación en tiempo constante.
 */
export function firmaValida(foto: FotoCarga, proposito: PropositoFoto = "carga"): boolean {
  const limpia = normalizarFoto(foto);
  if (!limpia?.firma) return false;
  const recibida = Buffer.from(limpia.firma, "hex");
  const { firma: _f, ...sinFirma } = limpia;
  return claves().some((k) => {
    const esperada = hmac(k, sinFirma, proposito);
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  });
}

/** Una foto que no se puede guardar en la guía. El llamador la vuelve un 400. */
export class FotoNoValidaError extends Error {}

/**
 * Lo que se GUARDA en la guía a partir de lo que mandó el cliente.
 *
 *  - Ya guardada en ESTA guía (`previas`, por URL) → la versión de la base, tal
 *    cual: el cliente no retoca la evidencia de nadie.
 *  - Nueva → tiene que ser privada de ESTE tenant (`priv:<tenant>/forestal-carga/…`;
 *    una `https://` nueva ya no entra), no estar en otra guía del negocio, y
 *    traer una firma válida sobre sus datos.
 *
 * `enOtrasGuias`: URL → N° de la otra guía que ya la tiene (lo arma la DB class).
 */
export function resolverFotosEntrantes(
  tenantId: string,
  entrantes: readonly FotoCarga[],
  previas: readonly FotoCarga[],
  enOtrasGuias: ReadonlyMap<string, string>,
  /** Lo que la foto tiene que haber declarado al subirse. La guía pide `carga`; un pago, `comprobante`. */
  proposito: PropositoFoto = "carga",
): FotoCarga[] {
  const guardadas = new Map(previas.map((f) => [f.url, f]));
  return entrantes.map((f, i) => {
    const previa = guardadas.get(f.url);
    if (previa) return previa;
    const n = i + 1;
    const path = pathDeFoto(f);
    if (path == null || !esPathDeCargaDelTenant(path, tenantId)) {
      throw new FotoNoValidaError(
        `La foto ${n} no se subió desde este panel: sólo se aceptan fotos subidas con «Tomar foto» o «Subir fotos».`,
      );
    }
    const otra = enOtrasGuias.get(f.url);
    if (otra) {
      throw new FotoNoValidaError(
        `La foto ${n} ya es evidencia de la guía ${otra}: una foto de la carga sirve para UNA guía. Saca una nueva.`,
      );
    }
    if (!firmaValida(f, proposito)) {
      const otro: PropositoFoto = proposito === "carga" ? "comprobante" : "carga";
      throw new FotoNoValidaError(
        firmaValida(f, otro)
          ? proposito === "comprobante"
            ? `La foto ${n} se subió como foto de la carga: para el comprobante del pago súbela de nuevo desde aquí.`
            : `La foto ${n} se subió como comprobante de un pago: para la carga súbela de nuevo desde la guía.`
          : `La foto ${n} no coincide con lo que se registró al subirla (hora, lugar o sello cambiados, o sin firma). Súbela de nuevo.`,
      );
    }
    return normalizarFoto(f)!;
  });
}
