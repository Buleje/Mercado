---
name: deploy
description: Ejecutar el proceso completo de deploy para Buleje. Usar cuando el usuario quiera deployar, subir a produccion o publicar cambios.
disable-model-invocation: true
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
---

# Deploy — Buleje

Ejecutar el proceso completo de deploy para el proyecto Buleje.

## Pasos

### 1. Pre-flight checks

Ejecutar los siguientes comandos en orden desde `buleje/`. Si alguno falla, DETENER el proceso y reportar el error.

```bash
cd buleje
npm run lint
```

Si lint falla: intentar corregir automaticamente y re-ejecutar. Si persiste, ABORTAR.

```bash
npm run build
```

Si build falla: ABORTAR. NUNCA deployar con build roto.

```bash
npm run test
```

Si los tests fallan: ABORTAR. No deployar con tests fallidos.

### 2. Validar schema (solo si hubo cambios en prisma/)

Verificar si hay cambios en archivos de Prisma:

```bash
git diff --name-only HEAD | grep -q "prisma/" && echo "HAY CAMBIOS EN PRISMA" || echo "NO HAY CAMBIOS EN PRISMA"
```

Si hay cambios en prisma/:
- Ejecutar `npx prisma validate`
- Confirmar que la migracion se ejecuto con `DIRECT_URL` configurada
- Si no se ejecuto la migracion, ADVERTIR al usuario antes de continuar

### 3. Commit de cambios pendientes

Si hay cambios sin commitear:
- Usar Conventional Commits (feat/fix/refactor/chore/etc.)
- Staging selectivo: NUNCA agregar `.env*` ni archivos con secrets
- Mensaje en espanol, maximo 72 caracteres en la primera linea

### 4. Push al remote

```bash
git push origin $(git branch --show-current)
```

### 5. Monitorear

Informar al usuario que el deploy fue disparado y que debe monitorear en el dashboard de Vercel.

## Reglas criticas

- **NUNCA** deployar si lint o build fallan — sin excepciones
- **NUNCA** hacer push de archivos `.env*` o secrets
- Si hay cambios en `schema.prisma`, la migracion DEBE ejecutarse antes del deploy
- Revisar que no haya archivos sensibles en el staging area antes del commit
- Si algun paso falla, mostrar tabla resumen con el estado de cada paso

## Reporte final

Al terminar, mostrar tabla resumen:

| Paso | Estado | Detalles |
|------|--------|----------|
| Lint | .../... | ... |
| Build | .../... | ... |
| Tests | .../... | ... |
| Schema | .../... | ... |
| Commit | .../... | ... |
| Push | .../... | ... |
