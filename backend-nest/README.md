# OpenMemory Backend (NestJS) — Архітектура, потоки даних, конфігурація

## Огляд

OpenMemory Backend (NestJS) — модульна система пам’яті, запитів та самообслуговування, побудована на NestJS, SQLite, та векторних ембеддингах. Бекенд обслуговує:

- Зберігання контенту з метаданими, векторними поданнями та графом зв’язків («waypoints»)
- Запит і ранжування пам’ятей із гібридним скорингом (векторна схожість + BM25 + графова активація)
- Автоматичну технічну підтримку (decay, prune, compress, reflect, consolidate)
- Метрики і моніторинг системи (через таблицю `stats` і `/dashboard/*` ендпоїнти)
- Інтеграцію з MCP (Model Context Protocol) для інструментів і ресурсів

Порт: `ENGRAMMA_PORT` (за замовчуванням `8080`) у `src/main.ts:16`.

## Модулі

- Memory: логіка збереження, запитів, графа, кешів, планувальників
- Compression: стиснення тексту і метрики
- Dynamics: енергія активації, підсилення (reinforcement), графові статистики
- Temporal: часові факти і ребра, лінії часу, порівняння
- Dashboard: агрегує здоров’я системи, статистику, таймлайни
- Users: узагальнення активності користувачів, списки пам’ятей
- System: системні ендпоїнти здоров’я/статистики
- Sqlite: ініціалізація БД, індекси, схеми
- MCP: реєструє MCP-ресурси та інструменти
- Guards: глобальний `ApiKeyGuard` для API-Key та rate limiting

Модульний склад: `src/app.module.ts:18–41`.

## Схема БД (SQLite)

Створюється у `src/sqlite/sqlite.service.ts:50–210`. Шлях БД:

- `ENGRAMMA_DB_PATH` або `backend-nest/data/authfymemory.sqlite` (автостворення директорії)

Таблиці (головні):

- `memories`: контент, теги, метадані, сектор, часові поля, mean-вектор, стислий вектор
- `vectors`: по-секторні вектори (`id`, `sector`, `user_id`, `v`, `dim`)
- `waypoints`: зв’язки між пам’ятями (`src_id → dst_id`, `weight`, `user_id`)
- `stats`: агреговані лічильники подій (`type`, `count`, `ts`)
- `coactivations`: співактивації між пам’ятями (`src_id`, `dst_id`, `count`, `updated_at`)
- `bm25_tokens`, `bm25_docs`, `bm25_meta`: метадані для BM25 (df, довжини документів, N, avgLen)
- `session_events`: події сесій (користувач, пам’ять, тип, час)
- `users`: агреговані дані по користувачах
- `temporal_facts`, `temporal_edges`: часові факти та зв’язки

## Дані та типи

Сектори: `episodic | semantic | procedural | emotional | reflective`

- Вектори: `embedding.service.ts:291–306`
- Внутрішні структури та ваги секторів: `memory.service.ts:115–123`
- Резонанс секторів: `memory.service.ts:236–297`

## Кеші

- `resultCache`: TTL-кеш результатів запиту, `TTL=60000` мс, лічильник хітів у `stats` (`cache_hit`). Використання: `memory.service.ts:1979–1986`.
- `vecCache`: LRU-подібний TTL-кеш векторів (по ключах `vec:id:sector` та `mean:id`), з метриками:
  - `hits`, `misses`, `size`, `evictions`, `ttl_ms`, `max_entries`
  - Реалізація: `memory.service.ts:590–631` + метрики і getter `getVecCacheMetrics()`

## Запит і скоринг

Потік `/memory/query` (контролер у `memory.controller.ts`, сервіс у `memory.service.ts`):

1. Токенізація, стоп-слова, IDF/BM25 (кеш і таблиці BM25)
2. Векторна схожість по секторам, гібридний скоринг `hybridScore`
3. Спрединг-активація по графу (waypoints) з вагами
4. Порог енергії, об’єднання скорингу і фільтрів
5. Кешування результатів і інкремент статистики:
   - `request`, `cache_hit`, `query_latency_sum/count`, бакети латентності `lat_*`
6. Лінкування сесій, лог подій, підсилення співактивацій

Основні точки:

- Ключові змінні середовища для запиту: `ENGRAMMA_TIER`, `ENGRAMMA_KEYWORD_MIN_LENGTH`, `ENGRAMMA_KEYWORD_BOOST`, `ENGRAMMA_USE_GRAPH`, `ENGRAMMA_GRAPH_DEPTH`, `ENGRAMMA_ACTIVATION_*`
- Код: `memory.service.ts:1988–2165` (включно з інкрементами метрик)

## Інжест та оновлення

- Додавання пам’яті: стиснення (за потреби), ембеддинг на сектори, mean-вектор, BM25 оновлення, шляхові зв’язки
  - `buildContentAndCompressed`: `memory.service.ts:633–676`
  - BM25 оновлення: `memory.service.ts:1731–1756`
- Патч пам’яті: перевирахунок векторів, BM25, nearest neighbor link
  - `memory.service.ts:2185–2285`

## Самообслуговування (Schedulers)

Ініціюються в конструкторі: `memory.service.ts:134–164`

