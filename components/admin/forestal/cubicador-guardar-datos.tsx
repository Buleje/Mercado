"use client";

/**
 * Columna «Datos» del modal «Guardar cubicación» (Brandon 24-10): nombre,
 * fecha, a quién se vende, de qué CCNN salió la madera, permiso, GTF, camión,
 * destino, lugar y notas. Comprador y comunidad salen del Directorio o se
 * escriben a mano; si el nombre coincide con una ficha, queda atada. El que
 * no está en el Directorio se da de alta con «+ Nuevo» (28-10) sin salir; lo
 * mismo el chofer, la placa, el lugar donde se cubicó y quien cubicó. La placa
 * trae el chofer y el transportista de la última vez, «Igual que la anterior»
 * copia los datos del viaje, y un comprador escrito a mano se agrega al
 * Directorio o se manda a su cuenta con un toque (28-10).
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, Copy, UserCheck, UserPlus, Wallet } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatearPlaca, type Parte } from "@/lib/forestal/directorio";
import { FICHA_MAX, type FichaCubicacion } from "@/lib/forestal/cubicacion-registro";
import { CAMPO_CUENTA as CAMPO, ETIQUETA_CUENTA as ETIQUETA } from "./cubicacion-cuenta-persona";
import type { DatosDeLaCubicacion } from "./cubicador-guardar-tipos";
import { AltaEnElDirectorio, BotonNuevo, type CampoDeAlta } from "./cubicador-guardar-alta";
import AvisoDeLaGuia from "./cubicador-guardar-aviso-guia";
import type { CelularDelComprador } from "./hooks/use-celular-del-comprador";
import { useFichaDesdeGuia } from "./hooks/use-ficha-desde-guia";
import { useViajeDeLaFicha, type AvisoDelViaje } from "./hooks/use-viaje-de-la-ficha";
import { avisarPersonasCambiaron } from "./hooks/use-cubicaciones-trozas";
import type { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";

type Libreta = ReturnType<typeof useLibretaDeLaFicha>;
type Actualizar = (fn: (d: DatosDeLaCubicacion) => DatosDeLaCubicacion) => void;

const DEL_DIRECTORIO =
  "ml-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/12 px-2 py-0.5 align-middle text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]";

/** `tip` va FUERA del `<label>`: un ⓘ dentro de la etiqueta lo toca al hacer clic en ella. */
function Campo({ id, etiqueta, ancho, extra, tip, children }: { id: string; etiqueta: string; ancho?: boolean; extra?: ReactNode; tip?: ReactNode; children: ReactNode }) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      {tip ? (
        <div className="mb-1 flex items-center gap-1.5 [&>label]:mb-0">
          <label htmlFor={id} className={ETIQUETA}>{etiqueta}{extra}</label>
          {tip}
        </div>
      ) : <label htmlFor={id} className={ETIQUETA}>{etiqueta}{extra}</label>}
      {children}
    </div>
  );
}

function Sugerencias({ id, opciones }: { id: string; opciones: readonly string[] }) {
  if (opciones.length === 0) return null;
  return <datalist id={id}>{opciones.map((o) => <option key={o} value={o} />)}</datalist>;
}

/** Campo + «+ Nuevo» en una fila: el campo se achica, el botón no. */
const ConNuevo = ({ children }: { children: ReactNode }) => <div className="flex gap-2 [&>input]:min-w-0 [&>input]:flex-1">{children}</div>;

const Atada = () => <span className={DEL_DIRECTORIO}><UserCheck className="h-3.5 w-3.5" /> Del Directorio</span>;

const DESHACER = button({ variant: "ghost", className: "h-9 rounded-md px-2 font-bold underline underline-offset-2" });
const SECUNDARIO = button({ variant: "secondary", className: "gap-2" });

/** Lo que se llenó solo (la anterior o la placa), con su «Deshacer». */
function AvisoViaje({ aviso, onDeshacer }: { aviso: AvisoDelViaje; onDeshacer: () => void }) {
  return (
    <p role="status" data-aviso-viaje={aviso.donde}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
      <Check className="h-4 w-4 shrink-0" aria-hidden />
      <span>{aviso.texto}</span>
      <button type="button" onClick={onDeshacer} className={DESHACER}>Deshacer</button>
    </p>
  );
}

