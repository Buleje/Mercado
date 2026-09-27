"use client";

/**
 * La tarjeta de una troza — lo que se ve al escanear el QR chico de su etiqueta
 * (`/admin/q/<id>`) con el celular, con internet y sesión.
 *
 * Brandon (2026-09-26): «quiero que el texto sea tipo formato imagen, bien
 * presentado». Antes el QR abría el libro entero con la ficha modal encima: en
 * un celular, en el patio, eran 133 pestañas cargando para leer cinco datos.
 * Esto es la troza de un vistazo —marca, especie, medidas, dónde está, de qué
 * papeles viene y la foto de su carga— y dos salidas: armar un lote con ella o
 * abrir su historia completa en el libro.
 *
 * `data-area="admin"`: la escala de texto y los tokens del panel (y los modales
 * en portal, que los copian de ahí) sin montar el shell del panel.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { Ban, BookOpen, Layers } from "@buleje/design-system/icons";
import { useFichaTroza } from "@/hooks/use-ficha-troza";
import { esSinCodigo } from "@/lib/forestal/consumo-trozas";
import { codigoDeEtiqueta } from "@/lib/forestal/ficha-texto-troza";
import { rutaFichaDeTroza } from "@/lib/forestal/ctp-troza-url";
import { formatNumber } from "@/lib/format";
import {
  estadoDeTroza,
  fotosDeTarjeta,
  m3DeTarjeta,
  medidasDeTarjeta,
  motivoSinLote,
  ptDeTarjeta,
  trozaRecibida,
  type FichaTrozaTarjeta,
} from "@/lib/forestal/tarjeta-troza";
import { fechaDelLibro } from "../permiso-volumen-ui";
import TarjetaHero from "./TarjetaHero";
import TarjetaMedidas from "./TarjetaMedidas";
import TarjetaDatos, { type DatoTarjeta } from "./TarjetaDatos";
import TarjetaFoto from "./TarjetaFoto";
import ArmarLoteDesdeTarjeta from "./ArmarLoteDesdeTarjeta";
import {
  BOTON_PRIMARIO,
  BOTON_SECUNDARIO,
  TarjetaError,
  TarjetaEsqueleto,
  TarjetaNoEncontrada,
} from "./TarjetaEstados";

/** «jueves 10/09», o por qué no hay fecha de llegada. */
function llegada(f: FichaTrozaTarjeta): string {
  if (f.troza.noRecepcionada) return "no bajó del camión";
  const fecha = f.troza.fechaRecepcion ?? f.ingreso.fechaRecepcion;
  if (fecha) return fechaDelLibro(fecha);
  /* Validada en el libro sin fecha de descarga: llegó, pero nadie anotó cuándo. */
  return trozaRecibida(f) ? "sí, sin fecha anotada" : "guía sin recibir";
}

function datosDe(f: FichaTrozaTarjeta): DatoTarjeta[] {
  return [
    { rotulo: "N° de registro", valor: f.ingreso.libroNro != null ? String(f.ingreso.libroNro) : null, codigo: true },
    { rotulo: "GTF", valor: f.ingreso.gtfNumber, codigo: true },
    { rotulo: "Constancia SNIFFS", valor: f.ingreso.constanciaSniffs ?? null, codigo: true },
    { rotulo: "Llegó al patio", valor: llegada(f) },
    { rotulo: "Titular", valor: f.ingreso.proveedor ?? null, ancho: true },
    { rotulo: "Permiso", valor: f.ingreso.permiso ?? null, codigo: true, ancho: true },
    { rotulo: "Resolución", valor: f.ingreso.resolucion ?? null, ancho: true },
  ];
}

