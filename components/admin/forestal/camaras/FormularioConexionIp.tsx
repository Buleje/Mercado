"use client";

/**
 * El formulario de la conexión directa por IP (ADR-421): el resultado de la
 * prueba arriba, los datos del aparato y la ayuda honesta sobre Hik-Connect.
 * El estado vive en `useFormularioIp`; el pie (los botones) es `PieConexionIp`.
 */

import {
  AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Server, WifiOff,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { nombreDelAparato, queHacer } from "./conexion-camara";
import type { FormularioIp } from "./use-formulario-ip";

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const ETIQUETA = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

export default function FormularioConexionIp({ f }: { f: FormularioIp }) {
  const {
    host, setHost, puerto, setPuerto, usuario, setUsuario, clave, setClave,
    verClave, setVerClave, https, setHttps, canal, setCanal, resultado, probar,
  } = f;
  return (
    <>
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
    </>
  );
}

/** El pie del modal en modo directo: desconectar, cancelar y probar. */
export function PieConexionIp({ f, onCerrar }: { f: FormularioIp; onCerrar: () => void }) {
  const { previa, desconectar, probando, resultado, probar, listo } = f;
  return (
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
