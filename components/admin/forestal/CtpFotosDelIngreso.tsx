"use client";

/**
 * CtpFotosDelIngreso — las fotos de la madera que bajó del camión (ADR-434).
 *
 * Se monta en tres puertas: el alta (`WoodEntryForm`), al recibir la guía
 * (`CtpRecepcionTrozas`, patio y modo offline) y el detalle de un ingreso
 * (`CtpEntryDetailModal`, que guarda con `guardarFotosDeGuia`).
 *
 * 2026-09-26 — FOTO CON SELLO. Hasta acá la foto era sólo una URL pública: sin
 * fecha, sin quién, sin lugar. Ante un fiscalizador eso no prueba nada — una
 * foto de cualquier día sirve para cualquier guía. Ahora, antes de subir:
 *  1. se pide la ubicación del teléfono (6 s; si se niega, sigue sin lugar);
 *  2. se quema una franja abajo de la imagen con fecha y hora de Lima, quién,
 *     N° de GTF y coordenadas (`sellar-imagen.ts` + `sello-foto.ts`);
 *  3. se sube al almacén PRIVADO (`POST /api/admin/forestal/fotos`) con esos
 *     mismos datos, que vuelven como `FotoCarga`.
 * Una foto que el navegador SÍ sabe abrir pero no queda sellada (raro: falló
 * el canvas) se sube igual, sin sello, marcada `sellada: false` — perderla
 * sería peor. Una que el navegador NO sabe abrir (HEIC en Chrome/Android; en
 * iPhone Safari sí la decodifica) no llega a subirse: el servidor sólo acepta
 * JPG/PNG/WebP y no hay conversor HEIC en el repo, así que se corta antes con
 * un aviso claro en vez de un «Tipo no permitido» técnico (2026-09-26).
 *
 * La foto se saca DONDE está la madera: en el celular «Tomar foto» abre la
 * cámara directo (`capture="environment"`).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, MapPin, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cachedJson } from "@/lib/client-cache-fetch";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { compressIfLarge, TIPOS_QUE_ACEPTA_EL_SERVIDOR } from "@/lib/image-upload-utils";
import { normalizarFoto, srcDeFoto, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { lineasDelSello, momentoDeLaFoto, pieDeFoto, ubicacionVale, urlMapaDeFoto } from "@/lib/forestal/sello-foto";
import { pedirUbicacion, sellarImagen } from "@/lib/forestal/sellar-imagen";

/** Lo que acepta el libro por ingreso (`photos: z.array(...).max(10)`). */
export const MAX_FOTOS = 10;

const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Quién está logueado, para el sello: «Nombre (usuario)». El libro guarda el
 * USUARIO (`por`, lo pone el servidor desde la sesión); el sello lleva además el
 * nombre para que se lea. Con los dos, la franja y el registro se cruzan sin
 * dudas. `/api/auth/me` ya se pide en el panel: sale del caché.
 */
function useQuienSube(): string | null {
  const [quien, setQuien] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    cachedJson<{ name?: string | null; username?: string | null }>("/api/auth/me", 60_000)
      .then((d) => {
        const nombre = d?.name?.trim() || null;
        const usuario = d?.username?.trim() || null;
        const texto = nombre && usuario && nombre !== usuario ? `${nombre} (${usuario})` : nombre ?? usuario;
        if (vivo) setQuien(texto);
      })
      .catch(() => {
        if (vivo) setQuien(null);
      });
    return () => {
      vivo = false;
    };
  }, []);
  return quien;
}

/** ¿La foto trae sello del sistema, o es una URL vieja sin datos? */
const traeDatos = (f: FotoCarga) => Boolean(f.tomadaEn || f.subidaEn || f.por);

