/**
 * extensiones/_contrato.ts — el contrato de las PIEZAS (ADR-457, capa 4).
 *
 * Una pieza es código a medida que vive en archivos (`extensiones/<id>/`) y que
 * el superadmin prende para un negocio desde el panel. Llena un ENCHUFE con
 * nombre — nunca «cualquier cosa en cualquier lado» — y si falla se ve la
 * versión normal del sistema.
 *
 * Este archivo son sólo tipos y constantes: nada de React en tiempo de
 * ejecución, nada de servidor. Lo importan el registro del servidor, el del
 * cliente y cada pieza.
 *
 * Reglas que el contrato hace cumplir (y que los tests miden):
 * · Las opciones son un Zod `.strict()`: se validan al GUARDAR (ruta del
 *   superadmin) y al LEER (resolver y panel). Un campo de más se rechaza; así
 *   nadie cuela un `tenantId` por las opciones.
 * · El negocio llega en `ContextoPieza`, que arma el sistema desde la sesión o
 *   el host. La pieza nunca elige de qué negocio lee.
 * · La asignación (qué negocio tiene qué pieza) NUNCA va en el manifiesto:
 *   vive en la tabla `TenantPieza`. Un id de negocio en el código es justo lo
 *   que el ADR-457 vino a sacar.
 * · Una pieza lee por DB classes como cualquier pantalla: ESLint le prohíbe
 *   importar `prisma`, `pg`, `fs` y `child_process`.
 */
