import fs from 'fs';
import path from 'path';
import { writeJson, readJson, slugify, parseTicketIdFromUrl } from './util';

function nowParts(now = new Date()): { yyyy: string; mm: string; dd: string; hh: string; mi: string; ss: string } {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return { yyyy, mm, dd, hh, mi, ss };
}

export function persistOutput(result: any, globalOpts: any): any {
  if (!globalOpts.store || !result || !result.command) {
    return null;
  }

  const now = new Date();
  const { yyyy, mm, dd, hh, mi, ss } = nowParts(now);
  const root = globalOpts.storeRoot;

  if (result.command === 'read-ticket') {
    const ticketId = result.ticketId || parseTicketIdFromUrl(result.pageUrl || '') || 'unknown';
    const ticketRoot = path.join(root, 'tickets', String(ticketId));
    const snapshotPath = path.join(ticketRoot, 'snapshots', yyyy, mm, dd, `${hh}${mi}${ss}.json`);
    const latestPath = path.join(ticketRoot, 'latest.json');

    const record = {
      capturedAt: now.toISOString(),
      ...result
    };

    writeJson(snapshotPath, record);
    writeJson(latestPath, record);

    return {
      entity: 'ticket',
      ticketId: String(ticketId),
      ticketRoot,
      latestPath,
      snapshotPath
    };
  }

  if (result.command === 'read-queue') {
    const slug = slugify(result.queueName || 'queue');
    const queueRoot = path.join(root, 'queues', slug);
    const snapshotPath = path.join(queueRoot, 'snapshots', yyyy, mm, dd, `${hh}${mi}${ss}.json`);
    const latestPath = path.join(queueRoot, 'latest.json');

    const record = {
      capturedAt: now.toISOString(),
      ...result
    };

    writeJson(snapshotPath, record);
    writeJson(latestPath, record);

    return {
      entity: 'queue',
      queue: slug,
      queueRoot,
      latestPath,
      snapshotPath
    };
  }

  if (result.command === 'search-tickets') {
    const slug = slugify(result.query || 'query');
    const searchRoot = path.join(root, 'searches', slug);
    const snapshotPath = path.join(searchRoot, yyyy, mm, dd, `${hh}${mi}${ss}.json`);
    const latestPath = path.join(searchRoot, 'latest.json');

    const record = {
      capturedAt: now.toISOString(),
      ...result
    };

    writeJson(snapshotPath, record);
    writeJson(latestPath, record);

    return {
      entity: 'search',
      query: slug,
      searchRoot,
      latestPath,
      snapshotPath
    };
  }

  return null;
}

export function readCachedTicket({
  storeRoot,
  ticketId,
  ttlSeconds = 120
}: {
  storeRoot: string;
  ticketId: string;
  ttlSeconds?: number;
}): any {
  const id = String(ticketId || '').replace(/\D+/g, '');
  if (!storeRoot || !id) {
    return null;
  }

  const latestPath = path.join(storeRoot, 'tickets', id, 'latest.json');
  if (!fs.existsSync(latestPath)) {
    return null;
  }

  const payload = readJson(latestPath, null);
  if (!payload || payload.command !== 'read-ticket') {
    return null;
  }

  const capturedAtMs = Date.parse(payload.capturedAt || '');
  if (!Number.isFinite(capturedAtMs)) {
    return null;
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - capturedAtMs) / 1000));
  const ttl = Math.max(0, Number(ttlSeconds) || 0);
  if (ttl > 0 && ageSeconds > ttl) {
    return null;
  }

  return {
    ...payload,
    cacheHit: true,
    cacheAgeSeconds: ageSeconds,
    cachePath: latestPath
  };
}
