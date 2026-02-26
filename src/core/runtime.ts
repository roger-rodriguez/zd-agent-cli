import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { ensureCdp, prepareInteractionContext } from './browser-cdp';
import {
  DEFAULT_CDP_URL,
  DEFAULT_DOMAIN,
  DEFAULT_PROFILE_DIR,
  DEFAULT_START_PATH,
  DEFAULT_UI_WAIT_MS,
  DEFAULT_STORE_ROOT
} from './constants';
import {
  toAbsPath,
  normalizeAgentPath,
  loadResolvedConfig,
  validateConfigContract,
  pickBool,
  pickString,
  pickNumber,
  safeOptionSource
} from './config';
import { persistOutput } from './storage';
import { getZendeskPage } from './automation';
import type { GlobalOpts } from './facade';

export function resolveGlobalOpts(program: any): GlobalOpts {
  const opts = program.opts();
  const env = process.env;
  const loadedConfig = loadResolvedConfig({
    cwd: process.cwd(),
    configPath: opts.config || ''
  });
  const cfg = loadedConfig.config || {};
  const queueCfg = loadedConfig.queueConfig || { defaultQueue: '', queues: {} };
  const configValidation = validateConfigContract(cfg, queueCfg);

  const cdpUrl = pickString({
    cliValue: opts.cdpUrl,
    cliSource: safeOptionSource(program, 'cdpUrl'),
    envValue: env.ZENDESK_CDP_URL,
    configValue: cfg.cdpUrl,
    fallback: DEFAULT_CDP_URL
  });
  let domain = pickString({
    cliValue: opts.domain,
    cliSource: safeOptionSource(program, 'domain'),
    envValue: env.ZENDESK_DOMAIN,
    configValue: cfg.domain,
    fallback: DEFAULT_DOMAIN
  }).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (domain.includes('/')) {
    domain = domain.split('/')[0];
  }
  const startPath = normalizeAgentPath(
    pickString({
      cliValue: opts.startPath,
      cliSource: safeOptionSource(program, 'startPath'),
      envValue: env.ZENDESK_START_PATH,
      configValue: cfg.startPath,
      fallback: DEFAULT_START_PATH
    }),
    DEFAULT_START_PATH
  );
  if (startPath && !/^\/agent\//i.test(startPath)) {
    throw new Error(`Invalid startPath "${startPath}". startPath must begin with "/agent/".`);
  }
  const startUrl = domain ? `https://${domain}${startPath}` : '';
  const uiWaitMs = pickNumber({
    cliValue: opts.uiWaitMs,
    cliSource: safeOptionSource(program, 'uiWaitMs'),
    envValue: env.ZENDESK_UI_WAIT_MS,
    configValue: cfg.uiWaitMs,
    fallback: DEFAULT_UI_WAIT_MS
  });
  const storeRootRaw = pickString({
    cliValue: opts.storeRoot,
    cliSource: safeOptionSource(program, 'storeRoot'),
    envValue: env.ZENDESK_STORE_ROOT,
    configValue: cfg.storeRoot,
    fallback: DEFAULT_STORE_ROOT
  });
  const profileDirRaw = pickString({
    cliValue: opts.profileDir,
    cliSource: safeOptionSource(program, 'profileDir'),
    envValue: env.ZENDESK_PROFILE_DIR,
    configValue: cfg.profileDir,
    fallback: DEFAULT_PROFILE_DIR
  });
  const defaultQueue = pickString({
    cliValue: '',
    cliSource: '',
    envValue: env.ZENDESK_DEFAULT_QUEUE,
    configValue: queueCfg.defaultQueue,
    fallback: ''
  });

  return {
    cdpUrl,
    domain,
    startPath,
    profileDir: toAbsPath(profileDirRaw, loadedConfig.repoRoot),
    startUrl,
    noLaunch: pickBool({
      cliValue: opts.noLaunch,
      cliSource: safeOptionSource(program, 'noLaunch'),
      envValue: env.ZENDESK_NO_LAUNCH,
      configValue: cfg.noLaunch,
      fallback: false
    }),
    allowSharedCdp: pickBool({
      cliValue: opts.allowSharedCdp,
      cliSource: safeOptionSource(program, 'allowSharedCdp'),
      envValue: env.ZENDESK_ALLOW_SHARED_CDP,
      configValue: cfg.allowSharedCdp,
      fallback: false
    }),
    autoPort: !pickBool({
      cliValue: opts.autoPort === false,
      cliSource: safeOptionSource(program, 'autoPort'),
      envValue: env.ZENDESK_NO_AUTO_PORT,
      configValue: cfg.noAutoPort,
      fallback: false
    }),
    cdpPortSpan: Math.max(
      0,
      Math.floor(
        pickNumber({
          cliValue: opts.cdpPortSpan,
          cliSource: safeOptionSource(program, 'cdpPortSpan'),
          envValue: env.ZENDESK_CDP_PORT_SPAN,
          configValue: cfg.cdpPortSpan,
          fallback: 10
        })
      )
    ),
    json: pickBool({
      cliValue: opts.json,
      cliSource: safeOptionSource(program, 'json'),
      envValue: env.ZENDESK_JSON,
      configValue: cfg.json,
      fallback: false
    }),
    out: opts.out || '',
    uiWaitMs,
    background: !pickBool({
      cliValue: opts.foreground,
      cliSource: safeOptionSource(program, 'foreground'),
      envValue: env.ZENDESK_FOREGROUND,
      configValue: cfg.foreground,
      fallback: false
    }),
    storeRoot: toAbsPath(storeRootRaw, loadedConfig.repoRoot),
    store: !pickBool({
      cliValue: opts.store === false,
      cliSource: safeOptionSource(program, 'store'),
      envValue: env.ZENDESK_NO_STORE,
      configValue: cfg.noStore,
      fallback: false
    }),
    cache: !pickBool({
      cliValue: opts.cache === false,
      cliSource: safeOptionSource(program, 'cache'),
      envValue: env.ZENDESK_NO_CACHE,
      configValue: cfg.noCache,
      fallback: false
    }),
    cacheOnly: pickBool({
      cliValue: opts.cacheOnly,
      cliSource: safeOptionSource(program, 'cacheOnly'),
      envValue: env.ZENDESK_CACHE_ONLY,
      configValue: cfg.cacheOnly,
      fallback: false
    }),
    cacheTtl: Math.max(
      0,
      Math.floor(
        pickNumber({
          cliValue: opts.cacheTtl,
          cliSource: safeOptionSource(program, 'cacheTtl'),
          envValue: env.ZENDESK_CACHE_TTL,
          configValue: cfg.cacheTtl,
          fallback: 120
        })
      )
    ),
    defaultQueue,
    queueAliases: queueCfg.queues,
    configPath: loadedConfig.configPath,
    repoRoot: loadedConfig.repoRoot,
    configValidation
  };
}

