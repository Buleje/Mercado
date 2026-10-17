"use client";

/**
 * Quién pide, de a poco (pie de la bolsa). Nunca un formulario largo de golpe:
 *
 * 1. Sin nombre: «Continuar con Google» (si el negocio lo prendió y el sitio tiene
 *    Google) y debajo «o escribe tu nombre». Al volver de Google el nombre ya está
 *    y se ve «Hola, Ana» con su foto.
 * 2. Con nombre: aparece el celular (si el negocio lo pide).
 * 3. Con los dos: «Compartir mi ubicación» (opcional; sólo en Constitución, donde
 *    llevan el pedido a la casa: fuera va por agencia).
 *
 * Quien ya pidió antes en este navegador (nombre y celular recordados) ve UNA fila:
 * «Hola, Ana · 987 654 321 · Cambiar».
 */
import { useEffect, useState } from "react";
import { BotonGoogle, ChipCliente } from "@/components/store/cliente/BotonGoogle";
import {
  useClienteTienda,
  type UsoClienteTienda,
} from "@/components/store/cliente/use-cliente-tienda";
import { CampoCelular } from "@/components/store/cliente/CampoCelular";
import { CampoUbicacion } from "@/components/store/cliente/CampoUbicacion";
import { formatearCelularPe, normalizarCelularPe } from "@/lib/tienda-cliente/celular";
import type { ConfigPedidosCliente } from "@/lib/tienda-cliente/contrato";
import { rutaConBolsa, type Pedido } from "./estado-bolsa";
import { PUEBLO_SIN_COSTO } from "./pedido-whatsapp";

export const CAMPO_MUSA =
  "mu-foco h-12 w-full rounded-[var(--mu-radio-control)] border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] placeholder:text-[var(--text-tertiary)] hover:border-[var(--mu-nude-fuerte)] focus:border-[var(--mu-foco)] aria-invalid:border-[var(--mu-encargo)]";
const SECUNDARIO =
  "mu-foco rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:border-[var(--mu-nude-fuerte)] hover:bg-[var(--mu-nude-claro)]";
const ENLACE = "mu-foco rounded-full text-[var(--text-primary)] underline-offset-4 hover:underline";
const AYUDA = "text-[var(--text-secondary)] empty:hidden";
const ERROR = "font-semibold text-[var(--mu-encargo)]";

/** ¿Ya están los datos que el negocio pide? (El pie decide con esto qué falta.) */
export function faltaDato(
  pedido: Pedido,
  config: ConfigPedidosCliente,
): "nombre" | "celular" | null {
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

/**
 * Con Google prendido, la cuenta se pregunta al servidor (`/api/tienda-cliente/yo`: la
 * cookie de Supabase es httpOnly) SÓLO al abrir la bolsa, no en cada página de la tienda.
 */
export function DatosCliente(props: PropsDatos) {
  return props.config.loginGoogle ? <ConGoogle {...props} /> : <Pasos {...props} google={null} />;
}

function ConGoogle(props: PropsDatos) {
  const google = useClienteTienda();
  return <Pasos {...props} google={google} />;
}

function Pasos({
  pedido,
  config,
  idNombre,
  idCelular,
  invalido,
  alEscribir,
  google,
}: PropsDatos & { google: UsoClienteTienda | null }) {
  const { gps } = pedido;
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
  // Volvió de Google (la cuenta llega un instante después de abrir): su nombre entra solo
  // y, si el celular ya estaba guardado, queda la fila compacta. Sólo cuando aparece la
  // cuenta, no a cada tecla.
  const nombreGoogle = cliente?.nombre.trim() ?? "";
  useEffect(() => {
    if (!nombreGoogle) return;
    pedido.setNombre(nombreGoogle);
    if (!config.pedirCelular || normalizarCelularPe(pedido.celular) !== null) setCompacto(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreGoogle]);

  // Google mientras no haya nombre: al escribir la primera letra se va (el campo no pierde el foco).
  const ofreceGoogle =
    google !== null && google.disponible && !google.cargando && !cliente && !pedido.nombre.trim();
  const pideUbicacion = config.pedirUbicacion && pedido.pueblo === PUEBLO_SIN_COSTO && listos;
  const celular = formatearCelularPe(pedido.celular);

  return (
    <div className="flex flex-col gap-2.5">
      {compacto ? (
        <div className="flex min-h-12 items-center gap-3">
          <Inicial nombre={pedido.nombre} foto={cliente?.avatar ?? null} />
          <p className="min-w-0 flex-1 truncate text-base text-[var(--text-primary)]">
            Hola, <strong className="font-semibold">{pedido.nombre.split(/\s+/)[0]}</strong>
            {config.pedirCelular && (
              <span className="text-[var(--text-secondary)]"> · {celular}</span>
            )}
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
              className="text-[var(--text-primary)] [&_img]:ring-1 [&_img]:ring-[var(--rule-base)]"
              claseSalir={`${ENLACE} font-semibold`}
            />
          ) : (
            <>
              {ofreceGoogle && google && (
                <BotonGoogle
                  entrar={google.entrarConGoogle}
                  volverA={typeof window === "undefined" ? undefined : rutaConBolsa()}
                  className={`${SECUNDARIO} rounded-full font-semibold`}
                  claseError={ERROR}
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
                  alEscribir();
                }}
                autoComplete="name"
                maxLength={60}
                placeholder={ofreceGoogle ? "o escribe tu nombre" : "Tu nombre"}
                aria-invalid={invalido === "nombre" || undefined}
                className={CAMPO_MUSA}
              />
            </>
          )}
          {config.pedirCelular && pedido.nombre.trim() && (
            <CampoCelular
              id={idCelular}
              valor={pedido.celular}
              onCambio={(crudo) => {
                pedido.setCelular(crudo);
                alEscribir();
              }}
              ayuda=""
              claseEtiqueta="text-sm font-semibold text-[var(--text-secondary)]"
              claseInput={CAMPO_MUSA}
              claseAyuda={AYUDA}
              claseError={ERROR}
              className={
                invalido === "celular" ? "[&_input]:border-[var(--mu-encargo)]" : undefined
              }
            />
          )}
        </>
      )}
      {pideUbicacion && (
        <CampoUbicacion
          gps={gps}
          ayuda=""
          claseEtiqueta="sr-only"
          claseBoton={`${ENLACE} w-auto justify-start self-start rounded-full border-0 px-1 font-semibold text-[var(--mu-acento-tinta)]`}
          claseSecundario={`${ENLACE} text-[var(--text-secondary)]`}
          claseAyuda="sr-only"
          claseError={ERROR}
          className="gap-0 text-[var(--text-primary)]"
        />
      )}
    </div>
  );
}

/** La foto de Google o la inicial en un círculo nude (36 px). */
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
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--rule-base)]"
      />
    );
  return (
    <span
      aria-hidden="true"
      className="mu-serif inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mu-nude-claro)] text-lg text-[var(--mu-acento-tinta)]"
    >
      {nombre.trim().charAt(0).toUpperCase()}
    </span>
  );
}
