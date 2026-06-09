import { beforeAll, afterEach, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

// Silenzia i log applicativi durante i test: l'output di pino a livello
// info sommerge il report di vitest. Va impostato prima dell'import di
// env.ts (dotenv non sovrascrive variabili già presenti).
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'fatal';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // Imposta l'URI prima che qualsiasi modulo importi env.ts (che fa dotenv.config).
  // dotenv non sovrascrive variabili già impostate, quindi questo valore ha precedenza.
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(mongod.getUri());
});

afterEach(async () => {
  // Pulizia del DB tra un test e l'altro per garantire isolamento.
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
