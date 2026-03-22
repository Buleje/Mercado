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

function buildReniecUrl(dni: string) {
  const configuredUrl = process.env.RENIEC_API_URL?.trim();

  if (!configuredUrl) {
    throw new ReniecConfigError("Falta configurar RENIEC_API_URL para consultar DNI.");
  }

  if (configuredUrl.includes("{dni}")) {
    return configuredUrl.replaceAll("{dni}", encodeURIComponent(dni));
  }

  const separator = configuredUrl.includes("?") ? "&" : "?";
  return `${configuredUrl}${separator}numero=${encodeURIComponent(dni)}`;
}

function buildHeaders() {
  const token = process.env.RENIEC_API_TOKEN?.trim();
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (!token) return headers;

  const scheme = process.env.RENIEC_API_AUTH_SCHEME?.trim() || "Bearer";
  headers.Authorization = `${scheme} ${token}`;
  return headers;
}

export async function lookupDniInReniec(dni: string): Promise<ReniecPerson> {
  const response = await fetch(buildReniecUrl(dni), {
    method: "GET",
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "No pudimos consultar RENIEC en este momento.";
    try {
      const data = await response.json() as Record<string, unknown>;
      message = getString(data.message) || getString(data.error) || message;
    } catch {
      // Ignore non-JSON responses.
    }
    throw new Error(message);
  }

  const data = await response.json() as Record<string, unknown>;

  const nombres = getString(data.nombres) || getString(data.names) || getString(data.name);
  const apellidoPaterno = getString(data.apellidoPaterno) || getString(data.apellido_paterno) || getString(data.firstSurname);
  const apellidoMaterno = getString(data.apellidoMaterno) || getString(data.apellido_materno) || getString(data.secondSurname);

  const nombreCompleto = [nombres, apellidoPaterno, apellidoMaterno]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!nombreCompleto) {
    throw new Error("RENIEC no devolvió un nombre válido para este DNI.");
  }

  return {
    dni,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    nombreCompleto,
  };
}