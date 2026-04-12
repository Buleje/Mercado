/**
 * #56 Superadmin IP Allowlist — lib/security/ip-allowlist.ts
 *
 * Controla acceso a /superadmin por IP.
 * Lista vacía = todas las IPs permitidas (backward-compatible).
 *
 * Configuración en .env:
 *   SUPERADMIN_IP_ALLOWLIST=""               # vacío = todas permitidas
 *   SUPERADMIN_IP_ALLOWLIST="1.2.3.4"        # IP exacta
 *   SUPERADMIN_IP_ALLOWLIST="1.2.3.0/24"     # CIDR /24
 *   SUPERADMIN_IP_ALLOWLIST="1.2.3.4,5.6.7.8,10.0.0.0/8"  # múltiples
 *
 * Uso en app/superadmin/layout.tsx (early return al inicio del server component):
 *
 *   import { getAllowedSuperadminIps, isIpAllowed } from "@/lib/security/ip-allowlist";
 *   import { headers } from "next/headers";
 *   import { notFound } from "next/navigation";
 *
 *   // Al inicio de SuperAdminAuthGate (o del layout server component):
 *   const allowList = getAllowedSuperadminIps();
 *   if (allowList.length > 0) {
 *     const hdrs = await headers();
 *     const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
 *     if (!isIpAllowed(ip, allowList)) notFound();
 *   }
 */

// ─── Lectura de config ─────────────────────────────────────────────────────────

/**
 * Lee SUPERADMIN_IP_ALLOWLIST del entorno y devuelve un array de entradas
 * (IPs exactas o CIDRs). Array vacío = sin restricción.
 */
export function getAllowedSuperadminIps(): string[] {
  const raw = process.env.SUPERADMIN_IP_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Parsing CIDR ─────────────────────────────────────────────────────────────

/** Convierte una IPv4 en número de 32 bits. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  // Tratar como unsigned
  return result >>> 0;
}

/**
 * Verifica si `ip` está en el rango CIDR `cidr` (solo IPv4, prefijos /8 a /32).
 * Retorna false para IPv6 o CIDR malformado.
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const [cidrBase, prefixStr] = cidr.split("/");
  if (!prefixStr) return false;

  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(cidrBase);

  if (ipInt === null || baseInt === null) return false;

  // Máscara: los primeros `prefix` bits son 1
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

  return (ipInt & mask) >>> 0 === (baseInt & mask) >>> 0;
}

// ─── Check principal ──────────────────────────────────────────────────────────

/**
 * Determina si `ip` está en la lista de IPs permitidas.
 * Soporta:
 *   - Match exacto:     "1.2.3.4"
 *   - CIDR IPv4:        "192.168.0.0/24", "10.0.0.0/8"
 *   - IPv6 loopback:    "::1" (siempre permitido si ip es ::1 y lista lo incluye)
 *
 * Lista vacía → retorna `true` (sin restricción).
 */
export function isIpAllowed(ip: string, list: string[]): boolean {
  if (list.length === 0) return true;

  // Normalizar IPv4-mapped IPv6 (::ffff:1.2.3.4)
  const normalizedIp = ip.replace(/^::ffff:/, "");

  for (const entry of list) {
    if (entry === normalizedIp) return true;
    if (entry === ip) return true;
    if (entry.includes("/")) {
      if (isIpInCidr(normalizedIp, entry)) return true;
    }
  }

  return false;
}
