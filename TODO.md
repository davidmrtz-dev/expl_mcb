# Explain My Codebase Agent — TODO incremental

## FASE 1 — Indexación local ✅ (en progreso)

- [x] Estructura de carpetas y arquitectura documentada
- [x] Scanner de repo (TS/JS, ignores)
- [x] Parser tree-sitter + chunker por símbolos
- [x] Pipeline de embeddings vía Ollama (`nomic-embed-text`)
- [x] Persistencia SQLite (chunks + vectores + metadata)
- [x] CLI: `npm run index -- --repo <path>`
- [x] Probar con un repo real y modelo Ollama instalado

## FASE 2 — Preguntas con contexto

- [ ] Servidor HTTP (Fastify) con `POST /ask`
- [ ] Retrieval: cosine similarity sobre embeddings en SQLite
- [ ] Context builder (top-k chunks + metadata de archivo)
- [ ] Llamada a LLM local (`qwen2.5-coder:7b` o `deepseek-coder`)
- [ ] Respuesta en streaming (SSE o chunked)
- [ ] Script `npm run ask` y `npm run serve`

## FASE 3 — Comprensión estructural

- [ ] Mapa de imports por archivo
- [ ] Referencias cruzadas (quién importa qué)
- [ ] Detección heurística de endpoints (Express/Fastify/etc.)
- [ ] Trazado de flujo entre archivos (grafo simple)
- [ ] Visualización opcional del grafo

## Infra / calidad

- [ ] Tests mínimos para scanner y chunker
- [ ] Frontend React mínimo (opcional)
- [ ] Métricas de indexación (tiempo, tokens, RAM)
