import { Redis } from '@upstash/redis';
import { UserSettings, TaskPlacement } from '@/types';
import { DEFAULT_SETTINGS, KV_KEYS, PLACEMENT_TTL_SECONDS } from '../constants';

function _parseRedisUrl(redisUrl: string): { url: string; token: string } {
  const urlPattern = /redis:\/\/[^:]+:([^@]+)@(.+)/;
  const match = redisUrl.match(urlPattern);

  if (!match) {
    throw new Error('Invalid REDIS_URL format. Expected: redis://default:TOKEN@ENDPOINT');
  }

  const [, token, endpoint] = match;
  return {
    url: `https://${endpoint}`,
    token,
  };
}

function _createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  const { url, token } = _parseRedisUrl(redisUrl);
  return new Redis({ url, token });
}

const redis = _createRedisClient();

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const key = KV_KEYS.settings(userId);
  const settings = await redis.get<UserSettings>(key);
  return settings || DEFAULT_SETTINGS;
}

export async function setUserSettings(
  userId: string,
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const key = KV_KEYS.settings(userId);
  const currentSettings = await getUserSettings(userId);
  const newSettings = { ...currentSettings, ...settings };
  await redis.set(key, newSettings);
  return newSettings;
}

export async function getPlacements(userId: string, date: string): Promise<TaskPlacement[]> {
  const key = KV_KEYS.placements(userId, date);
  const placements = await redis.get<TaskPlacement[]>(key);
  return placements || [];
}

export async function setPlacements(
  userId: string,
  date: string,
  placements: TaskPlacement[]
): Promise<void> {
  const key = KV_KEYS.placements(userId, date);
  await redis.set(key, placements, { ex: PLACEMENT_TTL_SECONDS });
}

export async function addPlacement(
  userId: string,
  date: string,
  placement: TaskPlacement
): Promise<TaskPlacement[]> {
  const placements = await getPlacements(userId, date);
  placements.push(placement);
  await setPlacements(userId, date, placements);
  return placements;
}

export async function updatePlacement(
  userId: string,
  date: string,
  placementId: string,
  updates: Partial<TaskPlacement>
): Promise<TaskPlacement[]> {
  const placements = await getPlacements(userId, date);
  const index = placements.findIndex((p) => p.id === placementId);

  if (index !== -1) {
    placements[index] = { ...placements[index], ...updates };
    await setPlacements(userId, date, placements);
  }

  return placements;
}

export async function removePlacement(
  userId: string,
  date: string,
  placementId: string
): Promise<TaskPlacement[]> {
  const placements = await getPlacements(userId, date);
  const filtered = placements.filter((p) => p.id !== placementId);
  await setPlacements(userId, date, filtered);
  return filtered;
}

export async function clearPlacements(userId: string, date: string): Promise<void> {
  const key = KV_KEYS.placements(userId, date);
  await redis.del(key);
}
