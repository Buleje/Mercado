"use client";

/**
 * Conectar la cámara directo, por su dirección (ADR-421).
 *
 * Hasta hoy la cámara sólo podía EMPUJAR: manda la foto del evento a una
 * dirección del panel. Eso funciona en cualquier lado —incluso con la SIM 4G
 * detrás del CGNAT del operador— pero no deja mirar el patio ahora mismo.
 *
 * Este formulario abre el otro camino: el servidor le habla a la cámara por su
 * dirección IP. Sirve cuando los dos están en la misma red —el caso real: el
 * panel abierto en la PC del aserradero— o cuando la cámara tiene una
 * dirección pública. Los dos caminos conviven: conectar no apaga el que ya
 * anda.
 *
 * ## Por qué NO pasa por Hik-Connect
 *
 * La app del celular habla con la nube del fabricante, y esa nube no tiene
 * puerta abierta: su API es sólo para partners de Hikvision. Decirlo acá evita
 * la pregunta de siempre («si en la app la veo, ¿por qué acá no?») y la
 * confusión que viene atrás, que es la que más veces rompe este formulario: el
 * usuario y la clave que se piden son **los del aparato**, no los de la cuenta
 * de Hik-Connect.
 *
 * ## Se prueba de verdad antes de guardar
 *
 * Guardar una IP que nadie probó deja una cámara «configurada» que no responde
 * y nadie se entera hasta la noche que hace falta. Al guardar, el servidor le
 * pregunta a la cámara quién es: si no contesta, no se guarda nada; si
 * contesta, se muestra el modelo y el firmware que devolvió. Ver
 * «DS-2CD2043G2-I · V5.7.3» es la única prueba de que conectó.
 */

import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Server, Wifi, WifiOff,
} from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoDeFalla, type CamaraPublica, type ConexionCamaraPublica } from "@/lib/camaras/camaras";

/**
 * Lo que la pantalla recibe de la conexión: todo menos el secreto.
 *
 * Son los tipos «públicos» del modelo, con nombre corto para leerlos acá. La
 * clave cifrada no existe de este lado: `camaraParaPantalla` la saca en el
 * servidor y esta pantalla no tiene forma de pedirla.
 */
export type ConexionCamara = ConexionCamaraPublica;
export type CamaraConConexion = CamaraPublica;

export interface DatosConexion {
  host: string;
  puerto: number;
  usuario: string;
  clave: string;
  https: boolean;
  canal: number;
}

export type ResultadoConexion =
  | { ok: true; conexion: ConexionCamara }
  | { ok: false; motivo: string; detalle: string };

/**
 * Qué HACER con cada falla, no qué pasó.
 *
 * «401 Unauthorized» no le dice nada a quien está parado frente a la cámara
 * con el celular en la mano. Cada motivo que devuelve el servidor se traduce
 * al siguiente paso concreto.
 */
const QUE_HACER: Record<string, string> = {
  credenciales:
    "El usuario o la clave no son los de la cámara. Es la cuenta del aparato, no la de Hik-Connect.",
  inalcanzable:
    "Esta computadora no llega a la cámara. Tienen que estar en la misma red, o la cámara necesita una dirección pública.",
  tiempo: "La cámara no contestó a tiempo. Fíjate si está encendida y en la misma red.",
  "no-es-hikvision": "Algo contestó en esa dirección, pero no parece una cámara Hikvision.",
};

/**
 * El modelo ya traduce el motivo a qué PASÓ (`textoDeFalla`); acá se prefiere
 * la frase que dice qué HACER, que es lo que necesita quien está parado frente
 * a la cámara. Para los motivos sin consejo propio (puerto bloqueado, pedido
 * rechazado) se muestra la del modelo en vez de inventar otra.
 */
export function queHacer(motivo: string, detalle?: string | null): string {
  return QUE_HACER[motivo] ?? textoDeFalla(motivo, detalle);
}

export type EstadoConexion =
  | { tipo: "push" }
  | { tipo: "conectada"; conexion: ConexionCamara }
  | { tipo: "falla"; conexion: ConexionCamara; motivo: string; detalle: string };

/**
 * En cuál de los tres estados está la cámara.
 *
 * Una falla vieja no tapa una conexión que después funcionó: gana la más
 * nueva de las dos marcas de tiempo.
 */
