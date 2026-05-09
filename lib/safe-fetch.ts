import { lookup } from "node:dns/promises";

const PRIVATE_IPV4 =
  /^(?:127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|255\.|22[4-9]\.|23\d\.)/;
const PRIVATE_IPV6 =
  /^(?:::1$|fc00:|fd[0-9a-f]{2}:|fe80:|::$|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.|::ffff:169\.254\.)/i;
const LOOPBACK_HOSTS = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const IP_LITERAL = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i;

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`[safe-fetch] blocked: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

export type SafeFetchOptions = RequestInit & {
  /** Si se define, el hostname debe coincidir o ser subdominio de uno de estos. */
  allowedHosts?: string[];
  /** Timeout en ms (solo se aplica si caller no pasa `signal`). Default 5000. */
  timeoutMs?: number;
  /** Permitir http:// (default false: fuerza https). */
  allowInsecure?: boolean;
};

function isPrivateAddress(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (LOOPBACK_HOSTS.has(lower)) return true;
  if (PRIVATE_IPV4.test(ip)) return true;
  if (PRIVATE_IPV6.test(ip)) return true;
  return false;
}

function isHostAllowed(hostname: string, allowed?: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const h = hostname.toLowerCase();
  return allowed.some((a) => {
    const al = a.toLowerCase();
    return h === al || h.endsWith(`.${al}`);
  });
}

/**
 * Bloquea SSRF a metadata endpoints cloud (169.254.169.254), localhost,
 * redes privadas y opcionalmente fuera de un allowlist explícito.
 *
 * Resuelve DNS antes del fetch — si el hostname apunta a IP privada
 * (DNS rebinding), también se bloquea.
 *
 * `redirect` por default es `"error"` para evitar redirect-to-private-IP.
 */
export async function safeFetch(
  rawUrl: string,
  init: SafeFetchOptions = {},
): Promise<Response> {
  const {
    allowedHosts,
    timeoutMs = 5_000,
    allowInsecure = false,
    signal: callerSignal,
    redirect,
    ...rest
  } = init;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("invalid URL");
  }

  if (parsed.protocol === "http:" && !allowInsecure) {
    throw new SsrfBlockedError(`insecure protocol: ${parsed.protocol}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError(`unsupported protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  if (LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
    throw new SsrfBlockedError(`loopback host: ${hostname}`);
  }
  if (!isHostAllowed(hostname, allowedHosts)) {
    throw new SsrfBlockedError(`host not in allowlist: ${hostname}`);
  }

  if (IP_LITERAL.test(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new SsrfBlockedError(`private IP literal: ${hostname}`);
    }
  } else {
    let resolved: { address: string }[];
    try {
      resolved = await lookup(hostname, { all: true });
    } catch {
      throw new SsrfBlockedError(`DNS lookup failed: ${hostname}`);
    }
    for (const addr of resolved) {
      if (isPrivateAddress(addr.address)) {
        throw new SsrfBlockedError(
          `hostname resolves to private IP: ${hostname}→${addr.address}`,
        );
      }
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let signal = callerSignal;
  if (!signal && timeoutMs > 0) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    signal = controller.signal;
  }

  try {
    return await fetch(parsed.toString(), {
      ...rest,
      signal,
      redirect: redirect ?? "error",
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