export default function CtpFotosDelIngreso({
  fotos,
  onCambio,
  disabled,
  gtf,
  proposito = "carga",
}: {
  fotos: FotoCarga[];
  onCambio: (fotos: FotoCarga[]) => void;
  disabled?: boolean;
  /** N° de la guía: si llega, va escrito en el sello de cada foto. */
  gtf?: string | null;
  /** Para qué es la foto: el servidor lo firma y quien la guarda lo exige (carga ≠ comprobante de un pago). */
  proposito?: "carga" | "comprobante";
}) {
  const [subiendo, setSubiendo] = useState(0);
  const [etapa, setEtapa] = useState<"ubicando" | "subiendo" | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const quien = useQuienSube();
  const lugar = MAX_FOTOS - fotos.length;

  const subirUna = async (
    archivo: File,
    ubic: { lat: number; lng: number; precisionM: number } | null,
  ): Promise<FotoCarga | null> => {
    const ahora = Date.now();
    const tomada = momentoDeLaFoto(archivo.lastModified, ahora);
    const donde = ubic && ubicacionVale(tomada, ahora) ? ubic : null;
    const lineas = lineasDelSello({ tomadaEn: new Date(tomada), por: quien, gtf, ...donde });
    const sellada = await sellarImagen(archivo, lineas);
    const base = archivo.name.replace(/\.[^.]+$/, "") || "foto";
    const cuerpo = sellada ? new File([sellada], `${base}.webp`, { type: "image/webp" }) : await compressIfLarge(archivo);

    /*
     * Ni `sellarImagen` ni `compressIfLarge` pudieron abrir el archivo (HEIC en
     * un navegador que no lo decodifica, típicamente Chrome/Android): `cuerpo`
     * sigue siendo el original, en un formato que el servidor rechaza. Antes
     * esto se mandaba igual y el error salía como un «Tipo no permitido»
     * técnico — acá se corta ANTES de subir, con lo que el operario puede
     * hacer (el comentario de arriba decía «se sube sin sello», pero sin
     * poder decodificarla la subida entera fallaba).
     */
    if (!TIPOS_QUE_ACEPTA_EL_SERVIDOR.has(cuerpo.type)) {
      const esHeic = /hei[cf]/i.test(cuerpo.type) || /\.hei[cf]$/i.test(archivo.name);
      toast.error(
        esHeic
          ? `«${archivo.name}» está en HEIC y este navegador no la puede abrir: sácala con la cámara o expórtala a JPG antes de subirla.`
          : `«${archivo.name}» no se pudo preparar para subir (${cuerpo.type || "formato desconocido"}). Usa JPG, PNG o WebP.`,
      );
      return null;
    }

    const fd = new FormData();
    fd.append("file", cuerpo);
    fd.append("tomadaEn", new Date(tomada).toISOString());
    fd.append("sellada", sellada ? "true" : "false");
    fd.append("proposito", proposito);
    if (donde) {
      fd.append("lat", String(donde.lat));
      fd.append("lng", String(donde.lng));
      fd.append("precisionM", String(Math.round(donde.precisionM)));
    }
    const res = await fetch("/api/admin/forestal/fotos", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
      body: fd,
    });
    const data = await leerJson<{ foto?: unknown; error?: string; message?: string }>(res);
    const foto = res.ok ? normalizarFoto(data?.foto) : null;
    if (!foto) {
      toast.error(data?.message ?? data?.error ?? `No se pudo subir ${archivo.name}.`);
      return null;
    }
    return foto;
  };

  const subir = async (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    /* Se toman sólo las que entran: subir 12 y perder 2 en silencio sería peor
       que decir de entrada cuántas caben. */
    const elegidas = [...lista].slice(0, lugar);
    if (lista.length > elegidas.length) {
      toast.warning(`Entran ${lugar} foto${lugar === 1 ? "" : "s"} más: se suben las primeras.`);
    }
    setSubiendo(elegidas.length);
    // Una sola consulta al GPS por tanda: pedirla por foto multiplicaría la espera.
    setEtapa("ubicando");
    const ubic = await pedirUbicacion();
    setEtapa("subiendo");
    const subidas: FotoCarga[] = [];
    for (const archivo of elegidas) {
      try {
        const f = await subirUna(archivo, ubic);
        if (f) subidas.push(f);
      } catch {
        toast.error(`No se pudo subir ${archivo.name}. Revisa la conexión.`);
      }
    }
    setSubiendo(0);
    setEtapa(null);
    if (subidas.length > 0) {
      onCambio([...fotos, ...subidas]);
      if (!ubic) toast.info("Las fotos se guardaron sin ubicación: el teléfono no la dio.");
    }
    /* Sin esto, elegir la MISMA foto dos veces seguidas no dispara `change`. */
    if (archivoRef.current) archivoRef.current.value = "";
    if (camaraRef.current) camaraRef.current.value = "";
  };

  const ocupado = disabled || lugar === 0 || subiendo > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={archivoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          hidden
          onChange={(e) => void subir(e.target.files)}
        />
        {/* En el celular esta abre la cámara; en la computadora, el explorador. */}
        <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void subir(e.target.files)} />
        <button type="button" onClick={() => camaraRef.current?.click()} disabled={ocupado} className={`${BTN} sm:hidden`}>
          <Camera className="h-4 w-4" aria-hidden /> Tomar foto
        </button>
        <button type="button" onClick={() => archivoRef.current?.click()} disabled={ocupado} className={BTN}>
          {subiendo > 0 ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
          {subiendo === 0 ? "Agregar fotos" : etapa === "ubicando" ? "Buscando ubicación…" : `Subiendo ${subiendo}…`}
        </button>
        <span className="text-xs text-[var(--text-tertiary)]" aria-live="polite">
          {fotos.length} de {MAX_FOTOS}
        </span>
        <InfoTip
          title="Fotos con sello"
          what="Cada foto sale con una franja abajo: fecha y hora de Lima, quién la sacó, la guía y dónde estaba el teléfono."
          affects="Salen en el papel de la guía y en la ficha del permiso. Sólo las ve alguien con sesión en tu negocio."
          example="Al pie de la pila: la foto del rollizo con su codificación es lo que sostiene el papel ante SERFOR."
        />
      </div>

      {fotos.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {fotos.map((f, i) => {
            const mapa = urlMapaDeFoto(f);
            return (
              <li key={f.url} className="w-32">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- privada: pasa por /fotos/ver con sesión */}
                  <img
                    src={srcDeFoto(f)}
                    alt={`Foto ${i + 1} de la carga`}
                    loading="lazy"
                    className="h-24 w-32 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] object-cover object-bottom"
                  />
                  <button
                    type="button"
                    onClick={() => onCambio(fotos.filter((x) => x.url !== f.url))}
                    disabled={disabled}
                    aria-label={`Quitar la foto ${i + 1}`}
                    className="absolute -right-1.5 -top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] transition-colors hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                {traeDatos(f) && (
                  <p className="mt-1 text-xs leading-snug text-[var(--text-secondary)]">{pieDeFoto(f)}</p>
                )}
                {mapa ? (
                  <a
                    href={mapa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline"
                    aria-label={`Ver en el mapa dónde se sacó la foto ${i + 1}`}
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> Ver en el mapa
                  </a>
                ) : (
                  traeDatos(f) && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Sin ubicación</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
