Ejecutar el proceso completo de deploy para Bodega San Martín.

## Pasos

1. **Pre-flight checks:**
   - `npm run lint` — si falla, corregir antes de continuar
   - `npm run build` — si falla, no deployar
   - `npm run test` — si falla, no deployar

2. **Validar schema** (si hubo cambios en prisma/):
   - `npx prisma validate`
   - Confirmar que la migración se ejecutó con DIRECT_URL

3. **Commit** si hay cambios pendientes (usar Conventional Commits)

4. **Push** al remote

5. **Monitorear** el deploy en Vercel dashboard

## Reglas
- NUNCA deployar si lint o build fallan
- Si hay cambios en schema.prisma, verificar migración primero
- Revisar que no haya .env* en los archivos staged
