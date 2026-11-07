"use client";

import { useState } from "react";
import { Lock, Hash, Grid3x3, KeyRound, ArrowLeft } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { NOMBRE_TIPO, PATRON_MIN, PIN_MAX, PIN_MIN, CONTRASENA_MIN, type ReauthEntrada, type TipoCandado } from "@/lib/superadmin/candado-reglas";
import { EntradaSecreto } from "@/components/superadmin/tenants/CandadoEntrada";
import { CandadoReautenticar } from "@/components/superadmin/tenants/CandadoReautenticar";
import type { CandadoCerrado } from "@/components/superadmin/tenants/useCredencialesTienda";

type Paso = "actual" | "elegir" | "nuevo" | "repetir" | "confirmar" | "abrir";

const OPCIONES: { tipo: TipoCandado; icono: typeof Lock; detalle: string }[] = [
  { tipo: "pin", icono: Hash, detalle: `${PIN_MIN} a ${PIN_MAX} números` },
  { tipo: "patron", icono: Grid3x3, detalle: `Une ${PATRON_MIN} o más puntos` },
  { tipo: "contrasena", icono: KeyRound, detalle: `${CONTRASENA_MIN} caracteres o más` },
];

const horaCorta = (ms: number) => new Date(ms).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

const ENLACE = "inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--accent)]";

/**
 * El candado de la pestaña «Credenciales». Cuatro situaciones:
 *  - sin candado: elegir tipo (PIN, patrón o contraseña), ponerlo, repetirlo y
 *    confirmar con la contraseña de superadmin (+ 2FA si lo tiene);
 *  - con candado: pedirlo para abrir 5 minutos;
 *  - «Olvidé mi candado»: el mismo asistente, y la confirmación pisa el candado;
 *  - `cambiar`: pide el actual y vuelve a correr el asistente (sin confirmación).
 */
