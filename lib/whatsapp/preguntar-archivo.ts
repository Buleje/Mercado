/**
 * lib/whatsapp/preguntar-archivo.ts
 *
 * «Preguntarle al Archivo por WhatsApp» — la parte PURA (sin red ni base).
 *
 *   Vos: ¿qué está vencido?
 *   Bot: 🗂️ Encontré 5 papeles · vencidos
 *        📄 *qa-ui-dni-jefe.jpg* · Jefe - representante · venció 20/10/2026
 *        https://…/admin?tab=documentos&vista=drive&doc=…
 *        …
 *
 *   Vos: mándame el contrato del local
 *   Bot: (manda el archivo, con su nombre, como adjunto)
 *
 * ── Por qué un pre-ruteo y no el asistente ───────────────────────────────────
 * El asistente (`conversar`) ya tiene un dominio `documentos`, pero para ESTO
 * es el camino equivocado: gasta del tope de 8.000 tokens POR MINUTO de Groq
 * para una pregunta que no necesita modelo, cuando Groq da 429 contesta
 * «no pude», redacta la lista a su manera (sin los enlaces, que no conoce) y no
 * sabe mandar un archivo. Una pregunta por papeles se reconoce con palabras:
 * acá se decide sin modelo, se busca con el MISMO lector de frases del Archivo
 * (`interpretarBusqueda`, el de los chips «Entendí: …») y se contesta siempre
 * igual. Lo que no es claramente una pregunta por papeles sigue a `conversar`
 * exactamente como antes.
 *
 * ── La regla del ruteo (cada parte tiene su test) ────────────────────────────
 *  1. Si suena a plata o a agenda (anotá, gasté, me debe, cuota, soles,
 *     recordame…), NO es de acá: un dictado robado es una operación que no se
 *     anotó, y eso es mucho peor que una pregunta que contestó el modelo.
 *  2. Tiene que hablar de un papel (DNI, contrato, licencia, PDF, «papeles»…)
 *     o de vencimientos (vencido, vence este año, caduca).
 *  3. Y tiene que ser una pregunta («¿…?», dónde, qué, tienes…), un pedido
 *     (mándame, pásame…) o una frase corta que empieza por el papel
 *     («DNI del jefe», «vencidos»).
 */
import {
  interpretarBusqueda,
  plegar,
  type BusquedaInterpretada,
  type CarpetaBuscable,
} from "@/lib/documentos/busqueda-natural";
import { leerPedidoDeEnvio } from "@/lib/asistente/mandar-papel";

// ── Ruteo ───────────────────────────────────────────────────────────────────

export interface PreguntaDePapeles {
  /** La frase sin el envoltorio («¿dónde está…?», «mándame»): lo que se busca. */
  frase: string;
  /** Pidió el ARCHIVO («mándame», «pásame»), no sólo saber dónde está. */
  mandar: boolean;
}

/** Pedir el archivo. Con y sin pronombre pegado, con y sin voseo. */
const PEDIR_ENVIO = new Set([
  "mandame", "mandamelo", "mandamela", "mandamelos", "mandamelas", "mandalo", "mandala", "manda", "mandas",
  "mandarme", "mandarmelo", "pasame", "pasamelo", "pasamela", "pasamelos", "pasalo", "pasala", "pasas", "pasarme",
  "enviame", "enviamelo", "enviamela", "envialo", "enviala", "envias", "enviarme", "reenviame", "reenviamelo",
  "reenvialo", "comparteme", "compartime", "compartemelo",
]);

/**
 * Plata y agenda: si aparece alguna, la frase va al asistente como siempre.
 * «cuanto/cuanta» (singular) es casi siempre plata; «cuántos contratos» no.
 */
