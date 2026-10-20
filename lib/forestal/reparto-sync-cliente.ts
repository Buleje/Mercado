/**
 * El lado del navegador del guardado por negocio de las casillas, el nombre de
 * «Sin marcar», la firma y los códigos del reparto de rolliza
 * (`/api/admin/forestal/reparto-marcas`, Brandon 2026-10-19).
 *
 * `localStorage` sigue siendo la caché que pinta al instante y lo que queda si
 * no hay señal (en el monte). Encima de eso:
 *
 * · **Cola** (`…-rolliza-sync-pend`): cada tilde se anota con su fecha y sale
 *   en lote ~0,6 s después; si no hay señal, queda guardada y sale al volver
 *   (al abrir, al volver a la pestaña o al recuperar la conexión).
 * · **Lo que se ve** = lo del servidor + la cola encima (`estado()`).
 * · **Subida única**: si el servidor nunca guardó nada del negocio, lo que
 *   este navegador ya tenía (marcas de hoy, nombre, firma, códigos) sube una vez.
 *
 * Sin React: el hook (`use-reparto-servidor.ts`) se suscribe. Las
 * dependencias se inyectan para probar dos dispositivos contra un servidor falso.
 */

import { leerRegistro } from "./reparto-codigos";
import {
  cambioDesdeLocal,
  cambioVacio,
  fusionarEstado,
  juntarCambios,
  normalizarEstado,
  quitarEnviado,
  type CambioReparto,
  type EstadoReparto,
} from "./reparto-marcas-sync";
import { NOMBRE_SIN_MARCAR, normalizarNombreSinMarcar } from "./reparto-por-distribuir";

export const URL_REPARTO_MARCAS = "/api/admin/forestal/reparto-marcas";

type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface DepsSync {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  almacen: Almacen | null;
  ahora?: () => number;
  /** Arma las cabeceras del PUT sobre las básicas (en el navegador, `csrfHeaders`). */
  cabeceras?: (basicas: Record<string, string>) => HeadersInit;
  /** Cuánto espera para juntar tildes seguidos en un solo PUT. */
  demoraMs?: number;
  /** Aviso de que algo no se pudo (logger en el navegador). */
  avisar?: (msg: string, datos: Record<string, unknown>) => void;
}

/** Las claves de `localStorage` de la hoja (`base` = `buleje-cubicacion-{slug}`). */
export const clavesLocalesReparto = (base: string) => ({
  marcas: `${base}-rolliza-marcas`,
  nombre: `${base}-rolliza-sin-marcar-nombre`,
  firma: `${base}-rolliza-firma`,
  codigos: `${base}-rolliza-codigos`,
  pendiente: `${base}-rolliza-sync-pend`,
});

