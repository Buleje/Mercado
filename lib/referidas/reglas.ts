/**
 * Referidas «Trae a una amiga» (ADR-510): las reglas puras, para cualquier negocio.
 *
 * Una clienta comparte su código; su amiga lo usa (o el negocio anota «la trajo
 * Rosa»). Cuando la amiga compra, quien la recomendó recibe su premio; la amiga
 * recibe el suyo al usar el código o después de su primera compra, según el
 * negocio. Cada premio es un cupón de un solo uso con la compra mínima del
 * programa (el checkout ya exige `Coupon.minPurchase` en el servidor).
 *
 * Las reglas son del negocio (`featureFlagsJson.referidas`); sin nada guardado
 * valen las que el código tenía fijas hasta el 20-10 (10 % a la amiga, S/ 10 a
 * quien la recomienda, sin mínimo, 30 días). Puro y client-safe: el servidor
 * emite y cobra con esto; la pantalla sólo muestra lo que el servidor devolvió.
 */
import { z } from "zod";

export const CLAVE_REFERIDAS = "referidas";
/** `featureFlagsJson.referidasAltas[últimos 9 dígitos de la amiga] = { por, desde }`. */
export const CLAVE_ALTAS_REFERIDAS = "referidasAltas";
/** Quienes ven y cambian el programa: dueño, admin y encargado. */
export const ROLES_REFERIDAS = ["admin", "owner", "manager"] as const;
/** Cupón de la amiga y cupón de quien la recomendó: el checkout los reconoce por el prefijo. */
export const PREFIJO_CUPON_AMIGA = "AMIGA-";
export const PREFIJO_CUPON_GRACIAS = "GRACIAS-";
/** Una clienta sigue siendo «nueva» hasta estos días después de su primera compra. */
export const DIAS_CLIENTA_NUEVA = 30;
/**
 * Lo que da el camino de PUNTOS mientras el negocio no guarde su programa
 * (`CustomersDB.applyReferralCode`: +50 a quien recomienda). Sólo para mostrarlo.
 */
export const PUNTOS_POR_REFERIDA_SIN_CONFIG = 50;

export type TipoPremio = "monto" | "porcentaje";
export interface Premio {
  tipo: TipoPremio;
  /** S/ si es monto; % del pedido si es porcentaje. 0 = sin premio. */
  valor: number;
}
export type CuandoRecibeLaAmiga = "al_usar_codigo" | "tras_primera_compra";

export interface ConfigReferidas {
  activo: boolean;
  premioQuienRefiere: Premio;
  premioAmiga: Premio;
  amigaRecibe: CuandoRecibeLaAmiga;
  /** S/ que tiene que llegar la compra donde se usa el premio; 0 = sin mínimo. */
  compraMinima: number;
  /** Si el premio se suma a otras promociones del pedido (cupón, oferta, descuento automático). */
  acumulable: boolean;
  /** Días que vale el cupón desde que se entrega. */
  vigenciaDias: number;
}

export interface AltaReferida {
  /** Celular de quien la recomendó (tal como está en su ficha). */
  por: string;
  /** Cuándo se anotó (ISO). Es parte de la semilla del cupón: nadie lo ve. */
  desde: string;
}

const PremioSchema = z
  .object({
    tipo: z.enum(["monto", "porcentaje"]),
    valor: z.number().finite().min(0, "No puede ser negativo.").max(500, "Hasta S/ 500."),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === "porcentaje" && p.valor > 50) ctx.addIssue({ code: "custom", path: ["valor"], message: "Hasta 50 %." });
  });

export const ConfigReferidasSchema = z.object({
  activo: z.boolean(),
  premioQuienRefiere: PremioSchema,
  premioAmiga: PremioSchema,
  amigaRecibe: z.enum(["al_usar_codigo", "tras_primera_compra"]),
  compraMinima: z.number().finite().min(0, "No puede ser negativo.").max(100_000, "Demasiado alto."),
  acumulable: z.boolean(),
  vigenciaDias: z.number().int().min(1, "Al menos 1 día.").max(365, "Hasta 365 días."),
});