- `startPruneScheduler`: prune слабких/старих інформацій, лічильники `prune_*`
- `startDecayScheduler`: декей, компресія, символьні відбитки, лічильники `decay_*`, `compress`, `fingerprint`
- `startReflectScheduler` та `startReflectHierarchyScheduler`: рефлексії і консилідації, лічильники `reflect`, `consolidate`
- `startCoactivationScheduler`: топ-співактивації, `coactivations`
- `startDensePruneScheduler`: обрізання надмірних зв’язків, `prune_dense`
- `startSessionEventPruneScheduler`: TTL/ліміт для `session_events`
- `startBm25Migration`: одноразова міграція BM25-структур

## Метрики та дашборд

- Запис метрик: `MemoryRepository.incStat` → `stats` (`memory.repository.ts:518–525`)
- Дашборд:
  - `/dashboard/health`: процес/пам’ять/DB лічильники
  - `/dashboard/stats`: QPS, errorRate, cacheHitRate, latency p50/p95/p99, стиснення, сектори, тири (hot/warm/cold), конфіг
  - `/dashboard/sectors/timeline`: розподіл пам’ятей по секторам за годинами
  - Агрегація операцій обслуговування за годину: decay/compress/fingerprint/reflect/prune\_\*
  - Код: `dashboard.controller.ts`

## MCP інтеграція

- Реєстрація ресурсів та інструментів для MСP: `mcp.service.ts`
- Модуль: `mcp.module.ts` з залежностями `MemoryModule`, `SqliteModule`

## Безпека та Rate Limiting

- Глобальний `ApiKeyGuard` (`app.module.ts:40–41`):
  - Публічні маршрути: `/health`, `/api/system/*`, `/dashboard/health`
  - Ключ: `ENGRAMMA_API_KEY`, хедера `x-api-key` або Bearer
  - Rate Limit (опційно): `ENGRAMMA_RATE_LIMIT_ENABLED`, `ENGRAMMA_RATE_LIMIT_WINDOW_MS`, `ENGRAMMA_RATE_LIMIT_MAX_REQUESTS`
  - Код: `guards/api-key.guard.ts`

## Конфігурація (ENV)

Основні параметри (див. посилання в коді):

- Порт: `ENGRAMMA_PORT`
- DB: `ENGRAMMA_DB_PATH`
- Кеші: `ENGRAMMA_VEC_CACHE_TTL`, `ENGRAMMA_VEC_CACHE_MAX`, `ENGRAMMA_CACHE_SEGMENTS`, `ENGRAMMA_MAX_ACTIVE`
- Компресія: `ENGRAMMA_COMPRESSION_ENABLED`, `ENGRAMMA_COMPRESSION_MIN_LENGTH`
- Рефлексії: `ENGRAMMA_AUTO_REFLECT`, `ENGRAMMA_REFLECT_*` (інтервали, пороги, леми)
- Decay: `ENGRAMMA_DECAY_*` (пороги, лямбда, треди), `ENGRAMMA_DECAY_REINFORCE_ON_QUERY`
- BM25: `ENGRAMMA_BM25_*` (міграція, розміри партій)
- Запити: `ENGRAMMA_TIER`, `ENGRAMMA_KEYWORD_MIN_LENGTH`, `ENGRAMMA_KEYWORD_BOOST`, `ENGRAMMA_USE_GRAPH`, `ENGRAMMA_GRAPH_DEPTH`, `ENGRAMMA_ACTIVATION_*`
- Резонанс/Ваги секторів: `ENGRAMMA_SECTOR_WEIGHTS`, `ENGRAMMA_SECTOR_RESONANCE`
- Вектори: `ENGRAMMA_VEC_DIM`, `ENGRAMMA_MIN_VECTOR_DIM`, `ENGRAMMA_REGENERATION_ENABLED`
- Сесії: `ENGRAMMA_SESSION_*` (timeout, TTL, prune, caps)
- Coactivations: `ENGRAMMA_COACT_*` (вікно, ліміти, буст, симетрія, ваги)
- Режим: `ENGRAMMA_MODE` (`standard` або `langgraph`)

## Ендпоїнти (приклади)

- Memory: `/memory/add`, `/memory/query`, `/memory/:id (PATCH)`
- Dynamics: `/dynamics/retrieval/energy-based`, `/dynamics/reinforcement/trace`, графові агрегації
- Temporal: CRUD для фактів/ребер, пошук, таймлайни
- Dashboard: `/dashboard/health`, `/dashboard/stats`, `/dashboard/sectors/timeline`, `/dashboard/maintenance`
- System: `/api/system/health`, `/api/system/stats`
- MCP: `/mcp` (streamable HTTP транспорт MCP)

## Дашборд (Next.js)

- Бере `NEXT_PUBLIC_API_URL` та `NEXT_PUBLIC_API_KEY`: `dashboard/lib/api.ts`
- Компоненти: сторінка `dashboard/app/page.tsx` візуалізує health, QPS, латентність, кеші, обслуговування

## Запуск (Windows)

```powershell
# у каталозі backend-nest
npm install
npm run start:dev
# або продакшен
npm run build
npm run start:prod
```

## Посилання на код

- AppModule: `backend-nest/src/app.module.ts:18–41`
- Main (порт): `backend-nest/src/main.ts:16–18`
- DB схеми: `backend-nest/src/sqlite/sqlite.service.ts:50–210`
- Кеші та метрики: `backend-nest/src/memory/memory.service.ts:590–631`, `650–663`, `1979–1986`, `2176–2182`
- Дашборд: `backend-nest/src/dashboard/dashboard.controller.ts`
- Guard: `backend-nest/src/guards/api-key.guard.ts`