function Tarjeta({
  f,
  onArmar,
  botonArmarRef,
}: {
  f: FichaTrozaTarjeta;
  onArmar: () => void;
  botonArmarRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = f.troza;
  const codigo = codigoDeEtiqueta(t);
  const bosque = t.codificacion?.trim() || null;
  const estado = estadoDeTroza(f);
  const motivo = motivoSinLote(f);
  const fotos = fotosDeTarjeta(f);
  const sinExtremos = t.d1Cm == null && t.d2Cm == null && t.diametroCm != null;

  useEffect(() => {
    document.title = `Troza ${codigo}${t.especieComun ? ` · ${t.especieComun}` : ""} | Buleje`;
  }, [codigo, t.especieComun]);

  return (
    <>
      <article
        className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-lg"
        data-troza-tarjeta={t.id}
      >
        <TarjetaHero
          codigo={codigo}
          bosque={bosque && !esSinCodigo({ codificacion: bosque }) && bosque !== codigo ? bosque : null}
          especie={t.especieComun}
          cientifica={t.especieCientifica ?? null}
          estado={estado}
        />
        <div className="grid lg:grid-cols-2">
          <div className="lg:col-start-1 lg:row-start-1">
            <TarjetaMedidas
              medidas={medidasDeTarjeta(t)}
              diametroUnico={sinExtremos ? formatNumber(Number(t.diametroCm), { max: 1 }) : null}
              pt={ptDeTarjeta(t)}
              m3={m3DeTarjeta(t)}
              medidoEnPlanta={Boolean(t.d1d2MedidoEnPlanta)}
            />
          </div>
          <div className="border-t border-[var(--rule-soft)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-t-0">
            <TarjetaDatos datos={datosDe(f)} />
          </div>
          {fotos.length > 0 && (
            <div className="border-t border-[var(--rule-soft)] lg:col-start-1 lg:row-start-2">
              <TarjetaFoto fotos={fotos} />
            </div>
          )}
        </div>
      </article>

      {/* En el celular las salidas quedan al alcance del pulgar mientras se baja. */}
      <div className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-[var(--rule-base)] bg-[var(--surface-canvas)]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {motivo && (
          <p className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)] sm:justify-end">
            <Ban className="h-4 w-4 shrink-0" aria-hidden /> Sin lote: {motivo.charAt(0).toLowerCase() + motivo.slice(1)}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          {!motivo && (
            <button ref={botonArmarRef} type="button" onClick={onArmar} className={BOTON_PRIMARIO}>
              <Layers className="h-5 w-5" aria-hidden /> Armar un lote con esta troza
            </button>
          )}
          <Link href={rutaFichaDeTroza(t.id)} className={BOTON_SECUNDARIO}>
            <BookOpen className="h-5 w-5" aria-hidden /> Ver en el libro
          </Link>
        </div>
      </div>
    </>
  );
}

export default function TrozaTarjetaPagina({ id, idValido }: { id: string; idValido: boolean }) {
  const { estado, recargar } = useFichaTroza(idValido ? id : null);
  const [armando, setArmando] = useState(false);
  const botonArmar = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  /* El modal se desmonta al cerrar y Radix devolvía el foco al <body> (medido
     con Escape): quien va con teclado perdía el lugar. Vuelve al botón, en un
     `setTimeout` para correr DESPUÉS del de Radix. */
  useEffect(() => {
    if (armando || !devolverFoco.current) return;
    devolverFoco.current = false;
    const t = setTimeout(() => botonArmar.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [armando]);

  return (
    <main
      data-area="admin"
      className="min-h-dvh bg-[var(--surface-sunken)] px-3 pb-6 pt-4 sm:px-6 sm:pb-10 sm:pt-8 dark:bg-[var(--surface-canvas)]"
    >
      <div className="mx-auto w-full max-w-[30rem] lg:max-w-[60rem]">
        {estado.fase === "cargando" && <TarjetaEsqueleto />}
        {estado.fase === "no_encontrada" && <TarjetaNoEncontrada idValido={idValido} />}
        {estado.fase === "error" && <TarjetaError motivo={estado.motivo} id={id} onReintentar={recargar} />}
        {estado.fase === "lista" && <Tarjeta f={estado.ficha} onArmar={() => setArmando(true)} botonArmarRef={botonArmar} />}
      </div>

      {armando && estado.fase === "lista" && (
        <ArmarLoteDesdeTarjeta
          trozaId={estado.ficha.troza.id}
          onClose={() => {
            devolverFoco.current = true;
            setArmando(false);
            /* Si entró a un lote, la pastilla tiene que decirlo. */
            recargar();
          }}
        />
      )}
    </main>
  );
}