/** Lo que el código hacía fijo hasta el 20-10: ningún negocio cambia sin configurarlo. */
export const CONFIG_REFERIDAS_POR_DEFECTO: Readonly<ConfigReferidas> = Object.freeze({
  activo: true,
  premioQuienRefiere: Object.freeze({ tipo: "monto", valor: 10 }) as Premio,
  premioAmiga: Object.freeze({ tipo: "porcentaje", valor: 10 }) as Premio,
  amigaRecibe: "al_usar_codigo",
  compraMinima: 0,
  acumulable: true,
  vigenciaDias: 30,
});

export function configReferidasPorDefecto(): ConfigReferidas {
  const d = CONFIG_REFERIDAS_POR_DEFECTO;
  return { ...d, premioQuienRefiere: { ...d.premioQuienRefiere }, premioAmiga: { ...d.premioAmiga } };
}

/** Lo guardado en los flags del negocio; si falta o no pasa la validación, lo de fábrica. */
export function leerConfigReferidas(flags: Record<string, unknown> | null | undefined): ConfigReferidas {
  const r = ConfigReferidasSchema.safeParse(flags?.[CLAVE_REFERIDAS]);
  return r.success ? r.data : configReferidasPorDefecto();
}

/** ¿El negocio guardó su propia config? Los caminos de puntos de antes siguen igual mientras no. */
export function configReferidasGuardada(flags: Record<string, unknown> | null | undefined): boolean {
  return ConfigReferidasSchema.safeParse(flags?.[CLAVE_REFERIDAS]).success;
}

/** Últimos 9 dígitos: «+51 916 409 675» y «916409675» son la misma clienta. */
export const claveDeCelular = (t: string): string => t.replace(/\D/g, "").slice(-9);

/** `{ "916409675": { por, desde } }`; lo que no tiene forma se ignora. */
export function leerAltasReferidas(flags: Record<string, unknown> | null | undefined): Record<string, AltaReferida> {
  const crudo = flags?.[CLAVE_ALTAS_REFERIDAS];
  if (!crudo || typeof crudo !== "object") return {};
  const out: Record<string, AltaReferida> = {};
  for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (!/^\d{6,9}$/.test(k) || !v || typeof v !== "object") continue;
    const { por, desde } = v as Record<string, unknown>;
    if (typeof por === "string" && por.trim() && typeof desde === "string" && !Number.isNaN(Date.parse(desde))) {
      out[k] = { por, desde };
    }
  }
  return out;
}

// ── Plata ────────────────────────────────────────────────────────────────

