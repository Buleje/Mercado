/**
 * El Directorio, de y hacia una planilla.
 *
 * Quien ya lleva sus proveedores en un Excel no va a cargarlos de a uno en un
 * formulario de veinte campos: o se importan, o el Directorio queda vacío y la
 * gente sigue tipeando el mismo RUC en cada guía. Y al revés: lo que está en la
 * libreta tiene que poder salir para mandarlo al contador o al regente.
 *
 * Las dos direcciones comparten las MISMAS columnas, así que lo exportado se
 * puede corregir en Excel y volver a entrar sin traducir nada.
 *
 * Puro: recibe celdas y devuelve filas interpretadas. Ni red ni Prisma.
 */

import {
  ROLES_PARTE,
  claveBusqueda,
  motivoDocInvalido,
  normalizarDocumento,
  normalizarNombre,
  parsearCoordenadas,
  partesParecidas,
  type DocTipo,
  type Parte,
  type ParteInput,
  type RolParte,
} from "./directorio";

type Celda = string | number | null | undefined;

/** Las columnas, en el orden en que salen y entran. */
export const COLUMNAS_DIRECTORIO = [
  "Nombre",
  "Tipo de documento",
  "Documento",
  "Roles",
  "Teléfono",
  "WhatsApp",
  "Email",
  "Dirección",
  "Departamento",
  "Provincia",
  "Distrito",
  "Título habilitante",
  "Resolución",
  "ARFFS",
  "Representante legal",
  "DNI del representante",
  "Registro MTC",
  "Licencia",
  "Banco",
  "N° de cuenta",
  "CCI",
  "Condición de pago",
  "Días de crédito",
  "Punto de acopio",
  "Cómo se llega",
  "Notas",
] as const;

// ── Salida ──────────────────────────────────────────────────────────────────

/**
 * Una celda de CSV. El separador es `;` y no `,` porque Excel en es-PE usa la
 * coma como decimal — el mismo criterio que el export de adelantos.
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  const s = valor == null ? "" : String(valor);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function filaDeParte(p: Parte): string[] {
  const acopio = p.acopioLat != null && p.acopioLng != null ? `${p.acopioLat}, ${p.acopioLng}` : "";
  return [
    p.nombre,
    p.docTipo ?? "",
    p.docNumero ?? "",
    p.roles.join(" "),
    p.telefono ?? "",
    p.whatsapp ?? "",
    p.email ?? "",
    p.direccion ?? "",
    p.region ?? "",
    p.provincia ?? "",
    p.distrito ?? "",
    p.tituloHabilitante ?? "",
    p.resolucion ?? "",
    p.arffs ?? "",
    p.representante ?? "",
    p.representanteDni ?? "",
    p.registroMtc ?? "",
    p.licencia ?? "",
    p.banco ?? "",
    p.cuentaNumero ?? "",
    p.cuentaCci ?? "",
    p.condicionPago ?? "",
    p.diasCredito == null ? "" : String(p.diasCredito),
    acopio,
    p.acopioReferencia ?? "",
    p.notas ?? "",
  ];
}

/**
 * La libreta como se abre en Excel. Se exporta LO QUE SE LE PASA —o sea, lo
 * filtrado en pantalla—: un export que ignora el filtro obliga a rehacer el
 * trabajo en la planilla.
 */
export function partesACsv(partes: readonly Parte[]): string {
  const filas = partes.map((p) => filaDeParte(p).map(celdaCsv).join(";"));
  // El BOM va primero o Excel se come las tildes.
  return `﻿${COLUMNAS_DIRECTORIO.join(";")}\n${filas.join("\n")}`;
}

/** La plantilla vacía, con una fila de ejemplo para que se vea qué va en cada columna. */
export function plantillaDePartesCsv(): string {
  const ejemplo = [
    "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS",
    "RUC",
    "20156698963",
    "proveedor",
    "961000111",
    "961000111",
    "comunidad@ejemplo.pe",
    "Caserío Santa Rosa s/n",
    "Ucayali",
    "Coronel Portillo",
    "Callería",
    "PER-001-2024",
    "RDR N° 123-2024",
    "GOREU",
    "Pedro Rinconada",
    "05040151",
    "",
    "",
    "BCP",
    "191-1234567-0-01",
    "00219100123456700159",
    "credito",
    "30",
    "-8.379100, -74.553900",
    "km 42, entrada a la derecha",
    "",
  ];
  return `﻿${COLUMNAS_DIRECTORIO.join(";")}\n${ejemplo.map(celdaCsv).join(";")}`;
}

// ── Entrada ─────────────────────────────────────────────────────────────────

/**
 * Cómo se llama cada columna en las planillas de verdad.
 *
 * Nadie escribe el encabezado igual que nosotros: «RAZON SOCIAL», «RUC/DNI»,
 * «Celular». Se compara sin tildes, sin mayúsculas y sin signos.
 */