import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";
import type { Industry } from "@/lib/verticals/registry";
import type { SpecializationKey } from "@/lib/specializations";
import type { GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { LineaProducto } from "@/lib/forestal/ctp-gtf-formato";

// ─── Enchufes ────────────────────────────────────────────────────────────────

/**
 * Los lugares del sistema donde una pieza puede entrar. Agregar uno es una
 * decisión de arquitectura (ADR), no de una pieza.
 * · `tienda.portada` — la portada pública: AGREGA un bloque o REEMPLAZA el cuerpo.
 * · `forestal.guia-impresa` — la GTF de salida: SÓLO agrega hojas, pie o CSS;
 *   las tres copias oficiales no se tocan.
 * · `panel.pestana` — una pestaña «A medida» en el panel, gateada como un módulo.
 */
export const ENCHUFES = ["tienda.portada", "forestal.guia-impresa", "panel.pestana"] as const;
export type EnchufeId = (typeof ENCHUFES)[number];

export function esEnchufe(v: unknown): v is EnchufeId {
  return typeof v === "string" && (ENCHUFES as readonly string[]).includes(v);
}

/** El módulo del panel que aparece cuando el negocio tiene ≥1 pieza en `panel.pestana`. */
export const MODULO_A_MEDIDA = "a-medida";

/** Cuánto puede tardar una pieza (su `cargar()` o su hoja) antes de que se vea la versión normal. */
export const TOPE_PIEZA_MS = 2000;

// ─── Contexto y manifiesto ───────────────────────────────────────────────────

/** Lo que el sistema le dice a la pieza sobre dónde corre. Sale de la sesión o del host. */
export interface ContextoPieza {
  readonly tenantId: string;
  readonly slug: string;
  readonly enchufe: EnchufeId;
}

/**
 * Metadatos de una pieza. `opciones` DEBE ser un `z.object({...}).strict()` y
 * conviene que todos sus campos tengan `.default()`: así `{}` es una
 * configuración válida y el superadmin puede prenderla sin llenar nada.
 */
export interface ManifiestoPieza<O extends z.ZodType = z.ZodType> {
  /** kebab-case, igual al nombre de la carpeta. Es la clave en `TenantPieza.piezaId`. */
  readonly id: string;
  readonly nombre: string;
  /** Qué hace, en el idioma del dueño (lo lee el superadmin al prenderla). */
  readonly descripcion: string;
  /** semver. Se guarda en la fila al asignar: si el código sube de versión se ve en la matriz. */
  readonly version: string;
  readonly enchufes: readonly EnchufeId[];
  readonly opciones: O;
  /** Sugerencia para la pantalla de negocios, NO un candado. */
  readonly rubros?: readonly Industry[];
  /** Módulos que la pieza da por prendidos. Sugerencia, NO un candado. */
  readonly requiere?: readonly SpecializationKey[];
}

export type OpcionesDe<M extends ManifiestoPieza> = z.output<M["opciones"]>;

// ─── Lo que llena cada enchufe ───────────────────────────────────────────────

/** `tienda.portada`: lo que recibe la vista. `datos` = lo que devolvió `cargar()` (o `undefined`). */
export interface VistaPortadaProps<O = unknown, D = unknown> {
  ctx: ContextoPieza;
  opciones: O;
  datos: D | undefined;
}

export interface PiezaPortada<O = unknown, D = unknown> {
  /** `agrega` = un bloque más en el orden de la portada; `reemplaza` = el cuerpo entero. */
  readonly modo: "agrega" | "reemplaza";
  /** Corre en el servidor, con tope de {@link TOPE_PIEZA_MS}. Lee por DB classes con `ctx.tenantId`. */
  readonly cargar?: (ctx: ContextoPieza, opciones: O) => Promise<D>;
  /** Componente de servidor o de cliente. Si tira, se ve la versión normal. */
  readonly Vista: (props: VistaPortadaProps<O, D>) => ReactNode | Promise<ReactNode>;
}

/**
 * `forestal.guia-impresa`: la guía ya armada, en una COPIA congelada. La pieza
 * no puede tocar las copias oficiales: sólo devuelve lo que agrega.
 */
export interface DocGuiaImpresa {
  readonly numeroGtf: string;
  /** Fecha y hora de emisión tal como salen impresas en la guía. */
  readonly emitida: { readonly fecha: string; readonly hora: string };
  readonly despacho: Readonly<GtfDespacho>;
  readonly ficha: {
    readonly nombreCtp: string;
    readonly razonSocial: string;
    readonly ruc: string;
    readonly codigoCtp: string;
  };
  readonly datos: Readonly<GtfDatos>;
  /** El detalle (37) de la guía, una línea por producto. */
  readonly lineas: readonly LineaProducto[];
  /** (36) Las GTF con las que ENTRÓ la materia prima, sin repetir. */
  readonly guiasDeIngreso: readonly string[];
}

/**
 * Lo que una pieza agrega a la guía. TODO texto que venga de datos va por
 * `esc()` (`lib/forestal/ctp-documento-print`).
 * · `hojasExtra` — HTML de hojas nuevas, cada una en su hoja, DESPUÉS de las 3
 *   copias oficiales. Sin `<script>`, `<iframe>`, `<style>` ni `on*=`. Cada
 *   hoja va envuelta en `<div class="pz-<id>">` y el visor la cuenta como UN
 *   bloque: que entre en un A4 (si pasa, imprime bien pero la línea de corte
 *   del visor es aproximada).
 * · `pieExtra` — TEXTO plano que se suma al pie corrido (se escapa al imprimir).
 * · `cssExtra` — CSS que queda encerrado en `@scope (.pz-<id>)`: no alcanza a
 *   las copias oficiales. Sin `<`, sin `@import`.
 */
export interface AgregadoGuia {
  hojasExtra?: string[];
  pieExtra?: string;
  cssExtra?: string;
}

export interface PiezaGuia<O = unknown> {
  readonly agregar: (ctx: ContextoPieza, opciones: O, doc: DocGuiaImpresa) => AgregadoGuia;
}

/** Nombre de un ícono de Lucide (p. ej. `"FileSpreadsheet"`); lo resuelve la pestaña. */
export type NombreIcono = string;

/** `panel.pestana`: una pieza dentro de la pestaña «A medida». */
export interface PiezaPestana<O = unknown> {
  readonly titulo: string;
  readonly icono: NombreIcono;
  readonly Vista: ComponentType<{ opciones: O }>;
}

// ─── Registros ───────────────────────────────────────────────────────────────

/**
 * Una entrada del registro del SERVIDOR (`registro.servidor.ts`). El registro
 * borra el tipo de las opciones (cada pieza tiene el suyo); lo restituye el
 * `safeParse` del manifiesto, que corre SIEMPRE antes de llamar a la pieza.
 * Por eso se arma con {@link piezaServidor}, que sí chequea la pieza contra
 * su manifiesto.
 */
export interface EntradaServidor {
  readonly manifiesto: ManifiestoPieza;
  readonly portada?: PiezaPortada;
}

/** Una entrada del registro del CLIENTE (`registro.cliente.ts`). */
export interface EntradaCliente {
  readonly manifiesto: ManifiestoPieza;
  /** Carga perezosa de la hoja: sólo se baja si el negocio tiene la pieza prendida. */
  readonly guia?: () => Promise<PiezaGuia>;
  /** `Vista` con `next/dynamic`; `titulo`/`icono` estáticos para pintar la pestaña sin bajarla. */
  readonly pestana?: PiezaPestana;
}

export function piezaServidor<M extends ManifiestoPieza, D = unknown>(
  manifiesto: M,
  impl: { portada?: PiezaPortada<OpcionesDe<M>, D> } = {},
): EntradaServidor {
  return { manifiesto, ...(impl.portada ? { portada: impl.portada as unknown as PiezaPortada } : {}) };
}

export function piezaCliente<M extends ManifiestoPieza>(
  manifiesto: M,
  impl: { guia?: () => Promise<PiezaGuia<OpcionesDe<M>>>; pestana?: PiezaPestana<OpcionesDe<M>> } = {},
): EntradaCliente {
  return {
    manifiesto,
    ...(impl.guia ? { guia: impl.guia as unknown as () => Promise<PiezaGuia> } : {}),
    ...(impl.pestana ? { pestana: impl.pestana as unknown as PiezaPestana } : {}),
  };
}

// ─── Lo que viaja al panel ───────────────────────────────────────────────────

/**
 * Una pieza prendida, tal como la entrega `/api/admin/me/specializations`
 * (`piezas[]`). `opciones` ya pasó el `safeParse` del manifiesto en el servidor.
 */
export interface PiezaAsignada {
  piezaId: string;
  enchufe: EnchufeId;
  opciones: Record<string, unknown>;
  version: string;
  orden: number;
}

/** El negocio de la sesión, para armar el `ContextoPieza` del lado del cliente. */
export interface NegocioDePiezas {
  tenantId: string;
  slug: string;
}