const aCentimos = (soles: number) => Math.round(soles * 100);
const formatoSoles = (n: number) => `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function describirPremio(p: Premio): string {
  if (p.valor <= 0) return "nada";
  return p.tipo === "porcentaje" ? `${p.valor} %` : formatoSoles(p.valor);
}

/**
 * Lo que descuenta el premio en una compra de `subtotal` soles, al céntimo.
 * Debajo de la compra mínima no vale (0); un monto nunca pasa del subtotal.
 */
export function montoDelPremio(config: ConfigReferidas, premio: Premio, subtotal: number): number {
  const sub = aCentimos(Math.max(0, subtotal));
  if (premio.valor <= 0 || sub === 0) return 0;
  if (config.compraMinima > 0 && sub < aCentimos(config.compraMinima)) return 0;
  const c = premio.tipo === "porcentaje" ? Math.round((sub * Math.min(premio.valor, 100)) / 100) : Math.min(aCentimos(premio.valor), sub);
  return c / 100;
}

/** «S/ 10 para quien recomienda y S/ 10 para su amiga · desde S/ 59 · no se suma a otras promociones». */
export function resumenDelPrograma(config: ConfigReferidas): string {
  if (!config.activo) return "Pausado: los códigos no dan premio.";
  const quien = describirPremio(config.premioQuienRefiere);
  const amiga = describirPremio(config.premioAmiga);
  const partes = [`${quien} para quien recomienda y ${amiga} para su amiga`];
  if (config.compraMinima > 0) partes.push(`desde ${formatoSoles(config.compraMinima)}`);
  if (!config.acumulable) partes.push("no se suma a otras promociones");
  return partes.join(" · ");
}

/** El mensaje que la clienta manda por WhatsApp con su código. */
export function mensajeInvitacion(config: ConfigReferidas, codigo: string, negocio: string): string {
  const amiga = config.premioAmiga.valor > 0 ? describirPremio(config.premioAmiga) : null;
  if (!config.activo || !amiga) return `¡Únete a ${negocio} con mi código ${codigo}!`;
  const cuando = config.amigaRecibe === "al_usar_codigo" ? "en tu primera compra" : "para tu siguiente compra después de la primera";
  const minimo = config.compraMinima > 0 ? ` (compras desde ${formatoSoles(config.compraMinima)})` : "";
  return `¡Compra en ${negocio} con mi código ${codigo} y recibe ${amiga} ${cuando}${minimo}!`;
}

// ── Vincular ─────────────────────────────────────────────────────────────

export type MotivoNoVincula = "pausado" | "propio" | "ya_referida" | "no_es_nueva";

const MENSAJES: Record<MotivoNoVincula, string> = {
  pausado: "El programa de referidas está pausado.",
  propio: "No puedes usar tu propio código.",
  ya_referida: "Esta clienta ya tiene a alguien que la recomendó.",
  no_es_nueva: `El código es para clientas nuevas: ya compra hace más de ${DIAS_CLIENTA_NUEVA} días.`,
};

/**
 * ¿Se puede anotar que `amiga` llegó recomendada por `quienRefiere`?
 * Nueva = sin compras, o con su primera compra hace ≤ 30 días (el negocio
 * suele anotar «me mandó Rosa» después de venderle).
 */
export function puedeVincular(args: {
  config: ConfigReferidas;
  amiga: string;
  quienRefiere: string;
  yaReferida: boolean;
  primeraCompra: Date | null;
  ahora: Date;
}): { ok: true } | { ok: false; motivo: MotivoNoVincula; mensaje: string } {
  const no = (motivo: MotivoNoVincula) => ({ ok: false as const, motivo, mensaje: MENSAJES[motivo] });
  if (!args.config.activo) return no("pausado");
  if (claveDeCelular(args.amiga) === claveDeCelular(args.quienRefiere)) return no("propio");
  if (args.yaReferida) return no("ya_referida");
  if (args.primeraCompra && args.ahora.getTime() - args.primeraCompra.getTime() > DIAS_CLIENTA_NUEVA * 86_400_000) return no("no_es_nueva");
  return { ok: true };
}

// ── Cupones ──────────────────────────────────────────────────────────────

export type RolPremio = "amiga" | "quien_refiere";

export interface CuponPlaneado {
  rol: RolPremio;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minPurchase: number | null;
  maxUses: 1;
  expiresAt: Date;
  description: string;
}

const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 8 caracteres legibles (sin 0/O/1/I) a partir de un hash hex del servidor. */
export function sufijoDeCupon(hashHex: string): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += ALFABETO[parseInt(hashHex.slice(i * 2, i * 2 + 2) || "0", 16) % ALFABETO.length];
  return out;
}

export function codigoDeCupon(rol: RolPremio, hashHex: string): string {
  return `${rol === "amiga" ? PREFIJO_CUPON_AMIGA : PREFIJO_CUPON_GRACIAS}${sufijoDeCupon(hashHex)}`;
}

export function esCuponDeReferida(code: string | null | undefined): boolean {
  const c = (code ?? "").toUpperCase();
  return c.startsWith(PREFIJO_CUPON_AMIGA) || c.startsWith(PREFIJO_CUPON_GRACIAS);
}

/** El texto del cupón dice para quién es: el cupón no está atado a una ficha. */
function planear(config: ConfigReferidas, rol: RolPremio, hashHex: string, para: string, ahora: Date): CuponPlaneado | null {
  const premio = rol === "amiga" ? config.premioAmiga : config.premioQuienRefiere;
  if (premio.valor <= 0) return null;
  const expiresAt = new Date(ahora.getTime() + config.vigenciaDias * 86_400_000);
  const minimo = config.compraMinima > 0 ? ` desde ${formatoSoles(config.compraMinima)}` : "";
  const que = rol === "amiga" ? "Trae a una amiga — premio de la amiga" : "Trae a una amiga — gracias por recomendar";
  return {
    rol,
    code: codigoDeCupon(rol, hashHex),
    discountType: premio.tipo === "porcentaje" ? "percent" : "fixed",
    discountValue: premio.valor,
    minPurchase: config.compraMinima > 0 ? config.compraMinima : null,
    maxUses: 1,
    expiresAt,
    description: `${que} (${para}): ${describirPremio(premio)} en una compra${minimo}`.slice(0, 190),
  };
}

export interface SemillasDeAlta {
  /** sha256 hex de `tenant:amiga:desde:amiga` y `…:quien_refiere`, calculado en el servidor. */
  amiga: string;
  quienRefiere: string;
}

/** Al anotar el vínculo: sólo el de la amiga, si lo recibe al usar el código. */
export function cuponesAlVincular(config: ConfigReferidas, semillas: SemillasDeAlta, nombres: { amiga: string }, ahora: Date): CuponPlaneado[] {
  if (!config.activo || config.amigaRecibe !== "al_usar_codigo") return [];
  const c = planear(config, "amiga", semillas.amiga, nombres.amiga, ahora);
  return c ? [c] : [];
}

/**
 * Cuando la amiga ya compró: el de quien la recomendó y, si la amiga lo recibe
 * después de comprar, el suyo. Los ya emitidos (por código) no se repiten.
 */
export function cuponesAlComprar(
  config: ConfigReferidas,
  semillas: SemillasDeAlta,
  nombres: { amiga: string; quienRefiere: string },
  yaEmitidos: ReadonlySet<string>,
  ahora: Date,
): CuponPlaneado[] {
  if (!config.activo) return [];
  const out: CuponPlaneado[] = [];
  const gracias = planear(config, "quien_refiere", semillas.quienRefiere, nombres.quienRefiere, ahora);
  if (gracias && !yaEmitidos.has(gracias.code)) out.push(gracias);
  if (config.amigaRecibe === "tras_primera_compra") {
    const amiga = planear(config, "amiga", semillas.amiga, nombres.amiga, ahora);
    if (amiga && !yaEmitidos.has(amiga.code)) out.push(amiga);
  }
  return out;
}

// ── Lo que ve el panel ───────────────────────────────────────────────────

export interface CuponEntregado {
  rol: RolPremio;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minPurchase: number | null;
  expiresAt: string;
  usado: boolean;
  activo: boolean;
}

export interface FilaReferida {
  amiga: { nombre: string; celular: string };
  quienRefiere: { nombre: string; celular: string };
  desde: string;
  compro: boolean;
  cupones: CuponEntregado[];
}

export interface ResumenReferidas {
  config: ConfigReferidas;
  guardada: boolean;
  filas: FilaReferida[];
  totales: { vinculos: number; compraron: number; cuponesEntregados: number; cuponesUsados: number };
}

// ── Acumular ─────────────────────────────────────────────────────────────

/**
 * Con `acumulable: false` el premio no se suma a otras promociones del pedido:
 * se queda la que más descuenta (a favor de la clienta). Montos en soles.
 */
export function combinarConOtrosDescuentos(
  config: ConfigReferidas,
  d: { premio: number; otros: number },
): { premio: number; otros: number; seQueda: "ambos" | "premio" | "otros" } {
  const premio = Math.max(0, d.premio);
  const otros = Math.max(0, d.otros);
  if (config.acumulable || premio === 0 || otros === 0) return { premio, otros, seQueda: "ambos" };
  return aCentimos(premio) >= aCentimos(otros) ? { premio, otros: 0, seQueda: "premio" } : { premio: 0, otros, seQueda: "otros" };
}
