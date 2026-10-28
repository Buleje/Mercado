"use client";

/**
 * Columna «Datos» del modal «Guardar cubicación» (Brandon 24-10): nombre,
 * fecha, a quién se vende, de qué CCNN salió la madera, permiso, GTF, camión,
 * destino, lugar y notas. Comprador y comunidad salen del Directorio o se
 * escriben a mano; si el nombre coincide con una ficha, queda atada. El que
 * no está en el Directorio se da de alta con «+ Nuevo» (28-10) sin salir.
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { UserCheck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Parte } from "@/lib/forestal/directorio";
import { FICHA_MAX, type FichaCubicacion } from "@/lib/forestal/cubicacion-registro";
import { CAMPO_CUENTA as CAMPO, ETIQUETA_CUENTA as ETIQUETA } from "./cubicacion-cuenta-persona";
import type { DatosDeLaCubicacion } from "./cubicador-guardar-tipos";
import { AltaEnElDirectorio, BotonNuevo, type CampoDeAlta } from "./cubicador-guardar-alta";
import AvisoDeLaGuia from "./cubicador-guardar-aviso-guia";
import type { CelularDelComprador } from "./hooks/use-celular-del-comprador";
import { useFichaDesdeGuia } from "./hooks/use-ficha-desde-guia";
import type { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";

type Libreta = ReturnType<typeof useLibretaDeLaFicha>;
type Actualizar = (fn: (d: DatosDeLaCubicacion) => DatosDeLaCubicacion) => void;

const DEL_DIRECTORIO =
  "ml-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/12 px-2 py-0.5 align-middle text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]";

function Campo({ id, etiqueta, ancho, extra, children }: { id: string; etiqueta: string; ancho?: boolean; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={ETIQUETA}>{etiqueta}{extra}</label>
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

export default function DatosDeGuardar({ datos, actualizar, nombreSugerido, libreta, celular }: {
  datos: DatosDeLaCubicacion;
  actualizar: Actualizar;
  nombreSugerido: string;
  libreta: Libreta;
  /** Celular del comprador, si su ficha del Directorio no lo tiene. */
  celular?: CelularDelComprador;
}) {
  const { ficha } = datos;
  const [alta, setAlta] = useState<CampoDeAlta | null>(null);
  const guia = useFichaDesdeGuia(datos, actualizar, libreta);
  const ponerFicha = (patch: Partial<FichaCubicacion>) => actualizar((d) => ({ ...d, ficha: { ...d.ficha, ...patch } }));
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
  const alElegirDelAlta = (campo: CampoDeAlta, p: Parte) => {
    if (campo === "comprador") actualizar((d) => ({ ...d, cliente: p.nombre, ficha: { ...d.ficha, clienteParteId: p.id } }));
    else if (campo === "comunidad") alComunidad(p.nombre, p);
    else ponerFicha({ chofer: p.nombre });
  };

  return (
    <section aria-labelledby="cubg-datos" className="min-w-0 space-y-3">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h3" id="cubg-datos">Datos</CardTitle>
        <InfoTip
          what="Con estos datos la encuentras después en Guardadas (busca por comprador, CCNN, placa o permiso)."
          affects="Comprador y comunidad salen del Directorio o los escribes a mano. Nada de esto reemplaza a la GTF ni al Libro."
        />
      </div>
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
        <Campo id="cubg-comprador" etiqueta="¿A quién se le vende?" ancho extra={ficha.clienteParteId ? <Atada /> : null}>
          <ConNuevo>
            <input id="cubg-comprador" className={CAMPO} value={datos.cliente} maxLength={120} list="cubg-compradores"
              placeholder="Elige del Directorio o escríbelo" autoComplete="off" onChange={(e) => alComprador(e.target.value)} />
            <BotonNuevo campo="comprador" onClick={() => setAlta("comprador")} />
          </ConNuevo>
          <Sugerencias id="cubg-compradores" opciones={libreta.nombresCompradores} />
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
        <Campo id="cubg-chofer" etiqueta="Chofer" ancho>
          <ConNuevo>
            <input id="cubg-chofer" className={CAMPO} value={ficha.chofer ?? ""} maxLength={FICHA_MAX} list="cubg-choferes"
              autoComplete="off" onChange={texto("chofer")} />
            <BotonNuevo campo="chofer" onClick={() => setAlta("chofer")} />
          </ConNuevo>
          <Sugerencias id="cubg-choferes" opciones={libreta.choferes} />
        </Campo>
        <Campo id="cubg-placa" etiqueta="Placa">
          <input id="cubg-placa" className={`${CAMPO} uppercase placeholder:normal-case`} value={ficha.placa ?? ""} maxLength={FICHA_MAX} list="cubg-placas"
            placeholder="Ej.: ABC-123" autoComplete="off" onChange={(e) => ponerFicha({ placa: e.target.value.toUpperCase() })} />
          <Sugerencias id="cubg-placas" opciones={libreta.placas} />
        </Campo>
        <Campo id="cubg-destino" etiqueta="Destino">
          <input id="cubg-destino" className={CAMPO} value={ficha.destino ?? ""} maxLength={FICHA_MAX} list="cubg-destinos"
            placeholder="Ej.: Lima, depósito de Yarinacocha" autoComplete="off" onChange={texto("destino")} />
          <Sugerencias id="cubg-destinos" opciones={libreta.nombresDestinos} />
        </Campo>
        <Campo id="cubg-lugar" etiqueta="Lugar donde se cubicó">
          <input id="cubg-lugar" className={CAMPO} value={ficha.lugar ?? ""} maxLength={FICHA_MAX}
            placeholder="Ej.: patio, puerto, playa del río" onChange={texto("lugar")} />
        </Campo>
        <Campo id="cubg-cubicado-por" etiqueta="Cubicado por">
          <input id="cubg-cubicado-por" className={CAMPO} value={ficha.cubicadoPor ?? ""} maxLength={FICHA_MAX}
            placeholder="Quién midió la madera" autoComplete="off" onChange={texto("cubicadoPor")} />
        </Campo>
        <Campo id="cubg-notas" etiqueta="Notas" ancho>
          <textarea id="cubg-notas" rows={3} className={`${CAMPO} h-auto min-h-[5.5rem] py-2.5`} value={datos.notas} maxLength={600}
            placeholder="Ej.: entregado en camión, falta el saldo"
            onChange={(e) => { const v = e.target.value; actualizar((d) => ({ ...d, notas: v })); }} />
        </Campo>
      </div>
      {alta && <AltaEnElDirectorio campo={alta} libreta={libreta} onElegida={alElegirDelAlta} onCerrar={() => setAlta(null)} />}
    </section>
  );
}
