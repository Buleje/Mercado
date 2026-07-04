/**
 * lib/security/threat-signatures.ts
 *
 * Motor de detección de ataques — Edge-safe (funciones PURAS, sin I/O ni
 * módulos Node). Inspecciona la superficie de una request (path + query +
 * user-agent) contra firmas conocidas de SQLi, XSS, path traversal, command
 * injection, escáneres automáticos y sondeo de rutas sensibles.
 *
 * Es la primera línea del WAF: corre en el middleware (proxy.ts) en CADA
 * request de página/API. Por eso todo acá debe ser barato (regex sobre strings
 * cortos) y no bloquear tráfico legítimo (firmas de alta confianza).
 *
 * NO persiste nada — solo decide. La persistencia + auto-bloqueo viven en
 * lib/security/security-events.ts + el endpoint interno.
 */

export type ThreatType =
  | "sqli"
  | "nosqli"
  | "xss"
  | "path_traversal"
  | "command_injection"
  | "code_injection"
  | "ssrf"
  | "scanner"
  | "sensitive_probe";

export type ThreatSeverity = "low" | "medium" | "high" | "critical";

export interface ThreatMatch {
  type: ThreatType;
  severity: ThreatSeverity;
  /** Fragmento (recortado) que disparó la firma — para forensics. */
  evidence: string;
}

export interface ThreatInput {
  pathname: string;
  search: string; // querystring cruda (incluye el "?")
  userAgent: string;
}

export interface ThreatResult {
  threats: ThreatMatch[];
  /** Severidad máxima entre las firmas encontradas (null si limpio). */
  maxSeverity: ThreatSeverity | null;
  /** True si hay al menos una firma crítica → bloqueo inline recomendado. */
  shouldBlock: boolean;
}

const SEVERITY_RANK: Record<ThreatSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

// ── Firmas ────────────────────────────────────────────────────────────────────
// Cada firma: regex + tipo + severidad. Calibradas para bajo falso-positivo
// (patrones que no aparecen en URLs legítimas de una tienda).

interface Signature {
  type: ThreatType;
  severity: ThreatSeverity;
  re: RegExp;
}