export function estadoDeConexion(camara: CamaraConConexion): EstadoConexion {
  const c = camara.conexion ?? null;
  if (!c) return { tipo: "push" };
  const f = c.ultimaFalla ?? null;
  const fallaGana =
    !!f && (!c.probadaEn || new Date(f.en).getTime() > new Date(c.probadaEn).getTime());
  if (f && fallaGana) return { tipo: "falla", conexion: c, motivo: f.motivo, detalle: f.detalle };
  return { tipo: "conectada", conexion: c };
}

/** Cómo se llama el aparato, con lo que haya contestado. */
export function nombreDelAparato(c: ConexionCamara): string {
  return [c.modelo, c.firmware].filter(Boolean).join(" · ") || "Cámara conectada";
}

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const ETIQUETA = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

interface Props {
  camara: CamaraConConexion;
  onCerrar: () => void;
  /** Prueba y guarda. Devuelve lo que contestó el aparato, o por qué falló. */
  onConectar: (datos: DatosConexion) => Promise<ResultadoConexion>;
  /** Deja de hablarle directo. La cámara sigue pudiendo mandar fotos. */
  onDesconectar: () => Promise<void>;
}

export default function ConectarCamaraModal({ camara, onCerrar, onConectar, onDesconectar }: Props) {
  /* El modal se monta por cámara (`key`), así que el estado inicial se lee una
     sola vez: recargar la lista mientras se escribe no pisa lo tipeado. */
  const previa = camara.conexion ?? null;
  const [host, setHost] = useState(previa?.host ?? "");
  const [puerto, setPuerto] = useState(String(previa?.puerto ?? 80));
  const [usuario, setUsuario] = useState(previa?.usuario ?? "admin");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [https, setHttps] = useState(previa?.https ?? false);
  const [canal, setCanal] = useState(String(previa?.canal ?? 1));
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConexion | null>(null);

  const listo = host.trim().length > 0 && usuario.trim().length > 0 && clave.length > 0;

  const probar = async () => {
    if (!listo || probando) return;
    setProbando(true);
    setResultado(null);
    try {
      setResultado(
        await onConectar({
          host: host.trim(),
          puerto: Number(puerto) || 80,
          usuario: usuario.trim(),
          clave,
          https,
          canal: Number(canal) || 1,
        }),
      );
    } finally {
      setProbando(false);
    }
  };

  const desconectar = async () => {
    setProbando(true);
    try {
      await onDesconectar();
      onCerrar();
    } finally {
      setProbando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={`Conectar ${camara.nombre}`}
      description="Ver la cámara ahora, hablando directo con el aparato"
      icon={Wifi}
      variant="wide"
      claveVentana="camara-conectar"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {previa && (
            <button
              type="button"
              onClick={() => void desconectar()}
              disabled={probando}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)] disabled:opacity-50"
            >
              <WifiOff className="h-4 w-4" aria-hidden /> Desconectar
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="ml-auto inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            {resultado?.ok ? "Listo" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => void probar()}
            disabled={!listo || probando}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {probando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Server className="h-4 w-4" aria-hidden />}
            {probando ? "Probando…" : "Probar y guardar"}
          </button>
        </div>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        {/* El resultado va arriba de todo: es lo único que importa después de
            apretar, y en celular el pie del modal queda fuera de la vista. */}
        <div aria-live="polite">
          {resultado?.ok && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-bold text-[var(--text-primary)]">
                  Conectada: {nombreDelAparato(resultado.conexion)}
                </p>
                <p className="text-[var(--text-secondary)]">
                  Contestó el aparato, así que la dirección y la clave son correctas.
                  {resultado.conexion.serie ? ` Serie ${resultado.conexion.serie}.` : ""}
                  {resultado.conexion.soportaPtz
                    ? " Además se mueve: abajo de la cámara aparecen las flechas."
                    : " Esta cámara es fija: no se puede mover desde el panel."}
                </p>
              </div>
            </div>
          )}
          {resultado && !resultado.ok && (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-bold text-[var(--text-primary)]">No se conectó, y no se guardó nada.</p>
                <p className="text-[var(--text-secondary)]">{queHacer(resultado.motivo)}</p>
                {resultado.detalle && (
                  <p className="mt-1 break-words font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {resultado.detalle}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
          <Server className="h-4 w-4 shrink-0" aria-hidden />
          Datos del aparato, no de Hik-Connect
          <InfoTip icono="ayuda" side="bottom" ancho="w-96" title="¿Y si la veo en Hik-Connect?" body={<AyudaHikConnect />} />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label className="block">
            <span className={ETIQUETA}>Dirección IP o dominio de la cámara</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void probar(); }}
              placeholder="192.168.1.64"
              inputMode="url"
              autoComplete="off"
              className={`mt-1 font-mono ${CAMPO}`}
            />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Puerto</span>
            <input
              value={puerto}
              onChange={(e) => setPuerto(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              placeholder="80"
              className={`mt-1 font-mono tabular-nums ${CAMPO}`}
            />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Usuario del aparato</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="admin"
              autoComplete="off"
              className={`mt-1 ${CAMPO}`}
            />
          </label>
          <label className="block">
            <span className={ETIQUETA}>Canal</span>
            <input
              value={canal}
              onChange={(e) => setCanal(e.target.value.replace(/\D/g, "").slice(0, 2))}
              inputMode="numeric"
              placeholder="1"
              className={`mt-1 font-mono tabular-nums ${CAMPO}`}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={ETIQUETA}>Clave del aparato</span>
            <span className="relative mt-1 block">
              <input
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void probar(); }}
                type={verClave ? "text" : "password"}
                placeholder="La que le pusiste al configurarla"
                autoComplete="new-password"
                className={`${CAMPO} pr-11`}
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? "Ocultar la clave" : "Mostrar la clave"}
                className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                {verClave ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </span>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={https}
              onChange={(e) => setHttps(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              La cámara usa <b>HTTPS</b> (déjalo apagado si no lo cambiaste: de fábrica es HTTP)
            </span>
          </label>
        </div>
      </div>
    </AdminModal>
  );
}

/**
 * La ayuda honesta del ⓘ de arriba. Vive acá y no en un manual: quien llena
 * el formulario tiene esta pantalla abierta y la cámara adelante.
 */
function AyudaHikConnect() {
  return (
    <span className="block space-y-2 text-xs font-normal leading-snug text-[var(--text-secondary)]">
      <span className="block">
        <b className="text-[var(--text-primary)]">Esto no pasa por Hik-Connect.</b> Esa app habla con la nube de
        Hikvision, y esa nube sólo abre su puerta a los socios del fabricante: no hay forma de entrar desde acá. El
        panel le habla a la cámara <b className="text-[var(--text-primary)]">directo</b>, así que funciona desde la
        red del negocio (la PC y la cámara en el mismo WiFi o el mismo cable) o con una dirección pública.
      </span>
      <span className="block">
        Por eso el usuario y la clave son los <b className="text-[var(--text-primary)]">del aparato</b> —normalmente{" "}
        <code>admin</code> y la clave que le pusiste al configurarla—, no los de tu cuenta de Hik-Connect.
      </span>
      {/* Lo pide el propio módulo de video: para traer el video, ffmpeg recibe la
          clave en la línea de comandos, y eso lo puede leer cualquier usuario de
          esa computadora mientras dura. Con una cuenta de sólo-ver, lo que quede
          expuesto no puede tocar nada. */}
      <span className="block">
        <b className="text-[var(--text-primary)]">Mejor todavía:</b> créale a la cámara un usuario aparte de{" "}
        <b className="text-[var(--text-primary)]">sólo ver</b> (en Hikvision, <code>Usuario</code> u{" "}
        <code>Operador</code>) y pon ése acá. Si esa clave alguna vez se filtra, no sirve para reconfigurar la cámara.
      </span>
      <span className="block">
        Si la cámara está con SIM 4G o con fibra detrás de CGNAT (lo normal en Perú), no tiene dirección propia y
        esto no va a llegar: ahí el camino sigue siendo que la cámara{" "}
        <b className="text-[var(--text-primary)]">mande</b> la foto al panel. Los dos conviven; conectar acá no
        apaga aquello.
      </span>
      <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        Para saber la dirección IP: en Hik-Connect, en los datos del aparato, o desde el router en la lista de
        equipos conectados. Si la cámara está en otra red, primero hay que abrirle un puerto en el router de allá.
      </span>
    </span>
  );
}

/** La pastilla de estado de la tarjeta: en cuál de los tres caminos está. */
export function PastillaConexion({ estado }: { estado: EstadoConexion }) {
  if (estado.tipo === "conectada") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-2 py-1 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <Wifi className="h-3.5 w-3.5" aria-hidden /> Conectada · {nombreDelAparato(estado.conexion)}
      </span>
    );
  }
  if (estado.tipo === "falla") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2 py-1 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Falló la conexión
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> Sólo recibe fotos
    </span>
  );
}
