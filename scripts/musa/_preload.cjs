// Deja correr las clases lib/db/*.db.ts fuera de Next: `server-only` (que Next
// resuelve por dentro) apunta al mock de vitest y `next/cache` no se queja sin
// contexto de petición. Sólo para scripts/musa/*.
const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return path.resolve(__dirname, "../../__mocks__/server-only.ts");
  return orig.call(this, request, ...rest);
};
