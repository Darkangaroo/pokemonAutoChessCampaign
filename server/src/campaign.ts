import path from 'path';
import fs from 'fs';
import type { Db } from 'mongodb';

export interface CampaignGym {
  id: string;
  name: string;
  requiredRank: number;
  badge: string;
  bot: string;
}

export interface EliteOpponent {
  id: string;
  name: string;
  bot: string;
}

export interface CampaignRewards {
  rankPoints: { rank: number; required: number }[];
  badgeEffects: Record<string, unknown>;
  unlocks: { [key: string]: number };
}

export interface CampaignResources {
  gyms: CampaignGym[];
  eliteFour: EliteOpponent[];
  randomPool: string[];
  rewards: CampaignRewards;
  tutorials: Record<string, unknown>;
}

export interface CampaignProfile {
  _id: string;
  rank: number;
  badges: string[];
  completedGyms: string[];
  completedElite: number;
  currency: number;
}

export const CAMPAIGN_COLLECTION = 'campaign_profiles';

export function loadCampaignResources(resourcesPath: string): CampaignResources {
  const base = path.join(resourcesPath, 'campaign');
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'));
  return {
    gyms: read('gyms.json'),
    eliteFour: read('elite_four.json'),
    randomPool: read('random_pool.json'),
    rewards: read('rewards.json'),
    tutorials: read('tutorials.json')
  };
}

export async function getOrCreateCampaignProfile(db: Db): Promise<CampaignProfile> {
  const col = db.collection<CampaignProfile>(CAMPAIGN_COLLECTION);
  let profile = await col.findOne({ _id: 'local' });
  if (!profile) {
    profile = {
      _id: 'local',
      rank: 0,
      badges: [],
      completedGyms: [],
      completedElite: 0,
      currency: 0
    };
    await col.insertOne(profile);
  }
  return profile;
}

export async function saveCampaignProfile(db: Db, profile: CampaignProfile): Promise<void> {
  const col = db.collection<CampaignProfile>(CAMPAIGN_COLLECTION);
  await col.updateOne({ _id: profile._id }, { $set: profile }, { upsert: true });
}