const SUENA_A_PLATA_O_AGENDA = new Set([
  // anotar
  "anota", "anotame", "anotalo", "anotala", "anote", "anotar", "apunta", "apuntame", "registra", "registrame",
  // plata
  "gaste", "gastado", "gastamos", "gasto", "gastos", "pague", "pagado", "pagamos", "pagar", "pago", "pagos",
  "pagaron", "pagaste", "cobre", "cobrar", "cobro", "cobros", "cobranza", "cobranzas", "cobrado",
  "vendi", "vendimos", "venta", "ventas", "vendido", "compre", "compramos", "compra", "compras",
  "adelante", "adelanto", "adelantos", "adelantado", "preste", "prestamo", "prestamos", "debe", "deben", "debo",
  "debes", "deuda", "deudas", "fiado", "fiados", "fio", "cuota", "cuotas", "letra", "letras", "soles", "sol",
  "lucas", "plata", "dinero", "caja", "sueldo", "sueldos", "jornal", "jornales", "flete", "fletes", "ganancia",
  "ganancias", "ingreso", "ingresos", "egreso", "egresos", "cuanto", "cuanta", "precio", "precios",
  // agenda
  "recordame", "recordarme", "recuerdame", "recordar", "recordatorio", "acordame", "avisame", "avisar",
  "agenda", "agendame", "agendar", "agendalo", "programa", "programame", "cita", "citas", "reunion",
  "reuniones", "llamar", "visitar", "renovar", "tramitar",
]);

/** Palabras que nombran un papel y que el lector de frases no trata como tipo (van como texto). */
const NOMBRA_UN_PAPEL = new Set([
  "papel", "papeles", "documento", "documentos", "doc", "docs", "archivo", "archivos", "carpeta", "carpetas",
  "carnet", "licencia", "licencias", "brevete", "brevetes", "soat", "poliza", "polizas", "certificado",
  "certificados", "constancia", "constancias", "partida", "partidas", "escritura", "escrituras", "pasaporte",
  "pasaportes", "acta", "actas", "plano", "planos", "copia", "copias", "escaneado", "escaneados",
  "escaneada", "escaneadas",
]);

/**
 * «licencia» sola es casi siempre la del personal («¿cuántos días de licencia le
 * quedan a Juan?»); la del papel trae apellido («de funcionamiento», «de
 * conducir») o viene en un pedido («mándame la licencia»).
 */
const LICENCIA = /^licencias?$/;
const APELLIDO_DE_LICENCIA = new Set([
  "funcionamiento", "conducir", "municipal", "municipales", "sanitaria", "edificacion", "construccion",
  "operacion", "operaciones", "ambiental",
]);

function nombraUnPapelEn(tk: Token[], i: number, mandar: boolean): boolean {
  if (!NOMBRA_UN_PAPEL.has(tk[i].t)) return false;
  if (mandar || !LICENCIA.test(tk[i].t)) return true;
  return tk.slice(i + 1, i + 4).some((x) => APELLIDO_DE_LICENCIA.has(x.t));
}

/**
 * «la guía 123» es casi siempre la del LIBRO (el asistente forestal la busca en
 * el libro CTP), no un papel del Archivo. Sola, sigue al asistente; con un
 * pedido («mándame la GTF») o un vencimiento, sí es de acá.
 */
const ES_GUIA = /^(gu[ií]as?|gtfs?)$/i;

/** Vencimientos. «caduca/expira» se traducen a «vence» antes de leer la frase. */
const HABLA_DE_VENCER = /^(vence|vencen|vencer|vencera|venceran|vencido|vencidos|vencida|vencidas|vencio|vencieron|vencimiento|vencimientos|caduca|caducan|caducado|caducados|caducada|caducadas|caduco|expira|expiran|expirado|expirados|expiro)$/;
const SINONIMOS_VENCER: Record<string, string> = {
  caduca: "vence", caducan: "vencen", caducado: "vencido", caducados: "vencidos", caducada: "vencida",
  caducadas: "vencidas", caduco: "vencio", expira: "vence", expiran: "vencen", expirado: "vencido",
  expirados: "vencidos", expiro: "vencio",
};

/**
 * «el SOAT vence mañana» AFIRMA una fecha (es para la agenda), «¿cuándo vence
 * el SOAT?» o «papeles que vencen este mes» la PREGUNTAN. El verbo conjugado
 * sin pregunta ni «que/cuando» delante es una afirmación.
 */
