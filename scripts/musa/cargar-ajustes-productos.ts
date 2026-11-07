/**
 * Carga los DATOS de Musa (tenant `cmv1v4b8e0002rlvz6ibrullo`) desde el manual
 * del negocio y el catálogo Campaña 01 (Brandon, 2026-10-20): ajustes, 27 fichas
 * de producto, plantillas de mensajes y tarjeta de sellos.
 *
 * IDEMPOTENTE: calcula lo deseado, lo compara con lo guardado y sólo escribe
 * lo que cambia (correrlo dos veces = 0 cambios). Todo por las clases
 * `lib/db/*.db.ts`; nada de prisma ni SQL de escritura acá.
 *
 * NO inventa: lo que el manual no dice (N.º de Yape/Plin, titular, RUC,
 * dirección, redes, NSO, marca de cada producto) queda como está y sale en la
 * lista «PENDIENTES» al final. No toca precio, costo ni stock.
 *
 * Uso (desde la raíz del repo):
 *   npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config \
 *     scripts/musa/cargar-ajustes-productos.ts dotenv_config_path=.env.local [--simulacro]
 *
 * `_preload.cjs` deja importar las clases `server-only` fuera de Next. Los
 * `revalidateTag` de las clases tiran «static generation store missing» fuera
 * de Next DESPUÉS de escribir: se toleran (la escritura ya quedó hecha).
 */
import fs from "node:fs";
import path from "node:path";
import { SettingsDB } from "@/lib/db/settings.db";
import { ProductsDB } from "@/lib/db/products.db";
import { MarketplaceProductsDB } from "@/lib/db/marketplace-products.db";
import { MessageTemplatesDB } from "@/lib/db/message-templates.db";
import { SellosDB } from "@/lib/db/sellos.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { syncBrandingToTenant, syncBrandingToStore } from "@/lib/db/settings-tenant-sync.db";

const TENANT = "cmv1v4b8e0002rlvz6ibrullo";
const SLUG = "musa";
const SIMULACRO = process.argv.includes("--simulacro");

