/**
 * placa-peru — la Placa Única Nacional de Rodaje, leída con sus reglas.
 *
 * Por qué existe (Brandon 29-09-2026: «que se aplique el formato de caracteres
 * y cantidad de datos que tiene una placa oficial en Perú, para evitar
 * inventados»): las guías guardadas traían placas como «WRFWR242», «W3242G» o
 * «QA-450». Ninguna existe. En la guía de transporte forestal la placa es lo
 * primero que un puesto de control compara con el camión, y una placa que no
 * puede existir invalida la declaración jurada entera.
 *
 * El formato vigente (sistema de placas desde 2010, MTC/SUNARP):
 *
 *   · Vehículo mayor y remolque — 3 caracteres + 3 números: `W2D-853`. El
 *     1.º es una LETRA (la zona registral donde se inscribió), el 2.º y el 3.º
 *     son correlativos alfanuméricos y los tres últimos, números. Las dos
 *     placas reales de las guías de SERFOR de Blas lo cumplen: `V2H-901`,
 *     `W2D-853`.
 *   · Vehículo menor (moto) — 2 caracteres + 4 números: `AB-1234`. Se acepta,
 *     pero se avisa: un camión de madera no lleva placa de moto.
 *
 * La letra de zona se muestra (W = Huánuco, Junín y Pasco) y una letra fuera
 * de la tabla se avisa sin bloquear: hay series especiales y no se inventa una
 * regla que la norma no escribe.
 *
 * En un traslado FLUVIAL el casillero lleva la matrícula de la embarcación,
 * que no sigue este formato: ahí no se valida.
 *
 * PURO y client-safe: lo usan el formulario, `faltantesGtf` y la búsqueda.
 */

/** Letra inicial → zona registral (tabla del sistema vigente). */
export const ZONAS_PLACA: Readonly<Record<string, string>> = {
  A: "Lima y Callao",
  B: "Lima y Callao",
  C: "Lima y Callao",
  D: "Lima y Callao",
  F: "Lima y Callao",
  H: "Áncash",
  L: "Loreto",
  M: "Amazonas, Cajamarca y Lambayeque",
  K: "Amazonas, Cajamarca y Lambayeque",
  P: "Tumbes y Piura",
  S: "San Martín",
  T: "La Libertad",
  U: "Ucayali",
  V: "Arequipa",
  W: "Huánuco, Junín y Pasco",
  X: "Apurímac, Cusco y Madre de Dios",
  Y: "Ayacucho, Ica y Huancavelica",
  Z: "Moquegua, Puno y Tacna",
};

/** Ejemplo que se muestra en el campo: una placa real de una guía de Pasco. */
export const EJEMPLO_PLACA = "W2D-853";

export type TipoPlaca = "vehiculo" | "menor";

export type LecturaPlaca =
  | { estado: "vacia" }
  | {
      estado: "valida";
      /** Sin guion ni espacios, en mayúscula: la clave para comparar. */
      normalizada: string;
      /** Como se escribe en el papel: `W2D-853`. */
      formateada: string;
      tipo: TipoPlaca;
      letraZona: string;
      /** La zona registral de la letra, o `null` si no está en la tabla. */
      zona: string | null;
      /** Lo que conviene revisar sin bloquear (placa de moto, letra rara). */
      aviso: string | null;
    }
  | { estado: "invalida"; normalizada: string; motivo: string };

