"use client";

/**
 * Quién pide, de a poco (pie de la bolsa en modo WhatsApp, ADR-511; el de Musa
 * sin pueblos fijos). Nunca un formulario largo de golpe:
 *
 * 1. Sin nombre: «Continuar con Google» (si el negocio lo prendió en Ajustes y el
 *    sitio tiene Google) y debajo «o escribe tu nombre». Al volver de Google
 *    (`?bolsa=1`) el nombre ya está.
 * 2. Con nombre: el celular (si el negocio lo pide).
 * 3. Con los dos: «Compartir mi ubicación» (si el negocio la pide y no pasa a recoger).
 *
 * Quien ya pidió antes en este navegador (lo recuerda `usePedido` por negocio)
 * ve UNA fila: «Hola, Ana · 987 654 321 · Cambiar».
 */
import { useEffect, useState } from "react";
import { ChipCliente } from "@/components/store/cliente/BotonGoogle";
import { CampoCelular } from "@/components/store/cliente/CampoCelular";
import { CampoUbicacion } from "@/components/store/cliente/CampoUbicacion";
import { IngresoGoogle } from "@/components/store/cliente/IngresoGoogle";
import { useClienteTienda, type UsoClienteTienda } from "@/components/store/cliente/use-cliente-tienda";
import { formatearCelularPe, normalizarCelularPe } from "@/lib/tienda-cliente/celular";
import type { ConfigPedidosCliente } from "@/lib/tienda-cliente/contrato";
import { rutaConBolsa, type Pedido } from "./estado-bolsa";
import { RECOJO } from "./pedido-whatsapp";
import { inicialDe } from "./ui";

export const CAMPO =
  "ti-foco h-12 w-full rounded-[var(--ti-radio-control)] border border-[var(--ti-linea)] bg-[var(--ti-fondo)] px-4 text-base text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] placeholder:text-[var(--ti-texto-3)] hover:border-[var(--ti-texto-3)] focus:border-[var(--ti-texto)] aria-invalid:border-2 aria-invalid:border-[var(--ti-texto)]";
export const ENLACE = "ti-foco rounded-full text-[var(--ti-texto)] underline-offset-4 hover:underline";
const SECUNDARIO =
  "ti-foco rounded-full border border-[var(--ti-linea)] bg-[var(--ti-fondo)] text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)]";
const AYUDA = "text-[var(--ti-texto-2)] empty:hidden";
const ERROR = "font-semibold text-[var(--ti-texto)]";

/** ¿Ya están los datos que el negocio pide? (El pie decide con esto qué falta.) */
export function faltaDato(pedido: Pick<Pedido, "nombre" | "celular">, config: Pick<ConfigPedidosCliente, "pedirCelular">): "nombre" | "celular" | null {
  if (!pedido.nombre.trim()) return "nombre";
  if (config.pedirCelular && normalizarCelularPe(pedido.celular) === null) return "celular";
  return null;
}

interface PropsDatos {
  pedido: Pedido;
  config: ConfigPedidosCliente;
  idNombre: string;
  idCelular: string;
  invalido: "nombre" | "celular" | null;
  alEscribir: () => void;
}

/** Con Google prendido, la cuenta se pregunta al servidor SÓLO al abrir la bolsa (no en cada página). */
export function DatosCliente(props: PropsDatos) {
  return props.config.loginGoogle ? <ConGoogle {...props} /> : <Pasos {...props} google={null} />;
}

function ConGoogle(props: PropsDatos) {
  const google = useClienteTienda();
  return <Pasos {...props} google={google} />;
}

