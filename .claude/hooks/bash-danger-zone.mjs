/**
 * PreToolUse hook — Bash Danger Zone
 *
 * Intercepta comandos Bash destructivos o irreversibles en el proyecto
 * Bodega San Martín y bloquea la ejecución hasta que Claude evalúe el riesgo.
 *
 * Salida:
 *   exit 0 = continuar normalmente
 *   exit 1 = bloquear + mostrar advertencia a Claude
 */

import { createInterface } from "readline";

async function readStdin() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n");
}

const raw = await readStdin();
let data;
try { data = JSON.parse(raw); } catch { process.exit(0); }

const command = (data.tool_input?.command ?? "").toLowerCase();
if (!command) process.exit(0);

const DANGER_COMMANDS = [
  {
    pattern: /prisma migrate reset/,
    risk: "ELIMINA TODA LA BASE DE DATOS y vuelve a correr el seed. Todos los datos de producción se pierden.",
    action: "Usar solo en desarrollo local. Nunca en producción. Confirmar con el usuario primero.",
  },
  {
    pattern: /prisma db push(?!.*--accept-data-loss)/,
    risk: "Puede eliminar columnas o tablas si el schema cambió. No genera migration file.",
    action: "Usar `prisma migrate dev` en su lugar para tener historial de migraciones.",
  },
  {
    pattern: /git push.*--force|git push.*-f\b/,
    risk: "Sobreescribe el historial remoto. Puede eliminar commits de otros desarrolladores.",
    action: "Usar `git push --force-with-lease` si es absolutamente necesario.",
  },
  {
    pattern: /git reset --hard/,
    risk: "Elimina cambios no commiteados de forma irreversible.",
    action: "Hacer `git stash` primero si hay trabajo en progreso.",
  },
  {
    pattern: /rm -rf|rmdir \/s/,
    risk: "Eliminación recursiva irreversible de archivos y directorios.",
    action: "Verificar el path exacto antes de ejecutar. Nunca usar en directorios del proyecto.",
  },
  {
    pattern: /drop (table|database|schema)/,
    risk: "Elimina tabla, base de datos o schema completo de PostgreSQL. Irreversible.",
    action: "Hacer backup primero. Confirmar con el usuario.",
  },
  {
    pattern: /truncate\s+\w/,
    risk: "Vacía una tabla completa. No hay WHERE, todos los registros se eliminan.",
    action: "Usar DELETE con WHERE si solo quieres eliminar registros específicos.",
  },
  {
    pattern: /delete from\s+\w+\s*;|delete from\s+\w+\s*$|delete from\s+\w+(?!\s+where)/,
    risk: "DELETE sin cláusula WHERE — elimina TODOS los registros de la tabla.",
    action: "Siempre incluir WHERE. Verificar qué registros afecta con SELECT primero.",
  },
  {
    pattern: /npm run db:migrate.*--force|prisma migrate deploy.*--force/,
    risk: "Migración forzada puede causar pérdida de datos en producción.",
    action: "Revisar el migration file primero. Hacer backup de la DB antes.",
  },
  {
    pattern: /vercel --prod.*--force|vercel deploy.*--prod.*--skip/,
    risk: "Deploy forzado a producción sin verificaciones puede romper la app en vivo.",
    action: "Hacer deploy a preview primero y verificar.",
  },
];

const match = DANGER_COMMANDS.find((d) => d.pattern.test(command));

if (match) {
  process.stderr.write(
    `\n🚨 COMANDO PELIGROSO DETECTADO\n` +
    `Comando: ${command.slice(0, 100)}${command.length > 100 ? "..." : ""}\n` +
    `\nRiesgo: ${match.risk}\n` +
    `Recomendación: ${match.action}\n` +
    `\n→ NO ejecutar sin confirmar con el usuario primero.\n` +
    `→ Si el usuario aprueba explícitamente, puedes proceder.\n\n`
  );
  process.exit(1);
}

process.exit(0);
