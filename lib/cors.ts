/**
 * CORS utility for API routes.
 * Only allows requests from our own origin(s).
 */

const ALLOWED_ORIGINS = [
  "https://www.buleje.pe",
  "https://buleje.pe",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3001"]
    : []),
];

export function corsHeaders(origin?: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function withCors(
  response: Response,
  origin?: string | null,
): Response {
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => {
    response.headers.set(k, v);
  });
  return response;
}