const ALIAS: Record<string, string[]> = {
  nombre: ["nombre", "razon social", "razón social", "titular", "proveedor", "empresa", "nombre o razon social"],
  docTipo: ["tipo de documento", "tipo doc", "tipo"],
  docNumero: ["documento", "ruc", "dni", "ruc/dni", "nro documento", "n documento", "numero de documento"],
  roles: ["roles", "rol", "papel", "papeles"],
  telefono: ["telefono", "teléfono", "celular", "fono"],
  whatsapp: ["whatsapp", "wsp", "wasap"],
  email: ["email", "correo", "e-mail", "correo electronico"],
  direccion: ["direccion", "dirección", "domicilio"],
  region: ["departamento", "region", "región", "dpto"],
  provincia: ["provincia"],
  distrito: ["distrito"],
  tituloHabilitante: ["titulo habilitante", "título habilitante", "titulo", "permiso", "contrato"],
  resolucion: ["resolucion", "resolución", "n resolucion", "rdr"],
  arffs: ["arffs", "autoridad", "autoridad regional"],
  representante: ["representante legal", "representante", "apoderado"],
  representanteDni: ["dni del representante", "dni representante", "dni rep"],
  registroMtc: ["registro mtc", "mtc"],
  licencia: ["licencia", "licencia de conducir", "brevete"],
  banco: ["banco"],
  cuentaNumero: ["n de cuenta", "numero de cuenta", "cuenta", "nro cuenta"],
  cuentaCci: ["cci", "codigo interbancario", "cuenta interbancaria"],
  condicionPago: ["condicion de pago", "condición de pago", "forma de pago", "pago"],
  diasCredito: ["dias de credito", "días de crédito", "plazo", "dias credito"],
  acopio: ["punto de acopio", "coordenadas", "gps", "ubicacion", "ubicación"],
  acopioReferencia: ["como se llega", "cómo se llega", "referencia", "como llegar"],
  notas: ["notas", "observaciones", "comentario", "comentarios"],
};

const clave = (v: Celda): string =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[°º.]/g, "")
    .replace(/\s+/g, " ");