/** Sin guiones, puntos ni espacios, en mayúscula: `w2d 853` → `W2D853`. */
export function normalizarPlacaPeru(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

const MAYOR = /^[A-Z][A-Z0-9]{2}\d{3}$/;
const MENOR = /^[A-Z]{2}\d{4}$/;
/**
 * `AB-1234` ESCRITA así: dos letras, el separador y hasta cuatro números.
 * Hace falta porque sin guion es ambigua — `AB1234` también es `AB1-234`, un
 * formato de auto y de camión (MTC: «A1B-234, AB1-234, ABC-123»). En una guía
 * de madera lo normal es el camión: la moto sólo si se escribe con su guion.
 */
const MENOR_ESCRITA = /^\s*([A-Za-z]{2})\s*[-\s]\s*(\d{0,4})(?!\d)/;

/**
 * Lee una placa y dice si puede existir. «-», «/ -» y el vacío son «vacía».
 *
 * El casillero (31) de SERFOR es «Placa(s)»: trae la del camión y la del
 * remolque separadas por `/` (`V2H-901 / -`, `V2H-901 / W3A-123`). Se lee la
 * PRIMERA; la del remolque la separa `partirPlacasDeGuia`. Sin esto la guía
 * copiada de SERFOR salía «le sobran caracteres» con dos placas reales.
 */
export function leerPlaca(v: string | null | undefined): LecturaPlaca {
  const entero = String(v ?? "").trim();
  if (!entero || /^[-/\s]+$/.test(entero)) return { estado: "vacia" };
  const crudo = entero.includes("/") ? partirPlacasDeGuia(entero).placa : entero;
  if (!crudo) return { estado: "vacia" };
  const n = normalizarPlacaPeru(crudo);
  if (!n) return { estado: "vacia" };

  if (MENOR.test(n) && MENOR_ESCRITA.test(crudo)) {
    return {
      estado: "valida",
      normalizada: n,
      formateada: `${n.slice(0, 2)}-${n.slice(2)}`,
      tipo: "menor",
      letraZona: n[0],
      zona: ZONAS_PLACA[n[0]] ?? null,
      aviso: "Es el formato de un vehículo menor (moto). Un camión lleva 3 caracteres y 3 números.",
    };
  }
  if (MAYOR.test(n)) {
    const letra = n[0];
    const zona = ZONAS_PLACA[letra] ?? null;
    return {
      estado: "valida",
      normalizada: n,
      formateada: `${n.slice(0, 3)}-${n.slice(3)}`,
      tipo: "vehiculo",
      letraZona: letra,
      zona,
      aviso: zona ? null : `La letra «${letra}» no es de ninguna zona registral de la tabla: revisa que sea la placa.`,
    };
  }
  return { estado: "invalida", normalizada: n, motivo: motivoInvalida(n) };
}

/** Por qué no puede ser una placa, dicho con lo que tiene que corregir. */
function motivoInvalida(n: string): string {
  if (n.length < 6) return `Le faltan caracteres: una placa lleva 6 (3 caracteres y 3 números, ej. ${EJEMPLO_PLACA}).`;
  if (n.length > 6) return `Le sobran caracteres: una placa lleva 6 (3 caracteres y 3 números, ej. ${EJEMPLO_PLACA}).`;
  if (!/^[A-Z]/.test(n)) return "Empieza con la letra de la zona registral (W en Pasco, Junín y Huánuco).";
  if (!/\d{3}$/.test(n)) return `Los tres últimos son números (ej. ${EJEMPLO_PLACA}).`;
  return `No sigue el formato de la placa peruana (3 caracteres y 3 números, ej. ${EJEMPLO_PLACA}).`;
}

/**
 * Mientras se tipea: mayúsculas, sin caracteres raros y con el guion donde va
 * (`w2d853` → `W2D-853`). No valida: sólo ordena lo escrito. Tope de 7
 * caracteres (6 + el guion): más largo ya no es una placa.
 */
export function formatearAlTipear(v: string): string {
  // La moto sólo si se escribió con su guion (ver `MENOR_ESCRITA`): `ab-` se
  // queda `AB-` para que el siguiente número no la vuelva `AB1-…`.
  // Sin el `(?!\d)` de `MENOR_ESCRITA`: un 5.º número se descarta (`AB-12345` →
  // `AB-1234`), no vuelve la moto un `AB1-234` sin avisar al pegar.
  const moto = /^\s*([A-Za-z]{2})\s*[-\s]\s*(\d{0,4})/.exec(v);
  if (moto) return `${moto[1].toUpperCase()}-${moto[2]}`;
  const n = normalizarPlacaPeru(v).slice(0, 6);
  return n.length > 3 ? `${n.slice(0, 3)}-${n.slice(3)}` : n;
}

/**
 * La placa y la del remolque, como las escribe la consulta de SERFOR en UN
 * casillero: `V2H-901 / -` (sin remolque) o `V2H-901 / W3A-123`. Sin `/`, todo
 * es la placa. El `-` suelto es «no hay»: queda vacío.
 */
export function partirPlacasDeGuia(v: string | null | undefined): { placa: string; remolque: string } {
  const [placa = "", remolque = ""] = String(v ?? "").split("/");
  const limpio = (s: string) => (/^[-\s]*$/.test(s) ? "" : s.trim());
  return { placa: limpio(placa), remolque: limpio(remolque) };
}

/** ¿Es la misma placa? Compara normalizado: `W2D-853` ≡ `w2d 853`. */
export function mismaPlaca(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarPlacaPeru(a);
  return na !== "" && na === normalizarPlacaPeru(b);
}