const VERBO_VENCER = /^(vence|vencen|vencer|vencera|venceran|vencio|vencieron|caduca|caducan|caduco|expira|expiran|expiro)$/;
const ANTES_DE_RELATIVA = new Set(["que", "cuando", "cual", "cuales", "donde"]);

/** Plata: «anótale», «apúntalo»… cualquier forma de anotar. */
const ES_ANOTAR = /^(anot|apunt)/;

/**
 * Un MONTO: un número que no es fecha, plazo, cantidad de papeles ni número de
 * documento. «y anótale 50» es plata; «el 15», «2026», «30 días», «15 de
 * octubre», «3 facturas», «guía 123», «DNI 45678912» no lo son.
 */
const NUMERO = /^\d+(?:[.,]\d+)*$/;
const MESES = new Set([
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "septiembre",
  "octubre", "noviembre", "diciembre",
]);
const PERIODO = new Set(["dia", "dias", "semana", "semanas", "mes", "meses", "ano", "anos", "año", "años", "hora", "horas"]);
const ANTES_DE_DIA = new Set(["el", "al", "del", "hasta", "desde", "dia"]);
const ANTES_DE_NUMERO_DE_PAPEL = new Set(["nro", "numero", "num", "no", "n"]);

function esPapelOTipo(x: Token | undefined): boolean {
  if (!x) return false;
  if (NOMBRA_UN_PAPEL.has(x.t) || ES_GUIA.test(x.t) || ANTES_DE_NUMERO_DE_PAPEL.has(x.t)) return true;
  return interpretarBusqueda(x.crudo).entendi.some((c) => c.tipo === "tipo" || c.tipo === "papel");
}

function esMonto(tk: Token[], i: number): boolean {
  const n = tk[i].crudo.replace(/[.,]+$/, "");
  if (!NUMERO.test(n)) return false;
  const digitos = n.replace(/\D/g, "");
  if (digitos.length >= 7) return false; // DNI, RUC, celular: identificadores
  if (/^(19|20)\d\d$/.test(n)) return false; // un año
  const ant = tk[i - 1];
  const sig = tk[i + 1];
  if (sig && (PERIODO.has(sig.t) || MESES.has(sig.t))) return false; // «30 días», «15 octubre»
  if (sig?.t === "de" && tk[i + 2] && MESES.has(tk[i + 2].t)) return false; // «15 de octubre»
  if (Number(digitos) <= 31 && ant && ANTES_DE_DIA.has(ant.t)) return false; // «el 15»
  if (esPapelOTipo(sig) || esPapelOTipo(ant)) return false; // «3 facturas», «guía 123»
  return true;
}

/** Cómo empieza una pregunta o un pedido de búsqueda. */
const ABRE_PREGUNTA = new Set([
  "que", "cual", "cuales", "donde", "cuando", "tienes", "tenes", "tengo", "tenemos", "hay", "cuantos", "cuantas",
  "busca", "buscame", "buscar", "encuentra", "encuentrame", "ubica", "ubicame", "muestrame", "mostrame",
  "ensename", "dame", "necesito", "quiero", "ver", "sabes", "puedes", "podes", "podrias", "oye", "hola",
]);

/**
 * El envoltorio de la pregunta: se saca antes de buscar porque el lector de
 * frases del Archivo buscaría «mándame» o «tienes» como texto (TODAS las
 * palabras), y ningún papel las tiene. El resto del relleno («el», «de»,
 * «dónde», «está») ya lo sabe ignorar él.
 */
const ENVOLTORIO = new Set([
  ...PEDIR_ENVIO,
  "tienes", "tenes", "tiene", "tendras", "tendrias", "puedes", "podes", "podrias", "sabes", "ubicas", "ubica",
  "ubicame", "buscame", "encuentrame", "encontras", "hola", "oye", "porfis", "please", "guarde", "guardaste",
  "guardado", "guardada", "guardamos", "deje", "dejaste", "quedo", "cuando", "cuantos", "cuantas", "dime", "decime",
  "mostrame", "ensename", "archivo",
]);

