/**
 * Buscar un negocio del superadmin por nombre, código, ID, correo, teléfono o RUC.
 *
 * Fuente única para la lista de Tiendas, «Nueva conversación» y el Ctrl+K
 * (SUPMKT-3/4, 2026-10-09). Un dueño escribe por WhatsApp y sólo tienes su
 * número: «+51 987-654-321», «987 654 321» y «987654321» encuentran lo mismo.
 * El ID de la tienda (ADR-500) igual: «482917», «482-917», «#482 917» o
 * «ID 482917»; con «ID»/«#» adelante busca SÓLO por ID (no por teléfono).
 */

import { normalizarCodigoTienda, tienePrefijoDeId } from "@/lib/codigo-tienda";

export interface NegocioBuscable {
  name: string;
  slug: string;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  businessPhone?: string | null;
  whatsappPhone?: string | null;
  ruc?: string | null;
  /** ID de la tienda, 6 dígitos sin guion («482917»). */
  codigo?: string | null;
}

export function soloDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** «+51 987-654-321», «0051 987654321», «987 654 321» → «987654321». */
export function normalizarTelefono(s: string): string {
  const d = soloDigitos(s);
  if (d.startsWith("0051")) return d.slice(4);
  if (d.startsWith("51") && d.length === 11) return d.slice(2);
  return d;
}

/** Minúsculas y sin tildes: «Línea» y «linea» buscan lo mismo. */
export function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Mínimo de dígitos para buscar por número (con 1-2 dígitos casi todo coincide). */
const MIN_DIGITOS = 3;

export function coincideNegocio(n: NegocioBuscable, consulta: string): boolean {
  const q = consulta.trim();
  if (!q) return true;
  const codigo = normalizarCodigoTienda(q);
  if (codigo && n.codigo === codigo) return true;
  if (tienePrefijoDeId(q)) {
    // «ID 482…» a medio escribir: los IDs que empiezan así.
    const d = soloDigitos(q);
    return d.length >= MIN_DIGITOS && Boolean(n.codigo?.startsWith(d));
  }
  const texto = sinTildes(q);
  if ([n.name, n.slug, n.ownerEmail ?? ""].some((c) => sinTildes(c).includes(texto))) return true;
  // Por número sólo si lo escrito no trae letras: «tienda-3» no busca teléfonos.
  if (/\p{L}/u.test(q)) return false;
  const digitos = soloDigitos(q);
  if (digitos.length < MIN_DIGITOS) return false;
  if (n.codigo && n.codigo.startsWith(digitos)) return true;
  const tel = normalizarTelefono(q);
  const telefonos = [n.ownerPhone, n.businessPhone, n.whatsappPhone]
    .filter((t): t is string => Boolean(t))
    .map(normalizarTelefono);
  if (telefonos.some((t) => t.includes(tel))) return true;
  return n.ruc ? soloDigitos(n.ruc).includes(digitos) : false;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/** Fila cruda de `/api/superadmin/tenants` → lo que se busca (+ id para enlazar). */
export function aNegocioBuscable(row: Record<string, unknown>): NegocioBuscable & { id: string } {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? row.slug ?? ""),
    slug: String(row.slug ?? ""),
    ownerEmail: texto(row.ownerEmail),
    ownerPhone: texto(row.ownerPhone),
    businessPhone: texto(row.businessPhone),
    whatsappPhone: texto(row.whatsappPhone),
    ruc: texto(row.ruc),
    codigo: texto(row.codigo),
  };
}
