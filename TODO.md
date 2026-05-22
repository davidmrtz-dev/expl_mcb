# Explain My Codebase Agent — TODO incremental

## FASE 1 — Indexación local ✅

- [x] Estructura de carpetas y arquitectura documentada
- [x] Scanner de repo (TS/JS, ignores)
- [x] Parser tree-sitter + chunker por símbolos
- [x] Pipeline de embeddings vía Ollama (`nomic-embed-text`)
- [x] Persistencia SQLite (chunks + vectores + metadata)
- [x] CLI: `npm run index -- --repo <path>`

## FASE 2 — Preguntas con contexto ✅

- [x] Servidor HTTP (Fastify) con `POST /ask`
- [x] Retrieval: cosine similarity sobre embeddings en SQLite
- [x] Context builder (top-k chunks + metadata de archivo)
- [x] Llamada a LLM local (`OLLAMA_CHAT_MODEL`)
- [x] Respuesta en streaming (SSE + CLI stdout)
- [x] Scripts `npm run ask` y `npm run serve`
- [ ] Probar ask + serve con modelo de chat instalado

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