export function emitResult(program: any, result: any): void {
  const globalOpts = resolveGlobalOpts(program);
  const persisted = result && result.cacheHit ? null : persistOutput(result, globalOpts);
  const output = persisted ? { ...result, persisted } : result;

  if (globalOpts.out) {
    const outPath = path.resolve(globalOpts.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }

  if (globalOpts.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (output.command === 'read-ticket') {
    console.log(`Ticket: ${output.ticketId || 'unknown'}`);
    console.log(`Subject: ${output.subject || 'unknown'}`);
    console.log(`Status: ${output.status || 'unknown'}`);
    console.log(`Priority: ${output.priority || 'unknown'}`);
    console.log(`Assignee: ${output.assignee || 'unknown'}`);
    console.log(`Requester: ${output.requester || 'unknown'}`);
    console.log(`URL: ${output.pageUrl}`);
    if (output.cacheHit) {
      console.log(`Cache: hit (${output.cacheAgeSeconds}s old)`);
    }
    if (output.persisted) {
      console.log(`Stored: ${output.persisted.latestPath}`);
    }
    console.log('');
    for (let i = 0; i < output.comments.length; i += 1) {
      const row = output.comments[i];
      console.log(`${i + 1}. [${row.author || 'Unknown'} @ ${row.time || 'time-unknown'}] ${row.text}`);
    }
    return;
  }

  if (output.command === 'read-queue') {
    console.log(`Queue: ${output.queueName}`);
    console.log(`URL: ${output.pageUrl}`);
    console.log(`Tickets: ${output.resultCount}`);
    if (output.persisted) {
      console.log(`Stored: ${output.persisted.latestPath}`);
    }
    console.log('');
    for (let i = 0; i < output.tickets.length; i += 1) {
      const row = output.tickets[i];
      console.log(`${i + 1}. #${row.ticketId || '?'} ${row.subject || '(no subject)'} [${row.status || 'unknown'}]`);
    }
    return;
  }

  if (output.command === 'search-tickets') {
    console.log(`Query: ${output.query}`);
    console.log(`URL: ${output.pageUrl}`);
    console.log(`Hits: ${output.resultCount}`);
    if (output.persisted) {
      console.log(`Stored: ${output.persisted.latestPath}`);
    }
    console.log('');
    for (let i = 0; i < output.results.length; i += 1) {
      const row = output.results[i];
      console.log(`${i + 1}. #${row.ticketId || '?'} ${row.title || '(no title)'}`);
      if (row.snippet) {
        console.log(`   ${row.snippet}`);
      }
      if (row.url) {
        console.log(`   ${row.url}`);
      }
    }
    return;
  }

  if (output.command === 'list-queues') {
    console.log(`Domain: ${output.domain || 'unknown'}`);
    console.log(`Default queue: ${output.defaultQueue || 'none'}`);
    console.log(`Configured queues: ${output.count || 0}`);
    console.log('');
    for (let i = 0; i < output.queues.length; i += 1) {
      const row = output.queues[i];
      const marker = row.isDefault ? ' (default)' : '';
      const team = row.team ? ` [${row.team}]` : '';
      console.log(`${i + 1}. ${row.alias}${marker}${team}`);
      console.log(`   ${row.path || '(no path configured)'}`);
    }
    return;
  }

  if (output.command === 'auth-check') {
    console.log(`CDP: ${output.cdp.reachable ? 'reachable' : 'unreachable'}`);
    console.log(`Config: ${output.config.ok ? 'valid' : 'invalid'}`);
    console.log(`Auth: ${output.auth.authenticated ? 'authenticated' : 'not authenticated'}`);
    if (output.auth.user) {
      console.log(`User: ${output.auth.user.name || output.auth.user.email || output.auth.user.id}`);
    }
    if (output.persisted) {
      console.log(`Stored: ${output.persisted.latestPath}`);
    }
    if (!output.config.ok && Array.isArray(output.config.issues) && output.config.issues.length) {
      console.log('');
      for (const issue of output.config.issues) {
        console.log(`- ${issue}`);
      }
    }
    return;
  }

  if (output.command === 'auth-login') {
    console.log(output.authenticated ? 'Zendesk login confirmed.' : 'Zendesk login not confirmed.');
    console.log(`URL: ${output.pageUrl || output.startUrl || 'unknown'}`);
    if (output.user) {
      console.log(`User: ${output.user.name || output.user.email || output.user.id}`);
    }
    if (output.persisted) {
      console.log(`Stored: ${output.persisted.latestPath}`);
    }
    return;
  }

  if (output.command === 'doctor') {
    console.log(`Status: ${output.ok ? 'ok' : 'needs attention'}`);
    for (const check of output.checks || []) {
      console.log(`- ${check.name}: ${check.ok ? 'ok' : 'fail'}${check.detail ? ` (${check.detail})` : ''}`);
    }
    if (output.persisted) {
      console.log(`Stored: ${output.persisted.latestPath}`);
    }
  }
}

export async function withZendeskBrowser(program: any, handler: (args: { page: any; globalOpts: any; cdp: any }) => Promise<any>): Promise<any> {
  const globalOpts = resolveGlobalOpts(program);
  if (!globalOpts.domain) {
    throw new Error('Zendesk domain is required. Set `domain` in zendesk config, `ZENDESK_DOMAIN`, or pass `--domain`.');
  }
  const cdp = await ensureCdp({
    cdpUrl: globalOpts.cdpUrl,
    profileDir: globalOpts.profileDir,
    noLaunch: globalOpts.noLaunch,
    allowSharedCdp: globalOpts.allowSharedCdp,
    autoPort: globalOpts.autoPort,
    cdpPortSpan: globalOpts.cdpPortSpan
  });
  const browser = await chromium.connectOverCDP(cdp.wsEndpoint);

  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('No browser context available from CDP connection.');
    }

    const page = await getZendeskPage(context, globalOpts.startUrl, globalOpts.background);
    await prepareInteractionContext(page, globalOpts.uiWaitMs);
    return await handler({ page, globalOpts, cdp });
  } finally {
    await browser.close();
  }
}

export {};