type Settings = Awaited<ReturnType<typeof SettingsDB.get>>;
type Cambio = { area: string; campo: string; antes: unknown; despues: unknown };
const cambios: Cambio[] = [];
const respaldo: Record<string, unknown> = { tenant: TENANT, cuando: new Date().toISOString() };
const pendientes: string[] = [];

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const corto = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s == null ? "∅" : s.length > 110 ? `${s.slice(0, 107)}…` : s;
};
/** `revalidateTag` de las clases sólo falla fuera de Next, y después de escribir. */
async function tolerandoNext<T>(f: () => Promise<T>): Promise<T | undefined> {
  try {
    return await f();
  } catch (e) {
    if (/static generation store missing|incrementalCache missing/i.test(String(e))) return undefined;
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AJUSTES (manual §1 «Decisiones», §17-18 envíos, §20 políticas, §25 marca)
// ─────────────────────────────────────────────────────────────────────────────
const LOGO = "/musa/logo/musa-logo-color.svg";
const COLOR = { nude: "#D9B8A3", negro: "#1A1A1A", hueso: "#F7F3EF", acento: "#8A6F5E" };
const DESCRIPCION =
  "Musa es una tienda de belleza profesional en Ciudad Constitución (Pasco): cuidado del cabello, el rostro y la piel con productos de salón, originales y con registro sanitario (NSO). Asesoría gratis de Drucila por WhatsApp y entrega rápida. Belleza profesional, cerca de ti.";
const POLITICA_PIE =
  "Cambio por falla, daño o error en 7 días (con foto). Si no hay con qué cambiarlo, devolución por Yape en 48 h. Abiertos o sin sello no se devuelven, salvo falla. Envío gratis en Ciudad Constitución; fuera, gratis desde S/ 99.";

async function ajustes() {
  const cur = await SettingsDB.get(TENANT);
  const deseado: Partial<Settings> = {
    slogan: "Belleza profesional, cerca de ti",
    description: DESCRIPCION,
    hours: "Lunes a sábado, de 9:00 a 20:00",
    logoUrl: LOGO,
    primaryColor: COLOR.negro,
    secondaryColor: COLOR.nude,
    businessType: "belleza",
    // Pagos del manual: Yape · Plin · transferencia · contraentrega sólo en Constitución.
    yapeEnabled: true,
    plinEnabled: true,
    transferEnabled: true,
    cashEnabled: true,
    // Constitución: envío gratis. Fuera: agencia, gratis desde S/ 99 (freeDeliveryMin).
    // 1440 min = las 24 h con que arranca el «24 a 72 h» del manual (§18, paso 8).
    deliveryZones: [{ name: "Ciudad Constitución (envío gratis · contraentrega)", fee: 0, estimatedMin: 1440 }],
    freeDeliveryMin: 99,
    returnPolicyDays: 7,
    invoiceFooterText: POLITICA_PIE,
  };
  const claves = Object.keys(deseado) as Array<keyof Settings>;
  const antes: Record<string, unknown> = {};
  const nuevos: Record<string, unknown> = {};
  for (const k of claves) {
    antes[k] = cur[k] ?? null;
    if (!igual(cur[k], deseado[k])) {
      nuevos[k] = deseado[k];
      cambios.push({ area: "ajustes", campo: k, antes: cur[k] ?? null, despues: deseado[k] });
    }
  }
  respaldo.ajustes = antes;
  if (Object.keys(nuevos).length && !SIMULACRO) {
    // `set` escribe SIEMPRE estos campos base (los pisa con false/undefined si
    // no vienen): se pasan los actuales y encima lo nuevo.
    await SettingsDB.set(
      {
        mode: cur.mode, businessName: cur.businessName, businessPhone: cur.businessPhone,
        businessAddress: cur.businessAddress, logoUrl: cur.logoUrl, description: cur.description,
        hours: cur.hours, deliveryZone: cur.deliveryZone, yapeEnabled: cur.yapeEnabled,
        yapeImage: cur.yapeImage, yapeName: cur.yapeName, yapePhone: cur.yapePhone,
        cashEnabled: cur.cashEnabled,
        ...nuevos,
      } as Settings,
      TENANT,
    );
  }

  // Tema de la tienda (storeTheme): nombre, descripción y la paleta; las demás claves quedan.
  const tema = (await SettingsDB.getStoreThemeJson(TENANT)) ?? {};
  const temaDeseado = {
    storeName: "Musa", description: DESCRIPCION,
    primaryColor: COLOR.negro, secondaryColor: COLOR.nude, accentColor: COLOR.acento,
  };
  const temaAntes: Record<string, unknown> = {};
  const temaPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(temaDeseado)) {
    temaAntes[k] = tema[k] ?? null;
    if (!igual(tema[k], v)) {
      temaPatch[k] = v;
      cambios.push({ area: "tema de la tienda", campo: k, antes: tema[k] ?? null, despues: v });
    }
  }
  respaldo.storeTheme = temaAntes;
  if (Object.keys(temaPatch).length && !SIMULACRO) await SettingsDB.patchStoreThemeJson(TENANT, temaPatch);

  // Ficha del negocio (Tenant) y de la tienda (Store): logo y colores.
  const t = await TenantsDB.publicoPorSlugOId(SLUG);
  const tt = t as unknown as Record<string, unknown> | null;
  respaldo.tenant_ficha = { logoUrl: tt?.logoUrl ?? null, primaryColor: tt?.primaryColor ?? null, secondaryColor: tt?.secondaryColor ?? null, industry: tt?.industry ?? null };
  const fichaOk = tt?.logoUrl === LOGO && tt?.primaryColor === COLOR.negro && tt?.secondaryColor === COLOR.nude;
  if (!fichaOk) {
    cambios.push({ area: "ficha del negocio", campo: "logo + colores", antes: respaldo.tenant_ficha, despues: { logoUrl: LOGO, primaryColor: COLOR.negro, secondaryColor: COLOR.nude } });
    if (!SIMULACRO) {
      await syncBrandingToTenant(TENANT, { logoUrl: LOGO, primaryColor: COLOR.negro, secondaryColor: COLOR.nude });
      await syncBrandingToStore(TENANT, { logoUrl: LOGO, description: DESCRIPCION, bannerUrl: undefined, businessName: undefined });
    }
  }

  // Pendientes: lo que el manual no da.
  if (!cur.yapePhone) pendientes.push("Número de Yape (y titular, y QR): el manual no lo trae");
  if (!cur.plinPhone) pendientes.push("Número de Plin (Plin queda prendido, sin número hasta que lo des)");
  if (!cur.transferAccountNum) pendientes.push("Banco, N.° de cuenta y titular para transferencias");
  if (!cur.ruc && !cur.sunatRuc) pendientes.push("RUC del negocio (Nuevo RUS, manual §24) y régimen tributario");
  if (!cur.businessAddress) pendientes.push("Dirección exacta del local / punto de recojo (el manual sólo dice «Ciudad Constitución»)");
  if (!cur.socialLinks || !Object.keys(cur.socialLinks).length)
    pendientes.push("Redes: el manual sólo sugiere @musa.belleza.pe «si está libre» (§25); falta confirmar y pasar los enlaces");
  pendientes.push("Costo de envío por agencia FUERA de Constitución: el manual dice «la clienta paga la agencia» (varía); por eso sólo hay zona en Constitución");
  pendientes.push("Tiempo de entrega en Constitución: puse 1440 min (24 h) por el «24 a 72 h» del manual; confirmar el real de la moto");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RUBRO — no existe «belleza» en el enum Industry (bodega|restaurante|madereria|
//    farmacia|ferreteria|panaderia|otro): Tenant.industry no se cambia (bodega =
//    todas las pestañas; «otro» recorta). Settings.businessType ya dice «belleza».
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 3. FICHAS DE PRODUCTO (manual §14-15; catálogo Campaña 01)
// ─────────────────────────────────────────────────────────────────────────────
interface Ficha {
  hace: string; para: string; uso: string; pres: string; ingr?: string; extra?: [string, string][];
}
const PRUEBA = "Prueba primero en el antebrazo 24 horas. Embarazo o lactancia: consulta con tu médico.";
const FICHAS: Record<string, Ficha> = {
  MU001: { hace: "Limpia sin resecar; alarga alisados y tintes", para: "Cabello teñido, alisado o seco", uso: "Diario: masajear el cuero cabelludo y enjuagar", pres: "1000 ml", ingr: "Queratina · sin sal" },
  MU002: { hace: "Desenreda, sella la cutícula y baja el frizz", para: "Todo tipo de cabello; cabello largo", uso: "De medios a puntas, 2 a 3 min; enjuagar", pres: "1000 ml", ingr: "Keratina" },
  MU003: { hace: "Repara el cabello dañado por tinte, plancha y sol", para: "Cabello seco, quebradizo u opaco", uso: "1 a 2 veces por semana, 10 a 15 min", pres: "500 g" },
  MU004: { hace: "Reconstruye el cabello quemado por químicos", para: "Cabello decolorado o que se plancha seguido", uso: "Según la marca; una vez por semana", pres: "250 - 500 ml", extra: [["Disponibilidad", "Por encargo: se pide con el pago completo"]] },
  MU005: { hace: "Controla el frizz, da brillo y sella las puntas", para: "Cabello esponjoso o con puntas abiertas", uso: "2 a 3 gotas en las puntas", pres: "50 - 60 ml", ingr: "Aceite de argán" },
  MU006: { hace: "Protege del calor de la plancha y la secadora (hasta 230 °C)", para: "Quien plancha o usa secadora", uso: "Rociar antes de aplicar calor", pres: "250 ml", extra: [["Disponibilidad", "Por encargo: se pide con el pago completo"]] },
  MU007: { hace: "Ayuda a disminuir la caída del cabello", para: "Caída por posparto, estrés o tinte", uso: "Diario en el cuero cabelludo, durante 2 a 3 meses", pres: "120 - 250 ml", ingr: "Cebolla y biotina", extra: [["Precaución", "Si se cae a mechones o con calvas, primero visita a un dermatólogo."]] },
  MU008: { hace: "Quita el tono amarillo del cabello", para: "Canas, mechas o cabello rubio", uso: "3 a 5 min, 1 a 2 veces por semana", pres: "300 ml", extra: [["Disponibilidad", "Por encargo: se pide con el pago completo"]] },
  MU009: { hace: "Limpia grasa e impurezas sin irritar", para: "Piel mixta o grasa, con acné", uso: "Mañana y noche con agua tibia", pres: "150 - 236 ml", extra: [["Precaución", PRUEBA]] },
  MU010: { hace: "Aclara manchas y da luminosidad", para: "Manchas de sol o tono apagado", uso: "Mañana, 3 a 4 gotas; siempre con protector solar", pres: "30 ml", ingr: "Vitamina C", extra: [["Precaución", PRUEBA]] },
  MU011: { hace: "Controla el brillo, los poros y las marcas de acné", para: "Piel grasa o mixta; jóvenes", uso: "Mañana y/o noche, 3 a 4 gotas", pres: "30 ml", ingr: "Niacinamida 10 % + zinc", extra: [["Precaución", PRUEBA]] },
  MU012: { hace: "Hidrata y rellena líneas finas", para: "Piel seca o madura", uso: "Mañana y noche, sobre la piel húmeda", pres: "30 ml", ingr: "Ácido hialurónico", extra: [["Precaución", PRUEBA]] },
  MU013: { hace: "Previene manchas y envejecimiento; acabado ligero que no engrasa", para: "Todas las pieles, todos los días", uso: "Última capa; reaplicar cada 2 a 3 h al sol", pres: "50 ml", extra: [["Protección", "FPS 50"]] },
  MU014: { hace: "Repara, hidrata y mejora las marcas", para: "Piel sensible o con marcas", uso: "Después del limpiador, palmeando", pres: "100 ml", ingr: "Mucina de caracol 96 %", extra: [["Precaución", PRUEBA], ["Disponibilidad", "Por encargo: se pide con el pago completo"]] },
  MU015: { hace: "Desinflama las bolsas y suaviza las ojeras", para: "Quien duerme poco; señoras", uso: "Toquecitos mañana y noche", pres: "30 ml", ingr: "Cafeína", extra: [["Precaución", PRUEBA]] },
  MU016: { hace: "Hidratación rápida en 15 minutos; ideal para regalar", para: "Todas; ideal para la primera compra", uso: "15 a 20 min, 1 a 2 veces por semana", pres: "Pack × 5 láminas" },
  MU017: { hace: "Hidrata la piel seca y áspera", para: "Señoras; piel seca", uso: "Después del baño, en todo el cuerpo", pres: "400 ml", ingr: "Urea o ceramidas" },
  MU018: { hace: "Retira la piel muerta y suaviza", para: "Piel áspera", uso: "1 a 2 veces por semana, en la ducha", pres: "250 g", ingr: "Café o azúcar", extra: [["Disponibilidad", "Por encargo: se pide con el pago completo"]] },
  MU019: { hace: "Atenúa estrías, cicatrices y manchas", para: "Cicatrices; posparto (consultar al médico)", uso: "En la noche, unas gotas con masaje", pres: "30 ml", ingr: "Rosa mosqueta", extra: [["Precaución", PRUEBA], ["Disponibilidad", "Por encargo: se pide con el pago completo"]] },
  MU020: { hace: "Protege del sol en chacra, río y playa; resistente al agua y al sudor", para: "Toda la familia", uso: "20 min antes del sol; reaplicar cada 2 h", pres: "200 ml", extra: [["Protección", "FPS 50"]] },
};
interface Kit { incluye: string; separado: string; para: string; pres: string; extra?: [string, string][] }
const USO_KIT = "Cada producto según su ficha; el kit va con tarjeta de modo de uso";
const KITS: Record<string, Kit> = {
  KT01: { incluye: "Shampoo sin sal con queratina + Acondicionador / crema de peinar con keratina + Aceite de argán", separado: "S/ 167", para: "Cabello teñido, alisado, seco o con frizz", pres: "Kit de 3 productos" },
  KT02: { incluye: "Gel limpiador facial pH bajo + Sérum de niacinamida 10 % + zinc + Protector solar facial FPS 50", separado: "S/ 197", para: "Piel mixta o grasa, con brillo o acné", pres: "Kit de 3 productos" },
  KT03: { incluye: "Shampoo sin sal con queratina + Mascarilla de hidratación profunda + Aceite de argán", separado: "S/ 177", para: "Cabello dañado por tinte, plancha o sol", pres: "Kit de 3 productos" },
  KT04: { incluye: "Sérum de ácido hialurónico + Contorno de ojos con cafeína + Mascarillas faciales en lámina (× 5)", separado: "S/ 177", para: "Para regalar: hidratación de rostro y ojos", pres: "Kit de 3 productos", extra: [["Presentación de regalo", "En caja de regalo con tarjeta"]] },
  KT05: { incluye: "Protector solar facial FPS 50 + Protector solar corporal FPS 50", separado: "S/ 138", para: "Toda la familia", pres: "Kit de 2 productos" },
  "MU013-2": { incluye: "2 × Protector solar facial FPS 50", separado: "S/ 158", para: "Todas las pieles, todos los días", pres: "2 unidades de 50 ml" },
  "MU016-2": { incluye: "2 × Mascarillas faciales en lámina (× 5)", separado: "S/ 78", para: "Todas; ideal para regalar", pres: "2 packs de 5 láminas (10 láminas)" },
};

const sentence = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const recorta = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
type Fila = { label: string; value: string };

function deseadoDe(codigo: string, nombre: string, categoria: string) {
  const f = FICHAS[codigo];
  const k = KITS[codigo];
  const specs: Fila[] = [];
  let desc: string;
  if (f) {
    specs.push({ label: "Qué hace", value: f.hace }, { label: "Para quién", value: f.para }, { label: "Modo de uso", value: f.uso }, { label: "Presentación", value: f.pres });
    if (f.ingr) specs.push({ label: "Ingredientes clave", value: f.ingr });
    for (const [label, value] of f.extra ?? []) specs.push({ label, value });
    desc = `${f.hace}. Para ${sentence(f.para)}.`;
  } else if (k) {
    specs.push({ label: "Incluye", value: k.incluye }, { label: "Precio por separado", value: k.separado }, { label: "Para quién", value: k.para }, { label: "Modo de uso", value: USO_KIT }, { label: "Presentación", value: k.pres });
    for (const [label, value] of k.extra ?? []) specs.push({ label, value });
    desc = `${nombre}: ${k.incluye}. Ahorras frente a comprarlos por separado (${k.separado}).`;
  } else throw new Error(`sin ficha para ${codigo}`);
  const metaTitle = recorta(`${nombre} | Musa`, 70);
  const metaDescription = recorta(`${desc} Asesoría gratis por WhatsApp. Musa, belleza profesional en Ciudad Constitución.`, 160);
  const kw = Array.from(new Set(["musa", "belleza profesional", "Ciudad Constitución", categoria.toLowerCase(), nombre.toLowerCase()]));
  return { specsJson: JSON.stringify(specs), metaTitle, metaDescription, metaKeywordsJson: JSON.stringify(kw), sku: codigo };
}

async function productos() {
  const codigos = [...Object.keys(FICHAS), ...Object.keys(KITS)];
  const ids = await ProductsDB.listByBarcodes(TENANT, codigos);
  const todos = (await Promise.all(ids.map((r) => ProductsDB.getById(TENANT, r.id)))).filter((p): p is NonNullable<typeof p> => !!p);
  const faltan = codigos.filter((c) => !todos.some((p) => p.barcode === c));
  if (faltan.length) pendientes.push(`Códigos del manual sin producto en el sistema: ${faltan.join(", ")}`);
  const antes: Record<string, unknown> = {};
  let conUso = 0;
  const sinFicha: string[] = [];
  for (const p of todos) {
    const codigo = (p.barcode ?? "").trim();
    if (!FICHAS[codigo] && !KITS[codigo]) { sinFicha.push(codigo); continue; }
    const d = deseadoDe(codigo, p.name, p.category);
    const seo = await MarketplaceProductsDB.getSeoMeta(TENANT, p.id);
    antes[codigo] = { id: p.id, sku: p.sku ?? null, brand: p.brand ?? null, specsJson: p.specsJson ?? null, metaTitle: seo?.metaTitle ?? null, metaDescription: seo?.metaDescription ?? null, metaKeywordsJson: seo?.metaKeywordsJson ?? null };
    // Las que ya tienen la ficha completa no se tocan.
    const cambiaProd = !igual(p.specsJson, d.specsJson) || p.sku !== d.sku;
    const cambiaSeo = !seo || seo.metaTitle !== d.metaTitle || seo.metaDescription !== d.metaDescription || seo.metaKeywordsJson !== d.metaKeywordsJson;
    if (cambiaProd) cambios.push({ area: `ficha ${codigo}`, campo: "specsJson + sku", antes: { sku: p.sku ?? null, specsJson: p.specsJson ?? null }, despues: { sku: d.sku, specsJson: d.specsJson } });
    if (cambiaSeo) cambios.push({ area: `ficha ${codigo}`, campo: "SEO", antes: seo?.metaTitle ?? null, despues: d.metaTitle });
    if (!SIMULACRO) {
      if (cambiaProd) await tolerandoNext(() => ProductsDB.upsert({ ...p, specsJson: d.specsJson, sku: d.sku }));
      if (cambiaSeo) await tolerandoNext(() => MarketplaceProductsDB.updateSeoMeta(TENANT, p.id, { metaTitle: d.metaTitle, metaDescription: d.metaDescription, metaKeywordsJson: d.metaKeywordsJson }));
    }
    if (FICHAS[codigo]) conUso++;
  }
  respaldo.productos = antes;
  if (sinFicha.length) pendientes.push(`Productos con código de barras sin ficha en el script: ${sinFicha.join(", ")}`);
  pendientes.push("N.° de NSO de cada producto: la columna del manual (§15) está vacía; sin NSO no entra al almacén. No se cargó ninguno");
  pendientes.push("Marca de cada producto (proveedor definitivo: rostro/cuerpo a yepo es PROVISIONAL; cabello, Procab): no se cargó ninguna");
  console.log(`  fichas MU con datos del manual: ${conUso}; total fichas procesadas: ${Object.keys(antes).length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PLANTILLAS DE MENSAJES (manual §20, §18, §19; variables {entre llaves})
// ─────────────────────────────────────────────────────────────────────────────
interface Plantilla { name: string; category: string; body: string; vars: string[]; starred?: boolean; delManual: boolean }
const PLANTILLAS: Plantilla[] = [
  { name: "Bienvenida", category: "atención", starred: true, delManual: true, vars: [],
    body: "¡Hola, linda! Gracias por escribir a Musa, belleza profesional cerca de ti. ¿Buscas algo para tu cabello, rostro o piel? Te asesoro sin compromiso. — Drucila" },
  { name: "Confirmación de pedido (obligatoria)", category: "ventas", starred: true, delManual: true, vars: ["productos", "total", "envio", "direccion", "dia", "forma_de_pago"],
    body: "Confirmo tu pedido: {productos} por S/ {total}, {envio}, a {direccion}, llega aprox. el {dia}. Pago: {forma_de_pago}. ¿Me confirmas con un «sí» para enviarlo hoy?" },
  { name: "Pago recibido", category: "cobranza", delManual: false, vars: ["nombre", "total"],
    body: "¡Gracias, {nombre}! Recibimos tu pago de S/ {total}. Ya estoy preparando tu pedido y te aviso apenas salga. — Drucila" },
  { name: "Pedido en camino", category: "delivery", delManual: true, vars: ["agencia", "codigo"],
    body: "¡Tu pedido ya salió! Agencia {agencia}, código {codigo}. Cualquier cosa me escribes. — Drucila" },
  { name: "Seguimiento día 3", category: "atención", delManual: true, vars: ["producto"],
    body: "¿Qué tal te fue con tu {producto}? Si te gustó, ¿me mandas una foto o un mensajito? Te dejo 10 % para tu próxima compra." },
  { name: "Seguimiento día 15", category: "atención", delManual: true, vars: ["nombre", "producto", "cabello_o_piel"],
    body: "Hola, {nombre}. Ya van 2 semanas con tu {producto}: ¿cómo sientes tu {cabello_o_piel}? Mándame una foto y te digo si vamos bien." },
  { name: "Seguimiento día 30 (recompra)", category: "ventas", delManual: true, vars: ["nombre", "producto"],
    body: "Hola, {nombre}. Tu {producto} ya debe estar por acabarse. ¿Te separo otro? Esta semana te lo llevo con tu 10 %." },
  { name: "Reclamo o producto con problema", category: "atención", delManual: false, vars: ["nombre", "producto"],
    body: "Hola, {nombre}. Lamento lo que pasó con tu {producto}. Si llegó dañado, vencido o equivocado, te lo cambiamos sin costo (mándame una foto, tienes 7 días). Si no tenemos con qué cambiarlo, te devolvemos el dinero por Yape en 48 horas. Si te irritó la piel, deja de usarlo y cuéntame hoy mismo; si hace falta, consulta a un médico. — Drucila" },
  { name: "Trae a una amiga", category: "promociones", delManual: true, vars: [],
    body: "Si una amiga compra diciendo tu nombre, las dos reciben S/ 10 para su próxima compra. ¡Comparte nuestro catálogo!" },
  { name: "Producto agotado", category: "ventas", delManual: true, vars: ["fecha", "alternativa"],
    body: "Ese producto se nos acabó, llega el {fecha}. ¿Te lo separo con S/ 10, o te recomiendo {alternativa} que tenemos hoy?" },
  { name: "Preventa de Navidad", category: "promociones", delManual: true, vars: [],
    body: "Separa tu kit de Navidad con S/ 20 y te lo entregamos en caja de regalo hasta el 23 de diciembre. Quedan pocos cupos." },
  { name: "Fuera de horario", category: "atención", starred: true, delManual: true, vars: [],
    body: "¡Hola, linda! Gracias por escribir a Musa. Te atendemos de lunes a sábado de 9:00 a 20:00. Déjanos tu consulta y mañana temprano te respondemos. — Drucila" },
  { name: "Tu compra está protegida", category: "atención", delManual: true, vars: [],
    body: "Tu compra está protegida:\n• Si llega dañado, vencido o equivocado, te lo cambiamos sin costo (avísanos en 7 días con foto).\n• Si no tenemos el producto para cambiarlo, te devolvemos el dinero por Yape en 48 horas.\n• Por higiene, abiertos o sin sello no se devuelven (salvo falla).\n• Asesoría gratis antes de comprar.\n• Todos los productos son originales y con NSO." },
];

async function plantillas() {
  const existentes = await MessageTemplatesDB.list(TENANT);
  respaldo.plantillas = existentes.map((t) => ({ id: t.id, name: t.name, channel: t.channel, category: t.category, body: t.body }));
  let creadas = 0, actualizadas = 0;
  for (const p of PLANTILLAS) {
    const ya = existentes.find((t) => t.name === p.name);
    const variablesJson = JSON.stringify(p.vars);
    if (!ya) {
      cambios.push({ area: "plantillas", campo: p.name, antes: null, despues: "nueva" });
      creadas++;
      if (!SIMULACRO) await MessageTemplatesDB.create(TENANT, { name: p.name, channel: "whatsapp", category: p.category, subject: null, body: p.body, variablesJson, starred: p.starred ?? false });
    } else if (ya.body !== p.body || ya.category !== p.category || ya.variablesJson !== variablesJson || ya.channel !== "whatsapp") {
      cambios.push({ area: "plantillas", campo: p.name, antes: ya.body, despues: p.body });
      actualizadas++;
      if (!SIMULACRO) await MessageTemplatesDB.update(TENANT, ya.id, { body: p.body, category: p.category, channel: "whatsapp", variablesJson });
    }
  }
  console.log(`  plantillas: ${creadas} nuevas, ${actualizadas} actualizadas, ${PLANTILLAS.length} en total`);
  const propias = PLANTILLAS.filter((p) => !p.delManual).map((p) => p.name);
  pendientes.push(`Plantillas que el manual NO trae (redacté yo con sus reglas, revisar tono): ${propias.join(" · ")}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SELLOS (manual §9-10: «6.ª compra con 20 %»; descuentos no se suman)
// ─────────────────────────────────────────────────────────────────────────────
async function sellos() {
  const cur = await SellosDB.config(TENANT);
  respaldo.sellos = cur;
  // La tarjeta cuenta compras CERRADAS; con 5 llenas, la 6.ª lleva el 20 %.
  const deseada = { activo: true, compras: 5, premio: "20 % de descuento en tu 6.ª compra", desde: "2026-11-09", minimo: 0 };
  if (!igual(cur, deseada)) {
    cambios.push({ area: "sellos", campo: "tarjeta", antes: cur, despues: deseada });
    if (!SIMULACRO) await SellosDB.guardarConfig(TENANT, deseada);
  }
  // Referidas (ADR-510): ya son configurables; las carga `scripts/musa/cargar-referidas.ts`.
  // Rubro «belleza» (ADR-509): existe, pero Musa se cambia después de publicar el Prisma nuevo (`poner-rubro-belleza.ts --prod-al-dia`).
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${SIMULACRO ? "SIMULACRO (no escribe)" : "CARGA REAL"} · tenant ${TENANT} (${SLUG})`);
  await ajustes();
  await productos();
  await plantillas();
  await sellos();

  console.log(`\n── ${cambios.length} cambio(s) ${SIMULACRO ? "que haría" : "aplicados"} ──`);
  for (const c of cambios) console.log(`  [${c.area}] ${c.campo}: ${corto(c.antes)}  →  ${corto(c.despues)}`);

  if (!SIMULACRO && cambios.length) {
    const dir = path.resolve(process.cwd(), ".claude/autonomo/respaldos");
    fs.mkdirSync(dir, { recursive: true });
    const sello = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const archivo = path.join(dir, `musa-ajustes-productos-${sello}-antes.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
    console.log(`\nRespaldo de lo que pisó: ${archivo}`);
  }
  console.log("\n── PENDIENTES (el manual no lo trae) ──");
  for (const p of pendientes) console.log(`  · ${p}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FALLÓ:", e);
  process.exit(1);
});
