# Trentino Quest — Backend

Backend REST API per **Trentino Quest**, app gamificata per l'esplorazione del Trentino.

Progetto del corso di **Ingegneria del Software** (a.a. 2025-2026), Università degli Studi di Trento, Prof. Sandro Fiore.
**Gruppo 19**: Valerio Cancemi (242804), Federico Caposano (243138).

## Stack tecnologico

- **Runtime**: Node.js 22 LTS
- **Linguaggio**: TypeScript 5.5+
- **Framework**: Express 4
- **Database**: MongoDB (in arrivo)
- **Autenticazione**: JWT (in arrivo)
- **API Style**: REST (Fielding 2000)

## Avvio rapido

Requisiti: Node.js >= 22, npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Il server parte su `http://localhost:3000`. Verifica con:

```bash
curl http://localhost:3000/health
```

## Script disponibili

| Comando | Descrizione |
|---|---|
| `npm run dev` | Avvia il server in modalità sviluppo con auto-reload |
| `npm run build` | Compila TypeScript in `dist/` |
| `npm start` | Avvia il server in produzione (richiede `npm run build` prima) |
| `npm run typecheck` | Verifica tipi TypeScript senza compilare |
| `npm run lint` | Esegue ESLint su tutti i file `.ts` |
| `npm run lint:fix` | ESLint con auto-fix |
| `npm run format` | Formatta tutto con Prettier |
| `npm run format:check` | Verifica formattazione senza modificare |

## Architettura

Il backend implementa la **reference architecture** del corso (Web Service Node.js + Persistent layer MongoDB), esponendo un'API REST conforme ai principi di Fielding: addressability, uniform interface, statelessness, connectedness.

La struttura interna seguirà il pattern modulare per feature, dove ogni cartella in `src/modules/` corrisponde a un componente del diagramma componenti del Deliverable D2.

Documentazione architetturale completa nel repo [`trentino-quest-docs`](https://github.com/TrentinoQuest/trentino-quest-docs).

## Repo correlati

- [`trentino-quest-docs`](https://github.com/TrentinoQuest/trentino-quest-docs) — Deliverable D1, D2, ADR
- [`trentino-quest-shared-types`](https://github.com/TrentinoQuest/trentino-quest-shared-types) — DTO TypeScript condivisi
- [`trentino-quest-mobile`](https://github.com/TrentinoQuest/trentino-quest-mobile) — App mobile Ionic/Angular
- [`trentino-quest-backoffice`](https://github.com/TrentinoQuest/trentino-quest-backoffice) — Pannello amministrativo Angular
