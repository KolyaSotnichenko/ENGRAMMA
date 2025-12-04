import Link from 'next/link';

export default function DocsPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-10 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-200">OpenMemory Guide</h1>
        <Link
          href="/"
          className="text-xs font-medium text-stone-400 hover:text-stone-200 border border-stone-800/50 rounded-md px-3 py-1.5"
        >
          Back to Dashboard
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Overview</h2>
        <p className="text-stone-400">
          OpenMemory — система пам’яті з секторною семантикою, графом асоціацій,
          гібридним пошуком і розумним обслуговуванням (згасання, рефлексії,
          консолідації, компресія). Ця сторінка коротко пояснює архітектуру,
          алгоритми, метрики та конфігурацію.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Architecture</h2>
        <ul className="text-stone-400 space-y-1">
          <li>
            - Memory Service: класифікація, ембеддинг, ретрієвал, згасання,
            рефлексії
          </li>
          <li>
            - Embedding Service: провайдери ембеддингів (synthetic/openai),
            sector-aware
          </li>
          <li>
            - Memory Repository: SQLite сховище для
            memories/vectors/waypoints/stats
          </li>
          <li>
            - Modules: Dashboard, Dynamics, Temporal, Compression, Users, System
          </li>
          <li>- Guards: API key; ConfigModule: глобальні змінні середовища</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Memory Model</h2>
        <ul className="text-stone-400 space-y-1">
          <li>
            - Сектори: episodic, semantic, procedural, emotional, reflective
          </li>
          <li>
            - Вектори: повнорозмірні або стиснені; первинний сектор + додаткові
          </li>
          <li>- Waypoints: зважені асоціативні ребра між пам’ятями</li>
          <li>- Stats: лічильники операцій для дашборду</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">
          Retrieval & Ranking
        </h2>
        <ul className="text-stone-400 space-y-1">
          <li>
            - Hybrid score: cosine + token overlap + waypoint weight + recency +
            keywords
          </li>
          <li>- BM25 (hybrid tier): IDF/avgLen дає точні keyword-хіти</li>
          <li>
            - Cross-sector resonance: матриця підсилює релевантні міжсекторальні
            збіги
          </li>
          <li>
            - Spreading activation: енергія поширюється по графу, додається до
            скору
          </li>
          <li>
            - Personalization: бонус за коактивації з останньою пам’яттю сесії
          </li>
          <li>- Path: побудова шляху між попередньою та знайденою пам’яттю</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">
          Maintenance & Decay
        </h2>
        <ul className="text-stone-400 space-y-1">
          <li>
            - Tiered decay: hot/warm/cold з різними λ; уповільнення від
            коактивацій
          </li>
          <li>
            - Compression: стискання резюме та зменшення розмірності векторів
          </li>
          <li>- Fingerprint: легкий хеш-вектор для дуже «холодних» пам’ятей</li>
          <li>
            - Regeneration: відновлення повного секторального вектора на
            запит-хіт
          </li>
          <li>- Reinforce: підвищення salience пам’яті та її сусідів</li>
          <li>
            - Reflection & Consolidation: кластери подібних пам’ятей →
            узагальнення
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Temporal Graph</h2>
        <ul className="text-stone-400 space-y-1">
          <li>
            - Факти з валідністю у часі; таймлайни за суб’єктом/предикатом
          </li>
          <li>
            - Порівняння станів за дві дати; волатильність та спорідненість
            фактів
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">
          Dashboard Metrics
        </h2>
        <ul className="text-stone-400 space-y-1">
          <li>- Stats: requests/errors/cache_hit, QPS peak/avg</li>
          <li>- Maintenance: decay/reflection/consolidation по годинах</li>
          <li>
            - Tiered breakdown: decay_hot/decay_warm/decay_cold, compression,
            fingerprint
          </li>
          <li>
            - Memory summary: total, sectorCounts, avgSalience, tiers,
            compressionRatio
          </li>
          <li>
            - Compression coverage: частка пам’ятей із compressed_vec;
            compressedCount
          </li>
          <li>
            - Avg/Base vector dim: середня розмірність і базова ENGRAMMA_VEC_DIM
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Environment: Full Reference</h2>
        <ul className="text-stone-400 space-y-1">
          <li>- ENGRAMMA_PORT — порт сервера; default 8080</li>
          <li>- ENGRAMMA_API_KEY — ключ API; пустий вимикає guard (dev)</li>
          <li>- ENGRAMMA_RATE_LIMIT_ENABLED/WINDOW_MS/MAX_REQUESTS — увімкнення, вікно (мс), ліміт;  true/60000/100</li>
          <li>- ENGRAMMA_MODE — standard | langgraph</li>
          <li>- ENGRAMMA_DB_PATH — шлях SQLite; ./data/authfymemory.sqlite</li>
          <li>- ENGRAMMA_EMBEDDINGS — openai | gemini | ollama | local | synthetic</li>
          <li>- ENGRAMMA_VEC_DIM — базова розмірність; залежить від tier; можна перевизначити</li>
          <li>- ENGRAMMA_EMBED_MODE — simple | advanced</li>
          <li>- ENGRAMMA_ADV_EMBED_PARALLEL — паралельність у advanced; false</li>
          <li>- ENGRAMMA_EMBED_DELAY_MS — затримка між викликами; 200</li>
          <li>- ENGRAMMA_OPENAI_BASE_URL — OpenAI endpoint; напр. http://127.0.0.1:1234/v1</li>
          <li>- ENGRAMMA_OPENAI_MODEL — глобальна модель; напр. text-embedding-bge-m3</li>
          <li>- ENGRAMMA_OPENAI_SECTOR_MODELS — JSON моделі по секторам</li>
          <li>- ENGRAMMA_OPENAI_SECTOR_MODELS_FILE — шлях до JSON/YAML конфігу</li>
          <li>- OPENAI_API_KEY — ключ постачальника</li>
          <li>- ENGRAMMA_STOPWORDS — JSON масив/обʼєкт стопслів</li>
          <li>- ENGRAMMA_REFLECT_EN_STEM — стемінг англ. у рефлексіях; true</li>
          <li>- ENGRAMMA_REFLECT_LEMMAS — JSON леми</li>
          <li>- ENGRAMMA_REFLECT_EVIDENCE_COUNT — кількість речень‑доказів; 3</li>
          <li>- ENGRAMMA_REFLECT_MAX_OVERLAP — макс. Jaccard перекриття; 0.8</li>
          <li>- ENGRAMMA_BM25_MIGRATE_ON_START — міграція BM25 на старті; false</li>
          <li>- ENGRAMMA_BM25_MIGRATE_BATCH — розмір батчу; 500</li>
          <li>- ENGRAMMA_SESSION_EVENT_TTL_MINUTES — TTL подій; 240</li>
          <li>- ENGRAMMA_SESSION_PRUNE_INTERVAL_MINUTES — інтервал чистки; 10</li>
          <li>- ENGRAMMA_SESSION_MAX_EVENTS_PER_USER — ліміт подій; 1000</li>
          <li>- ENGRAMMA_SESSION_TIMEOUT_MINUTES — таймаут сесії; 30</li>
          <li>- ENGRAMMA_COACT_WINDOW_MINUTES — вікно інгесту; 30</li>
          <li>- ENGRAMMA_COACT_INTERVAL_MINUTES — інтервал обробки; 10</li>
          <li>- ENGRAMMA_COACT_TOP — топ‑N коактивацій; 200</li>
          <li>- ENGRAMMA_COACT_EVENTS_LIMIT — ліміт подій у вікні; 1000</li>
          <li>- ENGRAMMA_COACT_EVENT_ALPHA — вагомість події; 1</li>
          <li>- ENGRAMMA_COACT_EVENT_SYMMETRIC — симетрія; true</li>
          <li>- ENGRAMMA_COACT_BOOST — базовий буст ребер; 0.02</li>
          <li>- ENGRAMMA_COACT_TYPE_WEIGHTS — JSON ваги типів подій</li>
          <li>- ENGRAMMA_QUERY_COACT_BOOST — бонус у ранжуванні; 0.05</li>
          <li>- ENGRAMMA_MAX_PAYLOAD_SIZE — макс. розмір тіла; 1000000</li>
          <li>- ENGRAMMA_TIER — hybrid | fast | smart | deep; обовʼязковий</li>
          <li>- ENGRAMMA_KEYWORD_BOOST — буст ключових слів; 2.5</li>
          <li>- ENGRAMMA_KEYWORD_MIN_LENGTH — мін. довжина токена; 3</li>
          <li>- ENGRAMMA_SECTOR_WEIGHTS — JSON ваги секторів</li>
          <li>- ENGRAMMA_FUSION_BETA — softmax β; 2.5</li>
          <li>- ENGRAMMA_SECTOR_RESONANCE — JSON матриця резонансу секторів (множник у ранжуванні)</li>
          <li>- ENGRAMMA_VEC_CACHE_TTL — TTL кешу векторів (мс); 300000</li>
          <li>- ENGRAMMA_VEC_CACHE_MAX — макс. кешованих векторів; 5000</li>
          <li>- ENGRAMMA_PRUNE_INTERVAL_MINUTES — інтервал чистки; 5</li>
          <li>- ENGRAMMA_PRUNE_WEAK_THRESHOLD — поріг слабких ребер; 0.05</li>
          <li>- ENGRAMMA_PRUNE_AGE_DAYS — вік «старого» ребра; 30</li>
          <li>- ENGRAMMA_PRUNE_OLD_THRESHOLD — поріг для старих; 0.1</li>
          <li>- ENGRAMMA_DENSE_PRUNE_INTERVAL — щільна чистка; 15</li>
          <li>- ENGRAMMA_DECAY_INTERVAL_MINUTES — інтервал декею; 30</li>
          <li>- ENGRAMMA_DECAY_THREADS — воркери; 3</li>
          <li>- ENGRAMMA_DECAY_COLD_THRESHOLD — поріг «холодних»; 0.25</li>
          <li>- ENGRAMMA_DECAY_REINFORCE_ON_QUERY — підсилювати при запиті; true</li>
          <li>- ENGRAMMA_REGENERATION_ENABLED — регенерація на хіт; true</li>
          <li>- ENGRAMMA_DECAY_LAMBDA_HOT/WARM/COLD — λ/день: 0.005/0.02/0.05</li>
          <li>- ENGRAMMA_DECAY_COACT_MOD — уповільнення λ від коактивацій; 0.15</li>
          <li>- ENGRAMMA_MIN_VECTOR_DIM — мін. розмірність для регенерації; 64</li>
          <li>- ENGRAMMA_USE_SUMMARY_ONLY — зберігати лише резюме; true</li>
          <li>- ENGRAMMA_SUMMARY_MAX_LENGTH — макс. довжина резюме; 300</li>
          <li>- ENGRAMMA_SEG_SIZE — розмір сегмента памʼятей; 10000</li>
          <li>- ENGRAMMA_CACHE_SEGMENTS — активні сегменти; 3</li>
          <li>- ENGRAMMA_MAX_ACTIVE — макс. активних запитів; 64</li>
          <li>- ENGRAMMA_AUTO_REFLECT — авторефлексії; true</li>
          <li>- ENGRAMMA_REFLECT_INTERVAL — інтервал; 10</li>
          <li>- ENGRAMMA_REFLECT_MIN_MEMORIES — мінімум памʼятей; 20</li>
          <li>- ENGRAMMA_REFLECT_SIM_THRESHOLD — косинус; 0.88</li>
          <li>- ENGRAMMA_REFLECT_MIN_CLUSTER — мін. кластер; 3</li>
          <li>- ENGRAMMA_REFLECT_MAX_CLUSTERS — макс. кластерів; 2</li>
          <li>- ENGRAMMA_COMPRESSION_ENABLED — компресія контенту; false</li>
          <li>- ENGRAMMA_COMPRESSION_MIN_LENGTH — мін. довжина; 100</li>
          <li>- ENGRAMMA_REFLECT_HIER_ENABLED — рівень‑2; true</li>
          <li>- ENGRAMMA_REFLECT_HIER_INTERVAL — інтервал; 30</li>
          <li>- ENGRAMMA_REFLECT_SUPER_MIN_CLUSTER — мін. вузлів; 2</li>
          <li>- ENGRAMMA_REFLECT_SUPER_MAX_CLUSTERS — макс. за цикл; 2</li>
          <li>- ENGRAMMA_REFLECT_SUPER_SIM_THRESHOLD — косинус; 0.9</li>
          <li>- ENGRAMMA_USE_GRAPH — шлях у відповіді; true</li>
          <li>- ENGRAMMA_GRAPH_DEPTH — глибина шляху; 2</li>
          <li>- ENGRAMMA_ACTIVATION_STEPS — кроки активації; 2</li>
          <li>- ENGRAMMA_ACTIVATION_GAMMA — γ затухання; 0.35</li>
          <li>- ENGRAMMA_ACTIVATION_WEIGHT — вага енергії; 0.3</li>
          <li>- ENGRAMMA_ACTIVATION_TAU — енергетичний поріг; 0.4</li>
          <li>- NEXT_PUBLIC_API_URL — базовий URL дашборду</li>
          <li>- NEXT_PUBLIC_API_KEY — ключ дашборду</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">API Endpoints</h2>
        <ul className="text-stone-400 space-y-1">
          <li>
            - GET /dashboard/stats, /dashboard/health, /dashboard/activity
          </li>
          <li>- GET /dashboard/sectors/timeline, /dashboard/maintenance</li>
          <li>
            - Memory CRUD & query: /memory/* (додавання, пошук, підкріплення)
          </li>
          <li>- Temporal: /temporal/* (факти, таймлайни, порівняння)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">How It Works</h2>
        <ol className="text-stone-400 space-y-1 list-decimal ml-5">
          <li>Вхідний контент класифікується по секторах</li>
          <li>Генеруються вектори (sector-aware) і зберігаються</li>
          <li>Будуються асоціації (waypoints), оновлюються BM25</li>
          <li>Пошук: гібридне ранжування + spreading activation + шлях</li>
          <li>
            Обслуговування: tiered decay, компресія, фінгерпринт, рефлексії
          </li>
          <li>Метрики збираються у stats і відображаються у дашборді</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Algorithms: Full Reference</h2>
        <ul className="text-stone-400 space-y-1">
          <li>- Hybrid score: s = σ( w<sub>sim</sub>·boostedSim + w<sub>overlap</sub>·tokOv + w<sub>wp</sub>·wpWt + w<sub>rec</sub>·rec + keywordScore )</li>
          <li>- BM25: score = Σ IDF(t) · ((tf·(k+1)) / (tf + k·(1-b + b·|D|/avgD)))</li>
          <li>- Cross-sector resonance: fusedAdj = fusedSim · R[primary_sector][query_sector]; конфігуровано через ENGRAMMA_SECTOR_RESONANCE</li>
          <li>- Spreading activation: a<sub>t+1</sub>(dst) += Σ weight · a<sub>t</sub>(src) · e<sup>-γ</sup>; поріг τ · (1 + log(sumE + 1))</li>
          <li>- Tiered decay: λ ∈ &lcub;hot,warm,cold&rcub; за salience/давністю; λ модулюється (1 − ENGRAMMA_DECAY_COACT_MOD) при коактиваціях</li>
          <li>- Vector compression: bucket‑усереднення до target dim; нормалізація на step</li>
          <li>- Fingerprint: знаковий хеш‑вектор довжини d; нормування по max|x|</li>
          <li>- Regeneration: якщо dim ≤ ENGRAMMA_MIN_VECTOR_DIM та хіт → повний секторний ембеддинг</li>
          <li>- Reinforce: salience сусідів += boost · edgeWeight; обмеження до [0..1]</li>
          <li>- Reflection: кластери за cosine ≥ ENGRAMMA_REFLECT_SIM_THRESHOLD; evidence = ENGRAMMA_REFLECT_EVIDENCE_COUNT</li>
          <li>- Hierarchical consolidation: super‑батьки за ENGRAMMA_REFLECT_SUPER_SIM_THRESHOLD; межі ENGRAMMA_REFLECT_SUPER_MIN/MAX_CLUSTERS</li>
          <li>- Sector fusion: softmax ваг з ENGRAMMA_SECTOR_WEIGHTS, β = ENGRAMMA_FUSION_BETA</li>
          <li>- Keyword ranking: HYBRID → BM25; FAST → IDF‑зважений токен‑оверлап</li>
          <li>- Graph pruning: видалення ребер weight&lt;threshold або age&gt;days з ENGRAMMA_PRUNE_*</li>
          <li>- Coactivation ingestion: вікно/ліміти/ваги з ENGRAMMA_COACT_*; personalization через ENGRAMMA_QUERY_COACT_BOOST</li>
          <li>- Query pipeline: ембеддинг запиту → cosine/keywords → злиття → резонанс → activation → path → регенерація → top‑k</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-200">Glossary</h2>
        <ul className="text-stone-400 space-y-1">
          <li>- Salience: «вага» пам’яті (0..1)</li>
          <li>- Waypoint: зважене ребро між пам’ятями</li>
          <li>- Coactivation: спільна активність пар у сесії</li>
          <li>- Fingerprint: компактне хеш‑представлення «холодної» пам’яті</li>
        </ul>
      </section>
    </div>
  );
}
