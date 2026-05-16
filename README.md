# Trentino Quest — Backend

[![CI](https://github.com/TrentinoQuest/trentino-quest-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/TrentinoQuest/trentino-quest-backend/actions/workflows/ci.yml)

Backend REST API per **Trentino Quest**, app gamificata per l'esplorazione del Trentino.

Progetto del corso di **Ingegneria del Software** (a.a. 2025-2026), Università degli Studi di Trento, Prof. Sandro Fiore.
**Gruppo 19**: Valerio Cancemi (242804), Federico Caposano (243138).

## Stack tecnologico

- **Runtime**: Node.js 22 LTS
- **Linguaggio**: TypeScript 5.x con strict mode
- **Framework HTTP**: Express 4
- **Database**: MongoDB 8 con ODM Mongoose 9
- **Validazione**: zod (env vars), express-openapi-validator (richieste HTTP)
- **Logging**: pino (JSON strutturato in produzione, pretty-printed in sviluppo)
- **API Style**: REST (Fielding 2000), documentata via OpenAPI 3.0

## Architettura

Il backend implementa il **Web Service** della reference architecture del corso (Web Front-end, Web Service Node.js, Persistent layer MongoDB).

La struttura interna è organizzata per **componenti** secondo il Deliverable D2: ogni cartella in `src/modules/` corrisponde a un componente del diagramma componenti.

```
src/
├── config/                  # validazione env, logger, caricamento OpenAPI
├── database/
│   ├── connection/          # connessione Mongoose con auto-recovery
│   └── models/              # schemi Mongoose (componente Database del D2)
├── middleware/              # error handler, request logger, OpenAPI validator, Swagger UI
├── modules/                 # componenti applicativi del D2
│   ├── auth/                # AuthService - interfaccia IAuth
│   ├── quests/              # QuestService - IPlayerProfile, IQuestCompletion,
│   │                          IQuestAdmin, IOperatorOps, IQrValidation
│   ├── business/            # BusinessService - IBusinessSelfMgt, IBusinessAdmin
│   ├── social/              # SocialService - ISocial
│   └── analytics/           # AnalyticsService - IAnalytics
├── utils/                   # error classes condivise
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

# 4. Avvia il server in modalità sviluppo
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

| Variabile        | Obbligatoria | Default       | Descrizione                                        |
| ---------------- | ------------ | ------------- | -------------------------------------------------- |
| `NODE_ENV`       | no           | `development` | `development`, `production`, `test`                |
| `PORT`           | no           | `3000`        | Porta del server HTTP                              |
| `LOG_LEVEL`      | no           | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `MONGODB_URI`    | sì           | —             | Connection string MongoDB completa                 |
| `JWT_SECRET`     | no (per ora) | —             | Chiave segreta per la firma dei JWT                |
| `JWT_EXPIRES_IN` | no           | `7d`          | Durata di validità del JWT                         |

Vedi `.env.example` per i valori di esempio.

## Script disponibili

| Comando                | Descrizione                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Avvia il server in modalità sviluppo con auto-reload           |
| `npm run build`        | Compila TypeScript in `dist/`                                  |
| `npm start`            | Avvia il server in produzione (richiede `npm run build` prima) |
| `npm run typecheck`    | Verifica i tipi TypeScript senza compilare                     |
| `npm run lint`         | Esegue ESLint su tutti i file `.ts`                            |
| `npm run lint:fix`     | ESLint con auto-fix                                            |
| `npm run format`       | Formatta tutto il codice con Prettier                          |
| `npm run format:check` | Verifica la formattazione senza modificare                     |

## Documentazione OpenAPI

La specifica OpenAPI dell'API REST si trova in `docs/openapi.yaml`. È organizzata per **interfacce dei componenti** del Deliverable D2.

Quando il server è in esecuzione, sono disponibili:

- **Swagger UI** navigabile: `http://localhost:3000/api/v1/docs`
- **Spec OpenAPI in JSON**: `http://localhost:3000/api/v1/docs/openapi.json`

Le richieste HTTP verso path documentati nello schema vengono validate automaticamente: parametri di query, path parameters, body e header di autenticazione. Eventuali violazioni producono response 400 con dettagli del campo non valido.

## Connessione MongoDB

Il backend implementa **auto-recovery** della connessione al database. Comportamento atteso nei tre scenari:

1. **MongoDB attivo all'avvio**: connessione immediata, server pronto.
2. **MongoDB cade durante l'esecuzione**: il backend rileva la disconnessione, logga un warning, ritenta automaticamente fino al ripristino.
3. **MongoDB spento all'avvio**: il backend non termina, ritenta ogni 5 secondi finché MongoDB non torna disponibile.

L'endpoint `/health` riflette lo stato del database e ritorna `503 Service Unavailable` quando il database non è raggiungibile.

## Struttura del repository del progetto

Trentino Quest è organizzato come polyrepo con quattro repository applicativi più uno di documentazione:

- **trentino-quest-docs** — Deliverable D1, D2, ADR architetturali
- **trentino-quest-backend** — questo repository
- **trentino-quest-shared-types** — DTO TypeScript condivisi tra backend e frontend
- **trentino-quest-mobile** — app mobile Ionic + Angular + Capacitor
- **trentino-quest-backoffice** — pannello amministrativo Angular (admin + operator)

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
