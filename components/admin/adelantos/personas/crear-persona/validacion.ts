/**
 * Validación EN VIVO del alta de persona: celular, Yape, CCI y fecha de
 * nacimiento. Funciones puras (sin React) para poder probarlas.
 *
 * Mientras se escribe no se marca error: «Faltan 3 dígitos» es información,
 * no un reproche. El aviso aparece cuando el número ya no puede ser válido
 * (empieza mal, sobra un dígito, tiene letras).
 */

export type Revision =
  | { estado: "vacio" | "ok"; texto: null }
  | { estado: "escribiendo" | "mal"; texto: string };

const VACIO: Revision = { estado: "vacio", texto: null };
const OK: Revision = { estado: "ok", texto: null };
const mal = (texto: string): Revision => ({ estado: "mal", texto });
const faltan = (n: number): Revision => ({
  estado: "escribiendo",
  texto: n === 1 ? "Falta 1 dígito" : `Faltan ${n} dígitos`,
});

export function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * El celular como lo pide la API (9 dígitos, sin el +51): «+51 987 654 321»
 * pasa la revisión en vivo, y el servidor sólo quita espacios y guiones.
 */
export function celularParaGuardar(v: string): string {
  const d = soloDigitos(v);
  return d.length === 11 && d.startsWith("51") ? d.slice(2) : d;
}

/** Celular peruano: 9 dígitos que empiezan con 9 (el +51 de adelante se tolera). */
export function revisarCelular(v: string): Revision {
  if (!v.trim()) return VACIO;
  if (/[^\d\s+()-]/.test(v)) return mal("El celular es sólo números.");
  const todo = soloDigitos(v);
  const d = todo.length > 9 && todo.startsWith("51") ? todo.slice(2) : todo;
  if (!d.startsWith("9")) return mal("Un celular empieza con 9.");
  if (d.length < 9) return faltan(9 - d.length);
  if (d.length > 9) return mal(`Un celular tiene 9 dígitos: sobran ${d.length - 9}.`);
  return OK;
}

/**
 * DNI (8) o RUC (11). Con 9 o 10 dígitos todavía puede ser un RUC a medias:
 * se cuenta lo que falta, no se reprocha. Puntos y espacios no cuentan.
 */
export function revisarDocumentoEnVivo(v: string): Revision {
  if (!v.trim()) return VACIO;
  if (/[^\d\s.-]/.test(v)) return mal("Es sólo números: 8 el DNI, 11 el RUC.");
  const d = soloDigitos(v);
  if (d.length < 8) return { estado: "escribiendo", texto: `${faltan(8 - d.length).texto} para el DNI` };
  if (d.length === 8) return OK;
  if (d.length < 11) return { estado: "escribiendo", texto: `${faltan(11 - d.length).texto} para un RUC (un DNI tiene 8)` };
  if (d.length > 11) return mal(`Un RUC tiene 11 dígitos: sobran ${d.length - 11}.`);
  return /^(10|15|16|17|20)/.test(d) ? OK : mal("Un RUC empieza con 10, 15, 16, 17 o 20.");
}

/** CCI: 20 dígitos (los espacios y guiones del voucher no cuentan). */
export function revisarCci(v: string): Revision {
  const limpio = v.replace(/[\s-]/g, "");
  if (!limpio) return VACIO;
  if (/\D/.test(limpio)) return mal("El CCI es sólo números.");
  if (limpio.length < 20) return faltan(20 - limpio.length);
  if (limpio.length > 20) return mal(`El CCI tiene 20 dígitos: sobran ${limpio.length - 20}.`);
  return OK;
}

/**
 * Los 3 primeros dígitos del CCI son el código del banco. Sólo los que se usan
 * para cobrar acá; un código que no está en la lista no adivina nada.
 */
const BANCO_DEL_CCI: Readonly<Record<string, string>> = {
  "002": "BCP",
  "003": "Interbank",
  "009": "Scotiabank",
  "011": "BBVA",
  "018": "Banco de la Nación",
  "038": "BanBif",
  "049": "Mibanco",
};

export function bancoDelCci(v: string): string | null {
  const d = v.replace(/[\s-]/g, "");
  if (d.length < 3 || /\D/.test(d.slice(0, 3))) return null;
  return BANCO_DEL_CCI[d.slice(0, 3)] ?? null;
}

/** El CCI dice un banco y el desplegable otro: casi siempre es un número copiado de otra persona. */
export function avisoBancoDelCci(cci: string, banco: string): string | null {
  const delCci = bancoDelCci(cci);
  if (!delCci || !banco || banco === "Otro" || banco === "Yape" || banco === "Plin") return null;
  return delCci === banco ? null : `Ese CCI es del ${delCci}, no de ${banco}.`;
}

/** Años cumplidos a la fecha `hoy` (las dos «AAAA-MM-DD»). */
export function edadDe(fecha: string, hoy: string): number | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy);
  if (!f || !h) return null;
  let anios = Number(h[1]) - Number(f[1]);
  if (h[2] + h[3] < f[2] + f[3]) anios -= 1;
  return anios >= 0 ? anios : null;
}

export function revisarFechaNacimiento(fecha: string, hoy: string): Revision {
  if (!fecha) return VACIO;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return mal("Fecha incompleta.");
  if (fecha < "1900-01-01") return mal("Revisa el año: es antes de 1900.");
  if (fecha > hoy) return mal("Esa fecha todavía no llega.");
  return OK;
}

/**
 * Lo que impide guardar, o `null`. Sólo lo que el servidor rechazaría (los
 * campos del contrato 30-10 se validan allá con el mismo criterio): el
 * celular principal y el CCI avisan y no frenan, como siempre.
 */
export function errorAntesDeGuardar(
  d: {
    nombre: string;
    yape: string;
    yapeIgualCelular: boolean;
    telefono: string;
    referenciaTelefono: string;
    fechaNacimiento: string;
  },
  hoy: string,
  empresa: boolean,
): string | null {
  if (!d.nombre.trim()) return "El nombre es obligatorio.";
  const yape = revisarCelular(d.yapeIgualCelular ? d.telefono : d.yape);
  if (yape.estado === "mal" || yape.estado === "escribiendo") {
    return `Revisa el Yape o Plin (en Contacto y referencia): ${yape.texto.replace(/\.$/, "").toLowerCase()}.`;
  }
  const ref = revisarCelular(d.referenciaTelefono);
  if (ref.estado === "mal" || ref.estado === "escribiendo") {
    return `Revisa el celular de la referencia (en Contacto y referencia): ${ref.texto.replace(/\.$/, "").toLowerCase()}.`;
  }
  if (!empresa) {
    const f = revisarFechaNacimiento(d.fechaNacimiento, hoy);
    if (f.estado === "mal") return `Revisa la fecha de nacimiento: ${f.texto.replace(/\.$/, "").toLowerCase()}.`;
  }
  return null;
}
