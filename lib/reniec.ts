import "server-only";

export class ReniecConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReniecConfigError";
  }
}

export type ReniecPerson = {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseApiResponse(data: Record<string, unknown>): ReniecPerson | null {
  const nombres =
    getString(data.nombres) ||
    getString(data.names) ||
    getString(data.name) ||
    getString(data.first_name);
  const apellidoPaterno =
    getString(data.apellidoPaterno) ||
    getString(data.apellido_paterno) ||
    getString(data.firstSurname) ||
    getString(data.first_last_name);
  const apellidoMaterno =
    getString(data.apellidoMaterno) ||
    getString(data.apellido_materno) ||
    getString(data.secondSurname) ||
    getString(data.second_last_name);

  const nombreCompleto = [nombres, apellidoPaterno, apellidoMaterno]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!nombreCompleto) return null;
  return { dni: "", nombres, apellidoPaterno, apellidoMaterno, nombreCompleto };
}

/* ── Provider 1: configured RENIEC_API_URL (paid/custom) ───────────── */

async function lookupWithConfiguredApi(dni: string): Promise<ReniecPerson | null> {
  const configuredUrl = process.env.RENIEC_API_URL?.trim();
  if (!configuredUrl) return null;

  const url = configuredUrl.includes("{dni}")
    ? configuredUrl.replace(/{dni}/g, encodeURIComponent(dni))
    : `${configuredUrl}${configuredUrl.includes("?") ? "&" : "?"}numero=${encodeURIComponent(dni)}`;

  const token = process.env.RENIEC_API_TOKEN?.trim();
  const headers: HeadersInit = { Accept: "application/json" };
  if (token) {
    const scheme = process.env.RENIEC_API_AUTH_SCHEME?.trim() || "Bearer";
    headers.Authorization = `${scheme} ${token}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as Record<string, unknown>;
  const person = parseApiResponse(data);
  return person ? { ...person, dni } : null;
}

/* ── Provider 2: apis.net.pe / decolecta.com (free with token) ─────── */

async function lookupWithApisNetPe(dni: string): Promise<ReniecPerson | null> {
  const token = process.env.APISNETPE_TOKEN?.trim();
  if (!token) return null; // Requires registration at apis.net.pe/app

  const headers: HeadersInit = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(
    `https://api.apis.net.pe/v2/reniec/dni?numero=${encodeURIComponent(dni)}`,
    { method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(8000) },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as Record<string, unknown>;
  const person = parseApiResponse(data);
  return person ? { ...person, dni } : null;
}

/* ── Provider 3: eldni.com (free, no auth — web scraping) ──────────── */

async function lookupWithElDni(dni: string): Promise<ReniecPerson | null> {
  // Step 1: GET page to obtain CSRF token + session cookie
  const pageRes = await fetch("https://eldni.com/pe/buscar-por-dni", {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Buleje/1.0)",
      Accept: "text/html",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!pageRes.ok) return null;

  const html = await pageRes.text();
  const tokenMatch = html.match(/name="_token"[^>]*value="([^"]*)"/);
  if (!tokenMatch?.[1]) return null;

  // Preserve session cookies for the POST
  const setCookies = pageRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  // Step 2: POST form with CSRF token to get person data
  const formBody = new URLSearchParams({
    _token: tokenMatch[1],
    dni: dni,
  });

  const postRes = await fetch("https://eldni.com/pe/buscar-por-dni", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Buleje/1.0)",
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
      Cookie: cookieHeader,
    },
    body: formBody.toString(),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });

  if (!postRes.ok) return null;

  const resultHtml = await postRes.text();

  // Parse <td> elements from the result table: [DNI, Nombres, ApPaterno, ApMaterno]
  const tdMatches = Array.from(resultHtml.matchAll(/<td>([^<]+)<\/td>/g));
  if (tdMatches.length < 4) return null;

  const nombres = tdMatches[1][1].trim();
  const apellidoPaterno = tdMatches[2][1].trim();
  const apellidoMaterno = tdMatches[3][1].trim();
  const nombreCompleto = [nombres, apellidoPaterno, apellidoMaterno]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!nombreCompleto) return null;
  return { dni, nombres, apellidoPaterno, apellidoMaterno, nombreCompleto };
}

/* ── Main lookup: tries providers in order (fallback chain) ────────── */

export async function lookupDniInReniec(dni: string): Promise<ReniecPerson> {
  const providers = [
    { name: "configured", fn: () => lookupWithConfiguredApi(dni) },
    { name: "apis.net.pe", fn: () => lookupWithApisNetPe(dni) },
    { name: "eldni.com", fn: () => lookupWithElDni(dni) },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn();
      if (result) return result;
    } catch {
      // Provider failed, try next one
    }
  }

  throw new Error(
    "No pudimos consultar los datos de este DNI. Escribe el nombre manualmente.",
  );
}