/** Qué columna del archivo corresponde a cada campo. `-1` = no vino. */
export function mapearEncabezados(fila: readonly Celda[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  const cabeceras = fila.map(clave);
  for (const [campo, alias] of Object.entries(ALIAS)) {
    mapa[campo] = cabeceras.findIndex((c) => alias.includes(c));
  }
  return mapa;
}

export interface FilaDePartes {
  /** Fila del archivo (1-based, contando el encabezado) — para el mensaje. */
  linea: number;
  input: ParteInput;
  /** `crear` o `actualizar` la ficha que ya existe con ese documento. */
  accion: "crear" | "actualizar";
  /** Ficha existente que se va a actualizar, o la parecida que conviene mirar. */
  coincide?: { id: string; nombre: string };
  /** Por qué se parece, cuando no es el documento: «se llama casi igual». */
  aviso?: string;
}

export interface ErrorDeFila {
  linea: number;
  nombre: string;
  motivo: string;
}

export interface ResultadoLecturaPartes {
  listas: FilaDePartes[];
  errores: ErrorDeFila[];
  /** Columnas del archivo que no se entendieron — se ignoran, pero se dicen. */
  columnasIgnoradas: string[];
}

const DOC_TIPOS_VALIDOS = ["RUC", "DNI", "CE", "PASAPORTE"] as const;

function rolesDe(v: Celda, porDefecto: RolParte): RolParte[] {
  const partes = String(v ?? "")
    .split(/[,;/|\s]+/)
    .map((x) => clave(x))
    .filter(Boolean);
  const validos = partes.filter((x): x is RolParte => (ROLES_PARTE as readonly string[]).includes(x));
  return validos.length ? Array.from(new Set(validos)) : [porDefecto];
}

function docTipoDe(v: Celda, numero: string): DocTipo | undefined {
  const t = clave(v).toUpperCase();
  const encontrado = DOC_TIPOS_VALIDOS.find((d) => d === t);
  if (encontrado) return encontrado;
  if (!numero) return undefined;
  // Sin columna de tipo se deduce del largo, que es como se lee en el papel:
  // 11 dígitos es RUC, 8 es DNI.
  const n = normalizarDocumento(numero);
  if (n.length === 11) return "RUC";
  if (n.length === 8) return "DNI";
  return undefined;
}

/**
 * Interpreta las filas de una planilla como partes del Directorio.
 *
 * No escribe nada: devuelve qué se crearía, qué se actualizaría y qué fila no
 * se puede importar y por qué. La confirmación es de quien mira la lista — un
 * importador que guarda primero y avisa después es cómo entran 51 fichas
 * duplicadas de una sentada.
 */
export function interpretarFilasDePartes(
  filas: readonly (readonly Celda[])[],
  existentes: readonly Parte[],
  rolPorDefecto: RolParte = "proveedor",
): ResultadoLecturaPartes {
  const sinVacias = filas.filter((f) => f.some((c) => String(c ?? "").trim() !== ""));
  if (sinVacias.length === 0) return { listas: [], errores: [], columnasIgnoradas: [] };

  const cab = sinVacias[0];
  const mapa = mapearEncabezados(cab);
  const usadas = new Set(Object.values(mapa).filter((i) => i >= 0));
  const columnasIgnoradas = cab
    .map((c, i) => (usadas.has(i) ? null : String(c ?? "").trim()))
    .filter((x): x is string => Boolean(x));

  const listas: FilaDePartes[] = [];
  const errores: ErrorDeFila[] = [];
  const vistos = new Map<string, number>();

  const celda = (f: readonly Celda[], campo: string): string => {
    const i = mapa[campo];
    return i >= 0 ? String(f[i] ?? "").trim() : "";
  };

  for (let k = 1; k < sinVacias.length; k++) {
    const f = sinVacias[k];
    const linea = k + 1;
    const nombre = normalizarNombre(celda(f, "nombre"));
    if (nombre.length < 2) {
      errores.push({ linea, nombre: nombre || "(sin nombre)", motivo: "La fila no tiene nombre o razón social." });
      continue;
    }

    const numero = normalizarDocumento(celda(f, "docNumero"));
    const docTipo = docTipoDe(celda(f, "docTipo"), numero);
    if (numero && docTipo) {
      const motivo = motivoDocInvalido(docTipo, numero);
      if (motivo) {
        errores.push({ linea, nombre, motivo });
        continue;
      }
    }

    // Dos filas del mismo archivo con el mismo documento son la misma parte
    // escrita dos veces: la segunda se rechaza con el número de la primera.
    const llaveDoc = numero ? `${docTipo}:${numero}` : "";
    if (llaveDoc && vistos.has(llaveDoc)) {
      errores.push({ linea, nombre, motivo: `Ese documento ya viene en la fila ${vistos.get(llaveDoc)} de este mismo archivo.` });
      continue;
    }
    if (llaveDoc) vistos.set(llaveDoc, linea);

    const punto = parsearCoordenadas(celda(f, "acopio"));
    const diasTexto = celda(f, "diasCredito").replace(/\D/g, "");
    const condicion = clave(celda(f, "condicionPago"));
    const esCredito = condicion.startsWith("cred");
    const esContado = condicion.startsWith("cont");

    const input: ParteInput = {
      roles: rolesDe(celda(f, "roles"), rolPorDefecto),
      nombre,
      ...(docTipo ? { docTipo } : {}),
      docNumero: numero,
      telefono: celda(f, "telefono"),
      whatsapp: celda(f, "whatsapp"),
      email: celda(f, "email"),
      direccion: celda(f, "direccion"),
      region: celda(f, "region"),
      provincia: celda(f, "provincia"),
      distrito: celda(f, "distrito"),
      tituloHabilitante: celda(f, "tituloHabilitante"),
      resolucion: celda(f, "resolucion"),
      arffs: celda(f, "arffs"),
      representante: celda(f, "representante"),
      representanteDni: celda(f, "representanteDni"),
      registroMtc: celda(f, "registroMtc"),
      licencia: celda(f, "licencia"),
      banco: celda(f, "banco"),
      cuentaNumero: celda(f, "cuentaNumero"),
      cuentaCci: celda(f, "cuentaCci"),
      ...(esCredito || esContado ? { condicionPago: esCredito ? ("credito" as const) : ("contado" as const) } : {}),
      ...(esCredito && diasTexto ? { diasCredito: Number(diasTexto) } : {}),
      ...(punto ? { acopioLat: punto.lat, acopioLng: punto.lng } : {}),
      acopioReferencia: celda(f, "acopioReferencia"),
      notas: celda(f, "notas"),
    };

    const mismoDoc = numero
      ? (existentes.find((p) => p.docTipo === docTipo && normalizarDocumento(p.docNumero ?? "") === numero) ?? null)
      : null;
    const parecida = mismoDoc
      ? null
      : (partesParecidas(nombre, existentes)[0] ??
        existentes.find((p) => claveBusqueda(p.nombre) === claveBusqueda(nombre)) ??
        null);

    listas.push({
      linea,
      input,
      accion: mismoDoc ? "actualizar" : "crear",
      ...(mismoDoc
        ? { coincide: { id: mismoDoc.id, nombre: mismoDoc.nombre } }
        : parecida
          ? {
              coincide: { id: parecida.id, nombre: parecida.nombre },
              aviso: `Se llama casi igual que «${parecida.nombre}», que ya está en la libreta.`,
            }
          : {}),
    });
  }

  return { listas, errores, columnasIgnoradas };
}