function leerJson<T>(almacen: Almacen | null, clave: string): T | null {
  try {
    const raw = almacen?.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export class SyncReparto {
  /** `undefined` = todavía no se sabe (o no hubo señal); `null` = el negocio nunca guardó. */
  private servidor: EstadoReparto | null | undefined = undefined;
  private pendiente: CambioReparto;
  private efectivo: EstadoReparto | null = null;
  private readonly oyentes = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enVuelo: Promise<void> | null = null;
  private otraVez = false;
  private trayendo: Promise<void> | null = null;
  private readonly claves: ReturnType<typeof clavesLocalesReparto>;

  constructor(readonly base: string, private readonly deps: DepsSync) {
    this.claves = clavesLocalesReparto(base);
    this.pendiente = leerJson<CambioReparto>(deps.almacen, this.claves.pendiente) ?? {};
  }

  private ahora(): number {
    return this.deps.ahora?.() ?? Date.now();
  }

  /** Lo del servidor con la cola encima; `null` mientras no se sepa qué tiene el servidor. */
  estado = (): EstadoReparto | null => this.efectivo;

  suscribir = (fn: () => void): (() => void) => {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  };

  /** Lo que falta mandar (para pruebas y para el aviso «sin señal»). */
  porMandar(): CambioReparto {
    return this.pendiente;
  }

  private recalcular(): void {
    this.efectivo = this.servidor === undefined ? null : fusionarEstado(this.servidor, this.pendiente, this.ahora());
    for (const fn of this.oyentes) fn();
  }

  private guardarPendiente(): void {
    try {
      if (cambioVacio(this.pendiente)) this.deps.almacen?.removeItem(this.claves.pendiente);
      else this.deps.almacen?.setItem(this.claves.pendiente, JSON.stringify(this.pendiente));
    } catch { /* quota: la cola vale para esta visita */ }
  }

  /** Respuesta del servidor: se descarta si es más vieja que la que ya se tiene. */
  private tomar(crudo: unknown): void {
    const e = normalizarEstado(crudo);
    if (!e) return;
    if (this.servidor && e.rev < this.servidor.rev) return;
    this.servidor = e;
  }

  /** Lo que este navegador tenía antes del guardado en el servidor. */
  private local(): CambioReparto {
    const { almacen } = this.deps;
    const marcas = leerJson<unknown>(almacen, this.claves.marcas);
    let nombre: string | null = null;
    try { nombre = normalizarNombreSinMarcar(almacen?.getItem(this.claves.nombre) ?? ""); } catch { /* sin acceso */ }
    const firma = leerJson<{ nombre?: string; cargo?: string }>(almacen, this.claves.firma);
    return cambioDesdeLocal(
      {
        marcas: Array.isArray(marcas) ? marcas.filter((k): k is string => typeof k === "string") : [],
        nombre: nombre && nombre !== NOMBRE_SIN_MARCAR ? nombre : null,
        firma: firma ? { nombre: firma.nombre ?? "", cargo: firma.cargo ?? "" } : null,
        codigos: leerRegistro(almacen, this.claves.codigos),
      },
      this.ahora(),
    );
  }

  /** Trae lo del servidor (al abrir y al volver a la pestaña) y manda la cola. */
  traer = (): Promise<void> => {
    this.trayendo ??= (async () => {
      try {
        const r = await this.deps.fetch(URL_REPARTO_MARCAS, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { estado?: unknown };
        if (j.estado == null) {
          /* El negocio nunca guardó: lo que tenía este navegador sube una vez
             (la cola encima: es lo más nuevo). */
          if (this.servidor === undefined) {
            this.servidor = null;
            this.pendiente = juntarCambios(this.local(), this.pendiente);
            this.guardarPendiente();
          }
        } else {
          this.tomar(j.estado);
        }
        this.recalcular();
      } catch (err) {
        this.deps.avisar?.("[reparto] no se pudo traer lo guardado del servidor", { error: String(err) });
      } finally {
        this.trayendo = null;
      }
    })();
    return this.trayendo.then(() => this.vaciar());
  };

  /** Anota un cambio: se ve al tiro y sale en lote. */
  encolar = (c: CambioReparto): void => {
    if (cambioVacio(c)) return;
    this.pendiente = juntarCambios(this.pendiente, c);
    this.guardarPendiente();
    this.recalcular();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.vaciar();
    }, this.deps.demoraMs ?? 600);
  };

  /** Manda la cola. Sin saber qué tiene el servidor no manda (lo hace `traer`). */
  vaciar = (keepalive = false): Promise<void> => {
    if (this.servidor === undefined || cambioVacio(this.pendiente)) return Promise.resolve();
    if (this.enVuelo) {
      this.otraVez = true;
      return this.enVuelo;
    }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const enviado = this.pendiente;
    const body = JSON.stringify({ cambio: enviado });
    this.enVuelo = (async () => {
      try {
        const r = await this.deps.fetch(URL_REPARTO_MARCAS, {
          method: "PUT",
          credentials: "include",
          keepalive: keepalive && body.length < 60_000,
          headers: this.deps.cabeceras?.({ "Content-Type": "application/json" }) ?? { "Content-Type": "application/json" },
          body,
        });
        /* 400/413: el cambio no entra nunca; reintentarlo sólo trabaría la cola. */
        if (r.status === 400 || r.status === 413) {
          this.pendiente = quitarEnviado(this.pendiente, enviado);
          this.guardarPendiente();
          throw new Error(`HTTP ${r.status} (descartado)`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { estado?: unknown };
        this.tomar(j.estado);
        this.pendiente = quitarEnviado(this.pendiente, enviado);
        this.guardarPendiente();
      } catch (err) {
        this.deps.avisar?.("[reparto] no se pudo guardar en el servidor (queda en la cola)", { error: String(err) });
      } finally {
        this.enVuelo = null;
        this.recalcular();
      }
      if (this.otraVez) {
        this.otraVez = false;
        await this.vaciar();
      }
    })();
    return this.enVuelo;
  };
}

const instancias = new Map<string, SyncReparto>();

/**
 * Una por hoja y pestaña: todos los hooks de la pantalla comparten la misma
 * cola. Al esconder la pestaña sale lo pendiente; al volver o recuperar la
 * señal, se trae lo que marcó otro dispositivo.
 */
export function syncDelReparto(base: string, deps: () => DepsSync): SyncReparto {
  const ya = instancias.get(base);
  if (ya) return ya;
  const s = new SyncReparto(base, deps());
  instancias.set(base, s);
  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void s.vaciar(true);
      else void s.traer();
    });
    window.addEventListener("pagehide", () => void s.vaciar(true));
    window.addEventListener("online", () => void s.traer());
  }
  return s;
}
