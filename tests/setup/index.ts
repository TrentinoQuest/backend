import { beforeAll, afterEach, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

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