export default function DatosDeGuardar({ datos, actualizar, nombreSugerido, libreta, celular, actualizando = null, aLaCuenta = null }: {
  datos: DatosDeLaCubicacion;
  actualizar: Actualizar;
  nombreSugerido: string;
  libreta: Libreta;
  /** Celular del comprador, si su ficha del Directorio no lo tiene. */
  celular?: CelularDelComprador;
  /** El nombre de la guardada que se actualiza («Igual que la anterior» no se copia de ella). */
  actualizando?: string | null;
  /** «Subir a la cuenta de …»: el comprador a «Cuenta de un tercero» (null = no hay cuenta o ya está ahí). */
  aLaCuenta?: { nombre: string; onClick: () => void } | null;
}) {
  const { ficha } = datos;
  const [alta, setAlta] = useState<CampoDeAlta | null>(null);
  const guia = useFichaDesdeGuia(datos, actualizar, libreta);
  const ponerFicha = (patch: Partial<FichaCubicacion>) => actualizar((d) => ({ ...d, ficha: { ...d.ficha, ...patch } }));
  const viaje = useViajeDeLaFicha({
    ficha, ponerFicha: (f) => actualizar((d) => ({ ...d, ficha: f })), actualizando, vehiculos: libreta.vehiculos, choferes: libreta.choferes,
  });
  /* El comprador escrito a mano (Blas 28-10: 3 de 3 así): sin ficha no tiene saldo ni cuenta. */
  const compradorSinFicha = !!datos.cliente.trim() && !ficha.clienteParteId && !libreta.cargando;
  /** Lo que ya se escribió en el campo, para que el alta arranque con ese nombre. */
  const escritoEn = (c: CampoDeAlta): string =>
    c === "comprador" ? (ficha.clienteParteId ? "" : datos.cliente)
    : c === "comunidad" ? (ficha.comunidadParteId ? "" : ficha.comunidad ?? "")
    : c === "placa" ? "" : ficha[c] ?? "";
  const texto = (k: keyof FichaCubicacion) => (e: { target: { value: string } }) => ponerFicha({ [k]: e.target.value });

  const alComprador = (v: string) => {
    const p = libreta.buscar(libreta.compradores, v);
    actualizar((d) => ({ ...d, cliente: v, ficha: { ...d.ficha, clienteParteId: p?.id } }));
  };
  const alComunidad = (v: string, elegida?: Parte) => {
    const p = elegida ?? libreta.buscar(libreta.comunidades, v);
    /* Con la ficha de la CCNN, su permiso (si todavía no escribiste uno). */
    const permiso = p ? libreta.permisoDe(p) : null;
    actualizar((d) => ({
      ...d,
      ficha: {
        ...d.ficha,
        comunidad: v,
        comunidadParteId: p?.id,
        ...(permiso && !d.ficha.tituloHabilitante?.trim() ? { tituloHabilitante: permiso } : {}),
      },
    }));
  };
  /** Lo que se dio de alta (o la ficha parecida que se eligió) queda puesto en su campo. */
  const alElegirDelAlta = (campo: Exclude<CampoDeAlta, "placa">, p: Parte) => {
    if (campo === "comprador") {
      actualizar((d) => ({ ...d, cliente: p.nombre, ficha: { ...d.ficha, clienteParteId: p.id } }));
      /* Recién dado de alta: «Cuenta de un tercero» lo tiene que ver en su lista. */
      avisarPersonasCambiaron();
    }
    else if (campo === "comunidad") alComunidad(p.nombre, p);
    else ponerFicha({ [campo]: p.nombre });
  };

  return (
    <section aria-labelledby="cubg-datos" className="min-w-0 space-y-3">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h3" id="cubg-datos">Datos</CardTitle>
        <InfoTip
          what="Con estos datos la encuentras después en Guardadas (busca por comprador, CCNN, placa o permiso)."
          affects="Comprador y comunidad salen del Directorio o los escribes a mano. Nada de esto reemplaza a la GTF ni al Libro."
        />
        {viaje.ofreceAnterior && viaje.anterior && (
          <button type="button" className={button({ variant: "secondary", className: "ml-auto gap-2" })} onClick={viaje.copiarAnterior}
            data-accion="igual-que-la-anterior" title={`Copia lugar, quién cubicó, placa, chofer y transportista de «${viaje.anterior.nombre}» (sólo en lo vacío)`}>
            <Copy className="h-4 w-4" aria-hidden /> Igual que la anterior
          </button>
        )}
      </div>
      {viaje.aviso?.donde === "anterior" && <AvisoViaje aviso={viaje.aviso} onDeshacer={viaje.deshacer} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="cubg-nombre" etiqueta="Nombre" ancho>
          <input id="cubg-nombre" className={CAMPO} value={datos.nombre} maxLength={120} placeholder={nombreSugerido}
            onChange={(e) => { const v = e.target.value; actualizar((d) => ({ ...d, nombre: v })); }} />
        </Campo>
        <Campo id="cubg-fecha" etiqueta="Fecha del trabajo">
          <input id="cubg-fecha" type="date" className={CAMPO} value={datos.fecha}
            onChange={(e) => { const v = e.target.value; if (v) actualizar((d) => ({ ...d, fecha: v })); }} />
        </Campo>
        <Campo id="cubg-gtf" etiqueta="N° de GTF">
          <input id="cubg-gtf" className={CAMPO} value={datos.gtf} maxLength={60} placeholder="Ej.: 0012345"
            onChange={(e) => { const v = e.target.value; actualizar((d) => ({ ...d, gtf: v })); }}
            onBlur={(e) => void guia.buscar(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guia.buscar(e.currentTarget.value); } }} />
        </Campo>
        {guia.aviso && <div className="sm:col-span-2"><AvisoDeLaGuia aviso={guia.aviso} onDeshacer={guia.deshacer} /></div>}
        <Campo id="cubg-comprador" etiqueta="¿A quién se le vende?" ancho extra={ficha.clienteParteId ? <Atada /> : null}
          tip={<InfoTip
            what="Sólo queda anotado: con él la buscas en Guardadas y sale en la hoja y en el WhatsApp."
            affects="No mueve plata. Para que el importe o el pietaje de esta madera vaya a la cuenta de una persona, prende «Cuenta de un tercero» (más abajo)."
            example="Le vendes a Maderas Ucayali y le descuentas de su adelanto: aquí «Maderas Ucayali»; abajo, su cuenta con «Se la entregas»." />}>
          <ConNuevo>
            <input id="cubg-comprador" className={CAMPO} value={datos.cliente} maxLength={120} list="cubg-compradores"
              placeholder="Elige del Directorio o escríbelo" autoComplete="off" onChange={(e) => alComprador(e.target.value)} />
            <BotonNuevo campo="comprador" onClick={() => setAlta("comprador")} />
          </ConNuevo>
          <Sugerencias id="cubg-compradores" opciones={libreta.nombresCompradores} />
          {(compradorSinFicha || aLaCuenta) && (
            <div className="mt-2 flex flex-wrap items-center gap-2" data-vista="comprador-acciones">
              {compradorSinFicha && (
                <button type="button" className={SECUNDARIO} onClick={() => setAlta("comprador")} data-accion="comprador-al-directorio"
                  title="Sin ficha en el Directorio no tiene saldo ni cuenta: agrégalo con este nombre">
                  <UserPlus className="h-4 w-4" aria-hidden /> Agregarlo al Directorio
                </button>
              )}
              {aLaCuenta && (
                <button type="button" className={SECUNDARIO} onClick={aLaCuenta.onClick} data-accion="subir-a-cuenta-comprador">
                  <Wallet className="h-4 w-4" aria-hidden /> Subir a la cuenta de {aLaCuenta.nombre}
                </button>
              )}
            </div>
          )}
        </Campo>
        {celular?.visible && (
          <Campo id="cubg-celular" etiqueta="Celular (para mandarle por WhatsApp)" ancho>
            <input id="cubg-celular" type="tel" inputMode="tel" className={CAMPO} value={celular.valor} maxLength={20}
              placeholder="Ej.: 987 654 321" autoComplete="off" aria-invalid={celular.invalido}
              onChange={(e) => celular.setValor(e.target.value)} />
            {celular.invalido && <p role="alert" className="mt-1 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">Son 9 dígitos y empieza en 9 (puedes poner +51).</p>}
            {!celular.invalido && <p className="mt-1 text-sm text-[var(--text-tertiary)]">Se anota en su ficha del Directorio al guardar.</p>}
          </Campo>
        )}
        <Campo id="cubg-comunidad" etiqueta="CCNN o de dónde salió la madera" ancho extra={ficha.comunidadParteId ? <Atada /> : null}>
          <ConNuevo>
            <input id="cubg-comunidad" className={CAMPO} value={ficha.comunidad ?? ""} maxLength={FICHA_MAX} list="cubg-comunidades"
              placeholder="Ej.: Comunidad Nativa San Luis de Chinchihuani" autoComplete="off" onChange={(e) => alComunidad(e.target.value)} />
            <BotonNuevo campo="comunidad" onClick={() => setAlta("comunidad")} />
          </ConNuevo>
          <Sugerencias id="cubg-comunidades" opciones={libreta.nombresComunidades} />
        </Campo>
        <Campo id="cubg-titulo" etiqueta="Título habilitante o permiso" ancho>
          <input id="cubg-titulo" className={CAMPO} value={ficha.tituloHabilitante ?? ""} maxLength={FICHA_MAX} list="cubg-permisos"
            placeholder="Ej.: 25-UCA/PER-FMC-2019-001" autoComplete="off" onChange={texto("tituloHabilitante")} />
          <Sugerencias id="cubg-permisos" opciones={libreta.permisos} />
        </Campo>
        <Campo id="cubg-placa" etiqueta="Placa">
          <ConNuevo>
            <input id="cubg-placa" className={`${CAMPO} uppercase placeholder:normal-case`} value={ficha.placa ?? ""} maxLength={FICHA_MAX} list="cubg-placas"
              placeholder="Ej.: ABC-123" autoComplete="off" onChange={(e) => viaje.alCambiarPlaca(e.target.value.toUpperCase())} />
            <BotonNuevo campo="placa" onClick={() => setAlta("placa")} />
          </ConNuevo>
          <Sugerencias id="cubg-placas" opciones={libreta.placas} />
        </Campo>
        <Campo id="cubg-transportista" etiqueta="Transportista">
          <ConNuevo>
            <input id="cubg-transportista" className={CAMPO} value={ficha.transportista ?? ""} maxLength={FICHA_MAX} list="cubg-transportistas"
              placeholder="Dueño del camión" autoComplete="off" onChange={texto("transportista")} />
            <BotonNuevo campo="transportista" onClick={() => setAlta("transportista")} />
          </ConNuevo>
          <Sugerencias id="cubg-transportistas" opciones={libreta.nombresTransportistas} />
        </Campo>
        {viaje.aviso?.donde === "placa" && <div className="sm:col-span-2"><AvisoViaje aviso={viaje.aviso} onDeshacer={viaje.deshacer} /></div>}
        <Campo id="cubg-chofer" etiqueta="Chofer">
          <ConNuevo>
            <input id="cubg-chofer" className={CAMPO} value={ficha.chofer ?? ""} maxLength={FICHA_MAX} list="cubg-choferes"
              autoComplete="off" onChange={texto("chofer")} />
            <BotonNuevo campo="chofer" onClick={() => setAlta("chofer")} />
          </ConNuevo>
          <Sugerencias id="cubg-choferes" opciones={libreta.choferes} />
        </Campo>
        <Campo id="cubg-destino" etiqueta="Destino">
          <input id="cubg-destino" className={CAMPO} value={ficha.destino ?? ""} maxLength={FICHA_MAX} list="cubg-destinos"
            placeholder="Ej.: Lima, depósito de Yarinacocha" autoComplete="off" onChange={texto("destino")} />
          <Sugerencias id="cubg-destinos" opciones={libreta.nombresDestinos} />
        </Campo>
        <Campo id="cubg-lugar" etiqueta="Lugar donde se cubicó">
          <ConNuevo>
            <input id="cubg-lugar" className={CAMPO} value={ficha.lugar ?? ""} maxLength={FICHA_MAX} list="cubg-lugares"
              placeholder="Ej.: patio, puerto, playa del río" autoComplete="off" onChange={texto("lugar")} />
            <BotonNuevo campo="lugar" onClick={() => setAlta("lugar")} />
          </ConNuevo>
          <Sugerencias id="cubg-lugares" opciones={libreta.lugares} />
        </Campo>
        <Campo id="cubg-cubicado-por" etiqueta="Cubicado por">
          <ConNuevo>
            <input id="cubg-cubicado-por" className={CAMPO} value={ficha.cubicadoPor ?? ""} maxLength={FICHA_MAX} list="cubg-cubicadores"
              placeholder="Quién midió la madera" autoComplete="off" onChange={texto("cubicadoPor")} />
            <BotonNuevo campo="cubicadoPor" onClick={() => setAlta("cubicadoPor")} />
          </ConNuevo>
          <Sugerencias id="cubg-cubicadores" opciones={libreta.cubicadores} />
        </Campo>
        <Campo id="cubg-notas" etiqueta="Notas" ancho>
          <textarea id="cubg-notas" rows={3} className={`${CAMPO} h-auto min-h-[5.5rem] py-2.5`} value={datos.notas} maxLength={600}
            placeholder="Ej.: entregado en camión, falta el saldo"
            onChange={(e) => { const v = e.target.value; actualizar((d) => ({ ...d, notas: v })); }} />
        </Campo>
      </div>
      {alta && (
        <AltaEnElDirectorio campo={alta} libreta={libreta} placaEscrita={ficha.placa ?? ""} nombreEscrito={escritoEn(alta)} onElegida={alElegirDelAlta}
          onPlaca={(v) => ponerFicha({ placa: formatearPlaca(v.placa) })} onCerrar={() => setAlta(null)} />
      )}
    </section>
  );
}
