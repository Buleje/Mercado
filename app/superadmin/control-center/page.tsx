import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEnvStatus, type EnvStatus } from "@/lib/superadmin/env-status";
import {
  getPlatformHealth,
  type PlatformHealthMap,
} from "@/lib/superadmin/platform-health";
import { ControlCenterClient } from "./ControlCenterClient";

/**
 * /superadmin/control-center
 *
 * Centro de control — server component que resuelve, en el servidor:
 *   - el estado (presencia) de cada env var crítica (nunca el valor),
 *   - el estado operacional de cada plataforma del Launchpad,
 *   - la metadata del sistema (versión, Next, Node, último deploy).
 *
 * Regla de seguridad (CLAUDE.md #10): ningún secreto viaja al cliente.
 * Este componente delega la UI al client component `ControlCenterClient`.
 */

export const metadata = {
  title: "Centro de control — SuperAdmin",
  description: "Accesos rápidos a todas las plataformas y credenciales del sistema.",
  robots: "noindex, nofollow",
};

// IDs reflejan los de `ControlCenterClient.PLATFORMS`. Se mantiene aquí una
// constante local para que el server component no necesite importar el JSX.
const PLATFORM_IDS = [
  "superadmin",
  "admin",
  "tienda",
  "marketplace",
  "vender",
  "descubri",
  "cuenta",
  "storybook",
  "socio-buleje",
  "asistente",
] as const;

interface SystemInfo {
  version: string;
  branch: string;
  nextVersion: string;
  nodeVersion: string;
  deployedAt: string;
}

async function readSystemInfo(): Promise<SystemInfo> {
  // Leer versión del proyecto + Next desde package.json (best-effort — si falla,
  // caemos a defaults razonables para no romper la página).
  let projectVersion = "0.0.0";
  let nextVersion = "16.x";
  try {
    const raw = await readFile(join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      version?: string;
      dependencies?: Record<string, string>;
    };
    if (typeof pkg.version === "string") projectVersion = pkg.version;
    const nextDep = pkg.dependencies?.next;
    if (typeof nextDep === "string") {
      nextVersion = nextDep.replace(/^[\^~]/, "");
    }
  } catch {
    /* silent — fallback al default */
  }

  const branch =
    process.env.VERCEL_GIT_COMMIT_REF ??
    process.env.GIT_BRANCH ??
    "production";

  // Node runtime — `process.versions.node` es siempre seguro en server.
  const nodeVersion = typeof process !== "undefined" ? process.versions.node : "?";

  // Último deploy — usa VERCEL env si está presente, sino timestamp actual.
  const deployedAt =
    process.env.VERCEL_DEPLOYMENT_CREATED_AT ??
    process.env.DEPLOYED_AT ??
    new Date().toISOString();

  return { version: projectVersion, branch, nextVersion, nodeVersion, deployedAt };
}

export default async function ControlCenterPage() {
  const envStatus: EnvStatus = getEnvStatus();
  const healthMap: PlatformHealthMap = getPlatformHealth(PLATFORM_IDS);
  const systemInfo = await readSystemInfo();

  return (
    <ControlCenterClient
      envStatus={envStatus}
      healthMap={healthMap}
      systemInfo={systemInfo}
    />
  );
}
