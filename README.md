# Trentino Quest — Backend

[![CI](https://github.com/TrentinoQuest/trentino-quest-backend/actions/workflows/Ci.yml/badge.svg)](https://github.com/TrentinoQuest/trentino-quest-backend/actions/workflows/Ci.yml)

Backend REST API per **Trentino Quest**, app gamificata per l'esplorazione del Trentino.

Progetto del corso di **Ingegneria del Software** (a.a. 2025-2026), Università degli Studi di Trento, Prof. Sandro Fiore.
**Gruppo 19**: Valerio Cancemi (242804), Federico Caposano (243138).

## Stack tecnologico

- **Runtime**: Node.js 22 LTS
- **Linguaggio**: TypeScript 5.x con strict mode
- **Framework HTTP**: Express 5
- **Database**: MongoDB 8 con ODM Mongoose 9
- **Validazione**: zod (env vars e logica applicativa), express-openapi-validator (richieste HTTP)
- **Autenticazione**: JWT (access + refresh token), OAuth 2.0 Google
- **Push notifications**: Firebase Admin SDK
- **Job scheduling**: node-cron
- **Logging**: pino (JSON strutturato in produzione, pretty-printed in sviluppo)
- **Test**: Vitest + Supertest + mongodb-memory-server
- **API Style**: REST (Fielding 2000), documentata via OpenAPI 3.0 (`swagger.yaml`)

## Architettura

Il backend implementa il **Web Service** della reference architecture del corso (Web Front-end, Web Service Node.js, Persistent layer MongoDB).

La struttura interna è organizzata per **componenti** secondo il Deliverable D2: ogni cartella in `src/modules/` corrisponde a un componente del diagramma componenti.

```
src/
├── config/                  # validazione env, logger, gamification config, daily quests config
├── database/
│   └── models/              # schemi Mongoose (componente Database del D2)
├── jobs/                    # cron job periodici (pulizia token, reset leghe, scadenza coupon)
├── middleware/              # error handler, request logger, OpenAPI validator, Swagger UI
├── modules/                 # componenti applicativi del D2
│   ├── auth/                # AuthService - registrazione, login, refresh, OAuth Google
│   ├── quests/              # QuestService - profilo player, completamento quest, admin quest,
│   │                          operatori, validazione QR, prossimità, gamification, daily quest
│   ├── business/            # BusinessService - gestione attività, offerte, coupon
│   ├── social/              # SocialService - amicizie, classifica amici, feed, kudos
│   ├── leagues/             # LeagueService - gironi settimanali, promozione/retrocessione
│   ├── lore/                # LoreService - quiz lore giornaliero
│   ├── market/              # MarketService - acquisto e riscatto coupon
│   ├── coop/                # CoopService - sfide cooperative tra giocatori
│   └── analytics/           # AnalyticsService - statistiche admin
├── utils/                   # classi di errore condivise
└── server.ts                # entry point
```

Ogni modulo applicativo segue il pattern **Controller-Service-Repository**:

- `routes/` definisce gli endpoint HTTP e li mappa ai controller
- `controllers/` riceve la richiesta, invoca il service, ritorna la risposta
- `services/` contiene la logica di business
- `repositories/` accede al database
- `validators/` valida l'input con zod (validazione applicativa, complementare a quella OpenAPI)

## Avvio rapido

Requisiti: Node.js >= 22, npm, Docker Desktop.

### Prima volta

```bash
# 1. Installa le dipendenze
npm install

# 2. Crea il file di configurazione locale
cp .env.example .env

# 3. Avvia MongoDB in container
docker compose up -d

# 4. (Opzionale) Popola il database con dati di esempio
npm run seed

# 5. Avvia il server in modalità sviluppo
npm run dev
```

Il server è disponibile su `http://localhost:3000`.

### Verifica che tutto funzioni

```bash
# Health check (deve rispondere 200 con database: connected)
curl http://localhost:3000/health

# Documentazione OpenAPI navigabile
open http://localhost:3000/api/v1/docs
```

### Arresto

```bash
# Ferma il server
# (Ctrl+C nel terminale, gestisce graceful shutdown)

# Ferma MongoDB (i dati persistono nel volume docker)
docker compose down
```

## Variabili d'ambiente

Tutte le variabili sono validate all'avvio tramite zod. Se mancanti o non valide, il server termina con un errore descrittivo.

| Variabile                           | Obbligatoria | Default                           | Descrizione                                        |
| ----------------------------------- | ------------ | --------------------------------- | -------------------------------------------------- |
| `NODE_ENV`                          | no           | `development`                     | `development`, `production`, `test`                |
| `PORT`                              | no           | `3000`                            | Porta del server HTTP                              |
| `LOG_LEVEL`                         | no           | `info`                            | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `MONGODB_URI`                       | sì           | —                                 | Connection string MongoDB completa                 |
| `DB_RETRY_INTERVAL_MS`              | no           | `5000`                            | Intervallo di retry connessione DB (ms)            |
| `JWT_SECRET`                        | sì           | —                                 | Chiave segreta per la firma dei JWT (min 32 car.)  |
| `JWT_ACCESS_EXPIRES_IN`             | no           | `15m`                             | Durata access token                                |
| `JWT_REFRESH_EXPIRES_IN`            | no           | `30d`                             | Durata refresh token                               |
| `GEO_MAX_ACCURACY_METERS`           | no           | `100`                             | Precisione GPS massima accettata (m)               |
| `GEO_MAX_FIX_AGE_SECONDS`           | no           | `60`                              | Età massima fix GPS accettata (s)                  |
| `FIREBASE_ENABLED`                  | no           | `false`                           | Abilita invio push notification via Firebase       |
| `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` | no           | `./firebase-service-account.json` | Path al file JSON service account Firebase         |
| `GOOGLE_CLIENT_ID`                  | no           | —                                 | Client ID da Google Cloud Console (OAuth)          |
| `SKIP_OAUTH_VERIFICATION`           | no           | `false`                           | Bypassa verifica token OAuth (solo sviluppo)       |

Vedi `.env.example` per i valori di esempio.

## Script disponibili

| Comando                    | Descrizione                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Avvia il server in modalità sviluppo con auto-reload           |
| `npm run build`            | Compila TypeScript in `dist/`                                  |
| `npm start`                | Avvia il server in produzione (richiede `npm run build` prima) |
| `npm run typecheck`        | Verifica i tipi TypeScript senza compilare                     |
| `npm run lint`             | Esegue ESLint su tutti i file `.ts`                            |
| `npm run lint:fix`         | ESLint con auto-fix                                            |
| `npm run format`           | Formatta tutto il codice con Prettier                          |
| `npm run format:check`     | Verifica la formattazione senza modificare                     |
| `npm run seed`             | Popola il database con dati di sviluppo (valli, quest, ecc.)   |
| `npm test`                 | Esegue tutti i test (unit + integration)                       |
| `npm run test:unit`        | Esegue solo i test unitari                                     |
| `npm run test:integration` | Esegue solo i test di integrazione                             |
| `npm run test:watch`       | Modalità watch per lo sviluppo                                 |

## Test

I test sono scritti con **Vitest** e organizzati in due categorie:

```
tests/
├── fixtures/       # dati e helper condivisi tra i test
├── setup/          # beforeAll/afterEach/afterAll globali (mongodb-memory-server)
├── unit/           # test unitari per service, validator, utility
└── integration/    # test di integrazione HTTP via Supertest
```

I test non richiedono un'istanza MongoDB esterna: `mongodb-memory-server` avvia un processo MongoDB in-memory prima di ogni suite e lo ferma al termine. È sufficiente eseguire `npm test` senza configurazioni aggiuntive.

## Documentazione OpenAPI

La specifica OpenAPI dell'API REST si trova in `swagger.yaml` (root del repository).

Quando il server è in esecuzione, sono disponibili:

- **Swagger UI** navigabile: `http://localhost:3000/api/v1/docs`
- **Spec OpenAPI in JSON**: `http://localhost:3000/api/v1/docs/openapi.json`

Le richieste HTTP verso path documentati nello schema vengono validate automaticamente: parametri di query, path parameters, body e header di autenticazione. Eventuali violazioni producono response 400 con dettagli del campo non valido.

## Connessione MongoDB

Il backend implementa **auto-recovery** della connessione al database. Comportamento atteso nei tre scenari:

1. **MongoDB attivo all'avvio**: connessione immediata, server pronto.
2. **MongoDB cade durante l'esecuzione**: il backend rileva la disconnessione, logga un warning, ritenta automaticamente fino al ripristino.
3. **MongoDB spento all'avvio**: il backend non termina, ritenta ogni `DB_RETRY_INTERVAL_MS` millisecondi finché MongoDB non torna disponibile.

L'endpoint `/health` riflette lo stato del database e ritorna `503 Service Unavailable` quando il database non è raggiungibile.

## Struttura del repository del progetto

Trentino Quest è organizzato come polyrepo con quattro repository applicativi più uno di documentazione:

- **TrentinoQuest/docs** — Deliverable D1, D2, ADR architetturali
- **TrentinoQuest/backend** — questo repository
- **TrentinoQuest/shared-types** — DTO TypeScript condivisi tra backend e frontend
- **TrentinoQuest/mobile** — app mobile Ionic + Angular + Capacitor
- **TrentinoQuest/backoffice** — pannello amministrativo Angular (admin + operator)

## Convenzioni di sviluppo

Il progetto segue **Conventional Commits** per i messaggi di commit:

- `feat:` nuova funzionalità
- `fix:` correzione di bug
- `chore:` modifiche di setup, configurazione, manutenzione
- `docs:` aggiornamenti alla documentazione
- `refactor:` modifiche al codice senza cambi funzionali
- `test:` aggiunta o modifica di test
- `style:` modifiche di formattazione (no logica)

Esempio: `feat: add quest completion endpoint`.
