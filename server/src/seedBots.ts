// server/src/seedBots.ts
import type { Db } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

export async function seedBotsIfEmpty(db: Db) {
  const col = db.collection('botv2');
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;

  // In prod (packaged), process.resourcesPath may not exist in the child process,
  // so also try RESOURCES_PATH env (we'll pass it from Electron) and a __dirname guess.
  const resourcesGuess = path.resolve(__dirname, '..', '..'); // server/dist -> resources/
  const resourcesPath =
    (process as any).resourcesPath ||
    process.env.RESOURCES_PATH ||
    resourcesGuess;

  const prodPath = path.join(resourcesPath, 'db-commands', 'botv2.json');
  const devPath  = path.join(process.cwd(), 'db-commands', 'botv2.json');
  const filePath = fs.existsSync(prodPath) ? prodPath : devPath;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const docs = JSON.parse(raw);
  if (Array.isArray(docs) && docs.length) {
    await col.insertMany(docs);
    console.log(`Seeded botv2 with ${docs.length} docs`);
  } else {
    console.warn('botv2.json is empty or invalid');
  }
}
