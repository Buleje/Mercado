---
name: migrar-esquema
description: "Cadena real para cambiar el schema Prisma sin romper producción (la base es compartida): SQL a mano, aplicar, cruzar, marcar y regenerar. Usar cuando vayas a agregar o cambiar una columna, tabla, índice o valor de enum, o Brandon diga «migrar» o «columna nueva»."
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep
argument-hint: "[qué cambia: columna | tabla | índice | enum]"
---

# Migrar el schema (la base de desarrollo ES producción)

El código viejo ya desplegado lee las mismas tablas: **solo se agrega**. Borrar, renombrar o NOT NULL sin default va en un 2.º paso, después de desplegar código que ya no use lo viejo (ej. `prisma/migrations/adr-504-paso3-contract-NO-APLICAR.sql`).

## Cadena, en este orden
1. Editar `prisma/schema.prisma` y escribir `prisma/migrations/<AAAAMMDD>_<nombre>_adr<N>/migration.sql`, idempotente (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`). Decisión nueva → `/adr`.
2. Ensayo (termina en ROLLBACK y verifica lo que el archivo declara): `node -r dotenv/config scripts/aplicar-migracion-sesion.mjs <migration.sql> --ensayo dotenv_config_path=.env.local`
3. Aplicar: el mismo comando sin `--ensayo`; la 2.ª corrida debe decir «0 nuevas».
4. Cruzar: `node scripts/migraciones-cruce.mjs --verificar <carpeta>`; todo ✓ (un «MANUAL» se mira a ojo).
5. Marcar: `node scripts/prisma-session.mjs migrate resolve --applied <carpeta>`
6. Regenerar: `npx prisma generate` y reiniciar el dev server (el que está corriendo sigue con el cliente viejo).

## Nunca
- `migrate dev`, `migrate reset`, `db push` (`npm run db:migrate` ES `migrate dev`): `prisma.config.ts` y un hook los frenan; `migrate dev` ofrece resetear la base.
- `DIRECT_URL`: no resuelve desde esta red. Prisma solo por `scripts/prisma-session.mjs` (pooler :5432, modo sesión).
- `SET SESSION` sobre `DATABASE_URL` (pooler :6543, producción): se pega en conexiones ajenas. Usa `SET LOCAL` dentro de la transacción o `BEGIN READ ONLY`.

## Valor nuevo de un enum
`ADD VALUE` es seguro, pero en cuanto UNA fila lo usa, el Prisma viejo de producción tira `Value not found in enum` en todo listado que la lea. Dos pasos: (1) migrar + `prisma generate` + reiniciar, sin `UPDATE` en el mismo archivo; (2) escribir el dato **después** de desplegar producción con el Prisma nuevo (rubro belleza, 20-10).

`schema.prisma` suele traer cambios ajenos sin commitear: commit con `-- <tus archivos>`, sin `prisma format` de todo.