function Pasos({ pedido, config, idNombre, idCelular, invalido, alEscribir, google }: PropsDatos & { google: UsoClienteTienda | null }) {
  const cliente = google?.cliente ?? null;
  const listos = faltaDato(pedido, config) === null;
  // Al abrir: si ya pidió antes (o volvió de Google con su celular guardado), una sola fila.
  const [compacto, setCompacto] = useState(listos);
  const [enfocar, setEnfocar] = useState<string | null>(null);
  useEffect(() => {
    if (!enfocar) return;
    document.getElementById(enfocar)?.focus();
    setEnfocar(null);
  }, [enfocar]);
  // Volvió de Google: su nombre entra solo (sólo cuando aparece la cuenta, no a cada tecla).
  const nombreGoogle = cliente?.nombre.trim() ?? "";
  useEffect(() => {
    if (!nombreGoogle) return;
    pedido.setNombre(nombreGoogle);
    if (!config.pedirCelular || normalizarCelularPe(pedido.celular) !== null) setCompacto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreGoogle]);
  // Los datos recordados llegan un instante después de montar: si completan todo sin que
  // hayas escrito, la fila compacta (mientras escribes, nunca se pliega sola).
  const [tocado, setTocado] = useState(false);
  const [vioListos, setVioListos] = useState(listos);
  if (listos && !vioListos) {
    setVioListos(true);
    if (!tocado) setCompacto(true);
  }
  const escribir = () => {
    setTocado(true);
    alEscribir();
  };

  const ofreceGoogle = google !== null && google.disponible && !google.cargando && !cliente && !pedido.nombre.trim();
  const pideUbicacion = config.pedirUbicacion && pedido.entrega.trim() !== RECOJO && listos;

  return (
    <div className="flex flex-col gap-2.5">
      {compacto && listos ? (
        <div className="flex min-h-12 items-center gap-3">
          <Inicial nombre={pedido.nombre} foto={cliente?.avatar ?? null} />
          <p className="min-w-0 flex-1 truncate text-base text-[var(--ti-texto)]">
            Hola, <strong className="font-semibold">{pedido.nombre.trim().split(/\s+/)[0]}</strong>
            {config.pedirCelular && <span className="text-[var(--ti-texto-2)]"> · {formatearCelularPe(pedido.celular)}</span>}
          </p>
          <button
            type="button"
            onClick={() => {
              setCompacto(false);
              setEnfocar(cliente ? idCelular : idNombre);
            }}
            aria-label="Cambiar tu nombre o tu celular"
            className={`${ENLACE} h-12 shrink-0 px-2 text-sm font-semibold`}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          {cliente ? (
            <ChipCliente
              cliente={cliente}
              onSalir={google?.salir}
              className="text-[var(--ti-texto)] [&_img]:ring-1 [&_img]:ring-[var(--ti-linea)]"
              claseSalir={`${ENLACE} font-semibold`}
            />
          ) : (
            <>
              {ofreceGoogle && google && (
                <IngresoGoogle
                  entrar={google.entrarConGoogle}
                  volverA={typeof window === "undefined" ? undefined : rutaConBolsa()}
                  className={`${SECUNDARIO} font-semibold`}
                  claseError={ERROR}
                  claseEnlace={ENLACE}
                />
              )}
              <label htmlFor={idNombre} className="sr-only">
                Tu nombre
              </label>
              <input
                id={idNombre}
                value={pedido.nombre}
                onChange={(e) => {
                  pedido.setNombre(e.target.value);
                  escribir();
                }}
                autoComplete="name"
                maxLength={60}
                placeholder={ofreceGoogle ? "o escribe tu nombre" : "Tu nombre"}
                aria-invalid={invalido === "nombre" || undefined}
                className={CAMPO}
              />
            </>
          )}
          {config.pedirCelular && pedido.nombre.trim() && (
            <CampoCelular
              id={idCelular}
              valor={pedido.celular}
              onCambio={(crudo) => {
                pedido.setCelular(crudo);
                escribir();
              }}
              ayuda=""
              claseEtiqueta="text-sm font-semibold text-[var(--ti-texto-2)]"
              claseInput={CAMPO}
              claseAyuda={AYUDA}
              claseError={ERROR}
              className={invalido === "celular" ? "[&_input]:border-2 [&_input]:border-[var(--ti-texto)]" : undefined}
            />
          )}
        </>
      )}
      {pideUbicacion && (
        <CampoUbicacion
          gps={pedido.gps}
          ayuda=""
          claseEtiqueta="sr-only"
          claseBoton={`${ENLACE} w-auto justify-start self-start rounded-full border-0 px-1 font-semibold`}
          claseSecundario={`${ENLACE} text-[var(--ti-texto-2)]`}
          claseAyuda="sr-only"
          claseError={ERROR}
          className="gap-0 text-[var(--ti-texto)]"
        />
      )}
    </div>
  );
}

/** La foto de Google o la inicial en un círculo gris (36 px). */
function Inicial({ nombre, foto }: { nombre: string; foto: string | null }) {
  const [rota, setRota] = useState(false);
  if (foto && !rota)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto de Google (dominio externo, sin optimizar)
      <img
        src={foto}
        alt=""
        width={36}
        height={36}
        referrerPolicy="no-referrer"
        onError={() => setRota(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--ti-linea)]"
      />
    );
  return (
    <span aria-hidden="true" className="ti-nombre inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ti-suave)] text-lg text-[var(--ti-texto)]">
      {inicialDe(nombre)}
    </span>
  );
}