export function CandadoCredenciales({
  candado,
  cambiar = false,
  onAbrir,
  onConfigurar,
  onCancelar,
}: {
  candado: CandadoCerrado;
  cambiar?: boolean;
  onAbrir: (secreto: string) => Promise<string | null>;
  onConfigurar: (tipo: TipoCandado, secreto: string, actual?: string, reauth?: ReauthEntrada) => Promise<string | null>;
  onCancelar?: () => void;
}) {
  const inicial: Paso = !candado.configurado ? "elegir" : cambiar ? "actual" : "abrir";
  const [paso, setPaso] = useState<Paso>(inicial);
  const [recuperar, setRecuperar] = useState(false);
  const [tipo, setTipo] = useState<TipoCandado | null>(null);
  const [actual, setActual] = useState<string | undefined>(undefined);
  const [primero, setPrimero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** Cambia en cada intento para remontar la entrada (borra lo escrito). */
  const [intento, setIntento] = useState(0);

  // La vista se remonta cada vez que el servidor responde: el instante de montaje alcanza.
  const [montado] = useState(() => Date.now());
  const bloqueado = candado.bloqueadoHasta != null && candado.bloqueadoHasta > montado;

  const correr = async (fn: () => Promise<string | null>) => {
    setOcupado(true);
    setError(null);
    const e = await fn();
    setOcupado(false);
    if (e) {
      setError(e);
      setIntento((i) => i + 1);
    }
    return e;
  };

  const olvide = () => {
    setRecuperar(true);
    setError(null);
    setPaso("elegir");
  };

  const nombre = NOMBRE_TIPO[tipo ?? "pin"].toLowerCase();
  const titulo =
    paso === "abrir"
      ? "Credenciales bajo candado"
      : paso === "actual"
        ? "Primero, tu candado actual"
        : paso === "confirmar"
          ? "Confirma que eres tú"
          : paso === "elegir"
            ? recuperar ? "Pon un candado nuevo" : cambiar ? "Elige el candado nuevo" : "Configura tu candado"
            : paso === "nuevo"
              ? `Pon tu ${nombre}`
              : `Repite tu ${nombre}`;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)]">
        <Lock className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-bold text-[var(--text-primary)]">{titulo}</h3>
        <InfoTip
          title="Candado de credenciales"
          what="Un candado tuyo, aparte de tu sesión, para ver quién entra a cada tienda, generar contraseñas, entrar como la tienda y tocar su seguridad."
          affects="Se abre 5 minutos y se cierra solo. 5 intentos fallidos lo bloquean 15 minutos, y cada bloqueo seguido dura el doble (hasta 24 h). Ponerlo o recuperarlo pide tu contraseña de superadmin (y tu 2FA si lo tienes). Todo queda en la auditoría."
          example="Las contraseñas de las tiendas no se pueden leer (se guardan cifradas sin vuelta atrás): desde acá generas una nueva que se muestra una sola vez."
        />
      </div>

      {bloqueado && (paso === "abrir" || paso === "actual") ? (
        <p className="text-sm font-semibold text-[var(--data-error-600)]">
          Bloqueado por intentos fallidos hasta las {horaCorta(candado.bloqueadoHasta ?? 0)}.
        </p>
      ) : paso === "elegir" ? (
        <div className="grid w-full grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de candado">
          {OPCIONES.map(({ tipo: t, icono: Icono, detalle }) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => {
                setTipo(t);
                setError(null);
                setPaso("nuevo");
              }}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 hover:border-[var(--accent)] focus-visible:border-[var(--accent)] outline-none"
            >
              <Icono className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <span className="text-sm font-bold text-[var(--text-primary)]">{NOMBRE_TIPO[t]}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{detalle}</span>
            </button>
          ))}
        </div>
      ) : paso === "confirmar" ? (
        <CandadoReautenticar
          key={`confirmar-${intento}`}
          totpActivo={candado.totpActivo}
          textoBoton={recuperar ? "Cambiar el candado" : "Guardar candado"}
          ocupado={ocupado}
          onListo={(ra) => void correr(() => onConfigurar(tipo ?? "pin", primero, undefined, ra))}
        />
      ) : paso === "abrir" || paso === "actual" ? (
        <EntradaSecreto
          key={`${paso}-${intento}`}
          tipo={candado.tipo ?? "pin"}
          etiqueta={`Tu ${NOMBRE_TIPO[candado.tipo ?? "pin"].toLowerCase()}`}
          textoBoton={paso === "abrir" ? "Abrir" : "Seguir"}
          ocupado={ocupado}
          onListo={(s) => {
            if (paso === "actual") {
              setActual(s);
              setPaso("elegir");
              return;
            }
            void correr(() => onAbrir(s));
          }}
        />
      ) : (
        <EntradaSecreto
          key={`${paso}-${intento}`}
          tipo={tipo ?? "pin"}
          etiqueta={paso === "nuevo" ? "El candado nuevo" : "Repítelo para confirmar"}
          textoBoton={paso === "nuevo" ? "Seguir" : actual ? "Guardar candado" : "Seguir"}
          ocupado={ocupado}
          validarReglas
          onListo={(s) => {
            if (paso === "nuevo") {
              setPrimero(s);
              setError(null);
              setPaso("repetir");
              return;
            }
            if (s !== primero) {
              setError("No coincide con el primero. Vuelve a ponerlo.");
              setPrimero("");
              setPaso("nuevo");
              setIntento((i) => i + 1);
              return;
            }
            // Primera vez o recuperación: falta confirmar con la contraseña (+ 2FA).
            if (!actual) {
              setError(null);
              setPaso("confirmar");
              return;
            }
            void correr(() => onConfigurar(tipo ?? "pin", s, actual)).then((e) => {
              // El actual errado vuelve al primer paso del cambio.
              if (e) {
                setActual(undefined);
                setPaso("actual");
              }
            });
          }}
        />
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-600)]">
          {error}
        </p>
      )}

      {(paso === "abrir" || (paso === "actual" && bloqueado)) && (
        <button type="button" onClick={olvide} className={ENLACE}>
          Olvidé mi candado
        </button>
      )}
      {(paso === "nuevo" || paso === "repetir" || paso === "confirmar") && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPaso("elegir");
            setPrimero("");
          }}
          className={ENLACE}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Elegir otro tipo
        </button>
      )}
      {((cambiar && onCancelar && paso !== "nuevo" && paso !== "repetir") || (recuperar && paso === "elegir")) && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (recuperar && !cambiar) {
              setRecuperar(false);
              setPaso(candado.configurado ? "abrir" : "elegir");
            } else onCancelar?.();
          }}
          className={ENLACE}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Cancelar
        </button>
      )}
    </div>
  );
}
