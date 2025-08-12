// server/src/index.ts
import { MongoClient } from 'mongodb';
import { seedBotsIfEmpty } from './seedBots';

export const PORT = Number(process.env.PORT || 9000);
export const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27028/dev'; // <- 27028 to match Electron
export const OFFLINE_MODE = process.env.OFFLINE_MODE === '1';
export const AUTO_BOTS = Number(process.env.AUTO_BOTS || 1);

(async () => {
  const client = await MongoClient.connect(MONGO_URI, {});
  const dbName = new URL(MONGO_URI).pathname.slice(1) || 'dev';
  const db = client.db(dbName);

  await seedBotsIfEmpty(db);

  // TODO: start Express/Colyseus here, listening on PORT
  // e.g., app.listen(PORT)
})();