interface Token {
  crudo: string;
  t: string;
}

function tokens(texto: string): Token[] {
  return texto
    .split(/[\s,;:]+/)
    .map((crudo) => ({ crudo: crudo.replace(/[¿?¡!«»"“”]/g, ""), t: plegar(crudo).replace(/[^a-z0-9/ñ]/g, "") }))
    .filter((x) => x.t !== "");
}

/** Una frase que es TODA nombre de papel o vencimiento, corta: «DNI del jefe», «vencidos». */
const RELLENO_CORTO = new Set(["el", "la", "los", "las", "mi", "mis", "lo", "que", "de", "del", "un", "una"]);

/**
 * ¿Es una pregunta por papeles? `null` = no: sigue al asistente como siempre.
 */
export function leerPreguntaDePapeles(texto: string | null | undefined): PreguntaDePapeles | null {
  const crudo = (texto ?? "").trim();
  if (!crudo || crudo.length > 300) return null;
  // «Manda la resolución a Alex» es para OTRA persona: va al asistente, que
  // pregunta «¿Mando X a Alex (+51 9•• ••• 123)?» antes de mandar. Contestarle
  // acá le devolvería el papel al dueño como si lo hubiera pedido para él.
  if (leerPedidoDeEnvio(crudo)) return null;
  const tk = tokens(crudo);
  if (tk.length === 0 || tk.length > 25) return null;

  // 1. Plata o agenda: nunca acá. «S/ 300», «anótale», «y 50» también.
  if (tk.some((x, i) => SUENA_A_PLATA_O_AGENDA.has(x.t) || ES_ANOTAR.test(x.t) || /^s\/\d*$/.test(x.t) || esMonto(tk, i))) {
    return null;
  }

  const mandar = tk.some((x) => PEDIR_ENVIO.has(x.t));
  const venceAlgo = tk.some((x) => HABLA_DE_VENCER.test(x.t));
  const sinEnvoltorio = tk.filter((x) => !ENVOLTORIO.has(x.t));
  const frase = sinEnvoltorio
    .map((x) => (SINONIMOS_VENCER[x.t] ? SINONIMOS_VENCER[x.t] : x.crudo))
    .join(" ")
    .trim();

  // 2. ¿Habla de un papel? Lo que el lector del Archivo reconoce como tipo
  //    (contrato, DNI, factura, PDF, foto, «por WhatsApp»…) o una palabra que nombra uno.
  const interp = interpretarBusqueda(frase);
  const nombraPapel =
    tk.some((_, i) => nombraUnPapelEn(tk, i, mandar)) ||
    interp.entendi.some(
      (c) => (c.tipo === "papel" || c.tipo === "tipo" || c.tipo === "origen") && (mandar || !ES_GUIA.test(plegar(c.texto))),
    );
  if (!nombraPapel && !venceAlgo) return null;

  // 3. ¿Pregunta, pedido o frase corta que empieza por el papel?
  const pregunta = /[¿?]/.test(crudo) || ABRE_PREGUNTA.has(tk[0].t);
  // «el SOAT vence mañana»: afirma una fecha → agenda, no búsqueda.
  const afirmaQueVence =
    !pregunta && !mandar && tk.some((x, i) => VERBO_VENCER.test(x.t) && !ANTES_DE_RELATIVA.has(tk[i - 1]?.t ?? ""));
  if (afirmaQueVence) return null;
  const iPrimera = tk.findIndex((x) => !RELLENO_CORTO.has(x.t));
  const primera = iPrimera >= 0 ? tk[iPrimera] : undefined;
  const corta =
    tk.length <= 6 &&
    !!primera &&
    (nombraUnPapelEn(tk, iPrimera, mandar) ||
      HABLA_DE_VENCER.test(primera.t) ||
      (!ES_GUIA.test(primera.t) && interpretarBusqueda(primera.crudo).grupos.length > 0));
  if (!pregunta && !mandar && !corta) return null;

  return { frase, mandar };
}

// ── Respuesta ───────────────────────────────────────────────────────────────

/** Lo que hace falta de cada papel para contestar (subconjunto de `DbDocument`). */
export interface PapelEncontrado {
  id: string;
  name: string;
  folderId: string | null;
  expiresAt: string | null;
  favorite?: boolean;
  uploadedAt?: string | null;
}

/** Cuántos papeles se listan en el mensaje; el resto va con el enlace a la búsqueda. */
export const MAX_EN_EL_MENSAJE = 5;

/** `https://dominio` del panel, sin barra al final. Igual que `archivar-papel.ts`. */
export function baseDelPanel(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe").replace(/\/+$/, "");
}

export function enlaceAPapel(base: string, docId: string): string {
  return `${base}/admin?tab=documentos&vista=drive&doc=${encodeURIComponent(docId)}`;
}

/** El Archivo abierto con la búsqueda escrita (la pantalla la lee con el mismo lector). */
export function enlaceABusqueda(base: string, frase: string): string {
  const q = frase.trim();
  return `${base}/admin?tab=documentos&vista=drive${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}

/** «Hoy» = el día de Lima (UTC−5 todo el año). */
export function hoyEnLima(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * El vencimiento se guarda como día de calendario (00:00Z a mano, 12:00Z por
 * OCR): el día es la fecha UTC, sin pasarla por Lima.
 */
function diaDelVencimiento(expiresAt: string): string {
  return String(expiresAt).slice(0, 10);
}

const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function textoDelVencimiento(expiresAt: string | null, hoy: string): string | null {
  if (!expiresAt) return null;
  const dia = diaDelVencimiento(expiresAt);
  if (dia < hoy) return `venció ${ddmmaaaa(dia)}`;
  if (dia === hoy) return "vence hoy";
  return `vence ${ddmmaaaa(dia)}`;
}

/** Lo que se entendió, en palabras: «vencidos · DNI · «jefe»». */
export function loQueBusque(interp: BusquedaInterpretada): string {
  const partes = interp.entendi.map((c) => (c.tipo === "texto" ? `«${c.texto.replace(/^texto:\s*/, "")}»` : c.texto));
  return partes.join(" · ") || "todo el Archivo";
}

/**
 * El orden de la respuesta. Con un vencimiento pedido, por fecha: lo vencido
 * más reciente primero (lo de hace dos años ya se sabe), lo que viene, lo más
 * próximo primero. Con texto, primero los que lo tienen EN EL NOMBRE: «el
 * contrato del local» es el papel que se llama así, no el que lo menciona en
 * la página 4.
 */
export function ordenarParaResponder(
  docs: readonly PapelEncontrado[],
  interp: BusquedaInterpretada,
  hoy: string,
): PapelEncontrado[] {
  const lista = [...docs];
  if (interp.vence && interp.vence !== "sin") {
    const hasta = interp.vence.hasta?.slice(0, 10);
    const pasado = !!hasta && hasta <= hoy;
    return lista.sort((a, b) => {
      const da = a.expiresAt ? diaDelVencimiento(a.expiresAt) : "";
      const db = b.expiresAt ? diaDelVencimiento(b.expiresAt) : "";
      return pasado ? db.localeCompare(da) : da.localeCompare(db);
    });
  }
  const palabras = palabrasDelTexto(interp);
  if (palabras.length === 0) return lista;
  const enNombre = (d: PapelEncontrado) => palabras.every((p) => plegar(d.name).includes(p));
  return lista.sort((a, b) => Number(enNombre(b)) - Number(enNombre(a)));
}

function palabrasDelTexto(interp: BusquedaInterpretada): string[] {
  return plegar(interp.texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length > 1);
}

/**
 * El papel a mandar cuando pidió «mándame…»: uno solo, o uno solo que lo dice
 * en el nombre. Con dos que podrían ser, no se adivina: se pregunta cuál.
 */
export function papelParaMandar(
  docs: readonly PapelEncontrado[],
  interp: BusquedaInterpretada,
): PapelEncontrado | null {
  if (docs.length === 1) return docs[0];
  const palabras = palabrasDelTexto(interp);
  if (palabras.length === 0) return null;
  const conNombre = docs.filter((d) => palabras.every((p) => plegar(d.name).includes(p)));
  return conNombre.length === 1 ? conNombre[0] : null;
}

export interface DatosDeLaRespuesta {
  pregunta: PreguntaDePapeles;
  interp: BusquedaInterpretada;
  /** Ya ordenados (`ordenarParaResponder`). */
  docs: readonly PapelEncontrado[];
  carpetas: readonly CarpetaBuscable[];
  base: string;
  hoy: string;
  /** Con 0 resultados en «vence este año», cuántos YA vencieron: es la pista útil. */
  vencidosAparte?: number;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Una línea por papel: «📄 *Nombre* · Carpeta · vence 31/01/2030» y el enlace debajo. */
export function lineaDelPapel(d: PapelEncontrado, carpetas: ReadonlyMap<string, string>, base: string, hoy: string): string {
  const carpeta = d.folderId ? carpetas.get(d.folderId) : null;
  const vence = textoDelVencimiento(d.expiresAt, hoy);
  const cabeza = [`📄 *${d.name}*`, carpeta, vence].filter(Boolean).join(" · ");
  return `${cabeza}\n${enlaceAPapel(base, d.id)}`;
}

/** El texto de la respuesta (lo que se manda cuando NO va un archivo adjunto). */
export function armarRespuesta(r: DatosDeLaRespuesta): string {
  const { interp, docs, base, hoy, pregunta } = r;
  const busque = loQueBusque(interp);
  const enlaceTodo = enlaceABusqueda(base, pregunta.frase);

  if (interp.soloRelleno || (interp.entendi.length === 0 && !interp.texto.trim())) {
    return (
      "🗂️ ¿Qué papel buscas? Por ejemplo:\n" +
      "• «¿dónde está el DNI de Juan?»\n" +
      "• «¿qué está vencido?» · «¿qué vence este año?»\n" +
      "• «mándame el contrato del local»\n\n" +
      `Tu Archivo: ${enlaceABusqueda(base, "")}`
    );
  }

  if (docs.length === 0) {
    const pista =
      interp.vence && interp.vence !== "sin"
        ? r.vencidosAparte
          ? `Ojo: tienes ${plural(r.vencidosAparte, "papel ya vencido", "papeles ya vencidos")}. Escríbeme «¿qué está vencido?».`
          : "Sólo cuentan los papeles con su fecha de vencimiento anotada (en el Archivo: Detalles › Vence)."
        : "Prueba con menos palabras o con el nombre del papel, o búscalo en el Archivo:\n" + enlaceTodo;
    return `🔎 Busqué: ${busque} → nada.\n\n${pista}`;
  }

  const nombres = new Map(r.carpetas.map((c) => [c.id, c.name]));
  const visibles = docs.slice(0, MAX_EN_EL_MENSAJE);
  const cabeza = `🗂️ Encontré ${plural(docs.length, "papel", "papeles")} · ${busque}`;
  const lineas = visibles.map((d) => lineaDelPapel(d, nombres, base, hoy));
  const resto = docs.length - visibles.length;
  const cola = resto > 0 ? `\n\n…y ${plural(resto, "más", "más")}: ${enlaceTodo}` : "";
  const cual =
    pregunta.mandar && docs.length > 1
      ? "\n\n¿Cuál te mando? Escríbeme «mándame» y su nombre."
      : "";
  return `${cabeza}\n\n${lineas.join("\n\n")}${cola}${cual}`;
}

/** El pie del archivo que se manda: qué es y dónde vive. */
export function pieDelArchivo(d: PapelEncontrado, carpetas: readonly CarpetaBuscable[], hoy: string): string {
  const carpeta = d.folderId ? carpetas.find((c) => c.id === d.folderId)?.name : null;
  const vence = textoDelVencimiento(d.expiresAt, hoy);
  return [`📄 ${d.name}`, carpeta, vence].filter(Boolean).join(" · ");
}