const SIGNATURES: Signature[] = [
  // SQL injection — uniones, comentarios, tautologías, funciones peligrosas.
  { type: "sqli", severity: "critical", re: /\bunion\b[\s/*]+\bselect\b/i },
  { type: "sqli", severity: "critical", re: /\b(select|insert|update|delete)\b[\s\S]{0,40}\bfrom\b/i },
  { type: "sqli", severity: "high", re: /'\s*(or|and)\s*'?\d+'?\s*=\s*'?\d+/i }, // ' or 1=1
  { type: "sqli", severity: "high", re: /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i },
  { type: "sqli", severity: "medium", re: /(\bdrop\b\s+\btable\b|information_schema|;--|\/\*!)/i },

  // NoSQL injection — operadores de Mongo en query/JSON.
  { type: "nosqli", severity: "high", re: /\$(where|ne|gt|gte|lt|lte|regex|in|nin|exists)\b/i },
  { type: "nosqli", severity: "medium", re: /\[\$(ne|gt|lt|in|or|and)\]/i }, // ?user[$ne]=

  // XSS — tags de script, handlers on*, javascript:, svg/onload.
  { type: "xss", severity: "critical", re: /<script[\s>]/i },
  { type: "xss", severity: "high", re: /javascript:\s*[^\s]/i },
  { type: "xss", severity: "high", re: /\bon(error|load|click|mouseover|focus)\s*=/i },
  { type: "xss", severity: "medium", re: /<(img|svg|iframe|body)[^>]+\bon\w+=/i },

  // Path traversal — ../ codificado y sin codificar, /etc/passwd, windows.
  { type: "path_traversal", severity: "critical", re: /(\.\.\/){2,}|(\.\.%2f){2,}/i },
  { type: "path_traversal", severity: "high", re: /\/etc\/(passwd|shadow)\b|\bboot\.ini\b|\/proc\/self\//i },
  { type: "path_traversal", severity: "medium", re: /%2e%2e[%2f/\\]/i },

  // Command injection — separadores de shell + comandos comunes.
  { type: "command_injection", severity: "critical", re: /[;|`]\s*(cat|wget|curl|nc|bash|sh|rm|chmod|python|perl)\b/i },
  { type: "command_injection", severity: "high", re: /\$\(.*\)/ },

  // Code / template injection — Log4Shell (JNDI), SSTI, XXE.
  { type: "code_injection", severity: "critical", re: /\$\{jndi:(ldap|rmi|dns|iiop):/i }, // Log4Shell
  { type: "code_injection", severity: "high", re: /\{\{\s*[\w.]+\s*[*+]\s*[\w.]+\s*\}\}|\$\{\{.+\}\}/ }, // SSTI {{7*7}}
  { type: "code_injection", severity: "high", re: /<!ENTITY\b|<!DOCTYPE[^>]+SYSTEM|SYSTEM\s+["']file:/i }, // XXE

  // SSRF — apuntar a loopback / metadata de la nube desde un parámetro.
  { type: "ssrf", severity: "high", re: /(url|uri|dest|redirect|next|target|callback)=https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|169\.254\.169\.254|metadata\.google)/i },
  { type: "ssrf", severity: "medium", re: /(url|uri|dest)=(file|gopher|dict):\/\//i },

  // Sondeo de rutas sensibles — .env, .git, wp-admin, phpMyAdmin, backups.
  { type: "sensitive_probe", severity: "high", re: /\/(\.env|\.git\/|wp-login\.php|wp-admin|phpmyadmin|\.aws\/|\.ssh\/|config\.php)/i },
  { type: "sensitive_probe", severity: "medium", re: /\/(backup|dump|\.sql|\.bak|\.old)(\b|$)/i },
];

// User-agents de herramientas de escaneo/ataque conocidas.
const SCANNER_UA = /\b(sqlmap|nikto|nmap|masscan|acunetix|nessus|dirbuster|gobuster|wpscan|havij|zgrab|hydra|zmeu)\b/i;

/** Recorta evidencia para logs (evita payloads gigantes). */
function clip(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Analiza una request contra todas las firmas. Devuelve todas las coincidencias
 * (una request puede combinar SQLi + traversal), la severidad máxima, y si debe
 * bloquearse inline (severidad crítica).
 *
 * `pathname` + `search` se decodifican una vez (los atacantes URL-encodean para
 * evadir); se analizan tanto crudo como decodificado.
 */
export function detectThreats(input: ThreatInput): ThreatResult {
  const raw = `${input.pathname}${input.search}`;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* URL malformada — nos quedamos con el crudo (ya sospechoso) */
  }
  const haystack = raw === decoded ? raw : `${raw} ${decoded}`;

  const threats: ThreatMatch[] = [];
  const seen = new Set<ThreatType>();

  for (const sig of SIGNATURES) {
    if (seen.has(sig.type) && threats.some((t) => t.type === sig.type && SEVERITY_RANK[t.severity] >= SEVERITY_RANK[sig.severity])) {
      continue; // ya tenemos una coincidencia igual o peor de este tipo
    }
    const m = sig.re.exec(haystack);
    if (m) {
      threats.push({ type: sig.type, severity: sig.severity, evidence: clip(m[0]) });
      seen.add(sig.type);
    }
  }

  const uaMatch = SCANNER_UA.exec(input.userAgent);
  if (uaMatch) {
    threats.push({ type: "scanner", severity: "high", evidence: clip(uaMatch[0], 40) });
  }

  if (threats.length === 0) {
    return { threats, maxSeverity: null, shouldBlock: false };
  }

  const maxSeverity = threats.reduce<ThreatSeverity>(
    (max, t) => (SEVERITY_RANK[t.severity] > SEVERITY_RANK[max] ? t.severity : max),
    "low",
  );

  return { threats, maxSeverity, shouldBlock: maxSeverity === "critical" };
}
