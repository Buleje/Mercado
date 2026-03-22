Revisar los cambios del branch actual antes de hacer merge o PR en Bodega San Martín.

## Pasos

1. **Ver diferencias:**
   ```bash
   git diff master...HEAD
   git log --oneline master..HEAD
   ```

2. **Verificar calidad:**
   ```bash
   npm run lint && npm run build && npm run test
   ```

3. **Checklist de seguridad:**
   - [ ] No hay secrets en el código (.env, API keys)
   - [ ] Todas las queries tienen tenantId
   - [ ] Se usa safeParse() en lugar de .parse()
   - [ ] Las DB classes usan lib/db/, no Prisma directo
   - [ ] Route handlers tienen `export const dynamic = "force-dynamic"`
   - [ ] Fire-and-forget para logActivity/sendNotification

4. **Reporte:** Emitir resultado con ✅/⚠️/❌ por categoría:
   | Categoría | Estado | Notas |
   |-----------|--------|-------|
   | Lint | ✅/❌ | ... |
   | Build | ✅/❌ | ... |
   | Tests | ✅/❌ | ... |
   | Seguridad | ✅/⚠️/❌ | ... |
   | Convenciones | ✅/⚠️/❌ | ... |
