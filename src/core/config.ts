import fs from 'fs';
import path from 'path';
import { clean } from './util';

const CONFIG_BASENAMES = ['zendesk.config.json', 'zendesk.json'];

function asObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function truthyString(value: any): boolean {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function resolveUp(startDir: string, fileName: string): string {
  let dir = path.resolve(startDir || process.cwd());
  while (true) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return '';
    }
    dir = parent;
  }
}

function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir || process.cwd());
  while (true) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve(startDir || process.cwd());
    }
    dir = parent;
  }
}

function resolveConfigPath(explicitPath: string, cwd: string): string {
  if (explicitPath) {
    return path.resolve(cwd, explicitPath);
  }

  for (const basename of CONFIG_BASENAMES) {
    const found = resolveUp(cwd, basename);
    if (found) {
      return found;
    }
  }

  // Fallback for npm-link/dev workflows: allow config in the CLI package root.
  const packageRoot = path.resolve(__dirname, '..', '..');
  for (const basename of CONFIG_BASENAMES) {
    const candidate = path.join(packageRoot, basename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function readConfigFile(filePath: string): Record<string, any> {
  if (!filePath) {
    return {};
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return asObject(parsed);
}

export function toAbsPath(value: any, baseDir: string): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return path.isAbsolute(raw) ? raw : path.resolve(baseDir, raw);
}

export function normalizeAgentPath(rawPath: any, fallback = ''): string {
  const base = String(rawPath || '').trim();
  const selected = base || String(fallback || '').trim();
  if (!selected) {
    return '';
  }
  if (selected.startsWith('/')) {
    return selected;
  }
  return `/${selected}`;
}

function normalizeQueues(rawQueues: any): Record<string, any> {
  const queues = asObject(rawQueues);
  const out: Record<string, any> = {};

  for (const [alias, value] of Object.entries(queues)) {
    const row = asObject(value);
    const name = clean(row.name || row.displayName || '');
    const displayName = clean(row.displayName || row.name || '');
    const queuePath = normalizeAgentPath(row.path || '');
    if (!queuePath) {
      continue;
    }
    out[alias] = {
      name,
      displayName,
      path: queuePath,
      team: clean(row.team || '')
    };
  }

  return out;
}

export function validateConfigContract(config: Record<string, any> = {}, queueConfig: Record<string, any> = {}): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const cfg = asObject(config);
  const queuesRaw = asObject(cfg.queues);
  const aliases = Object.keys(queuesRaw);

  if (!clean(cfg.domain || '')) {
    issues.push('Missing required field: domain');
  }
  const startPath = normalizeAgentPath(cfg.startPath || '');
  if (!startPath) {
    issues.push('Missing required field: startPath');
  } else if (!/^\/agent\//i.test(startPath)) {
    issues.push(`Invalid startPath "${startPath}". startPath must begin with "/agent/".`);
  }
  if (!clean(cfg.defaultQueue || '')) {
    issues.push('Missing required field: defaultQueue');
  }
  if (!aliases.length) {
    issues.push('Missing required field: queues (object with at least one alias)');
  }
  for (const [alias, row] of Object.entries(queuesRaw)) {
    const queuePath = normalizeAgentPath(asObject(row).path || '');
    if (!queuePath) {
      issues.push(`queues.${alias}.path is required`);
      continue;
    }
    if (!/^\/agent\//i.test(queuePath)) {
      issues.push(`queues.${alias}.path must begin with "/agent/" (got "${queuePath}")`);
    }
  }
  const defaultQueue = clean(queueConfig.defaultQueue || cfg.defaultQueue || '');
  if (defaultQueue && !queueConfig.queues[defaultQueue]) {
    issues.push(`defaultQueue "${defaultQueue}" is not defined in queues`);
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function resolveQueueInput(rawInput: any, queueConfig: Record<string, any>): Record<string, any> {
  const requestedRaw = clean(rawInput || '');
  const defaultQueue = clean(queueConfig.defaultQueue || '');
  const requested = requestedRaw || defaultQueue;
  const aliases = asObject(queueConfig.queues);

  if (!requested) {
    return {
      queueName: '',
      queueDisplayName: '',
      queuePath: '',
      alias: '',
      team: ''
    };
  }

  if (aliases[requested]) {
    return {
      queueName: aliases[requested].name || aliases[requested].displayName || requested,
      queueDisplayName: aliases[requested].displayName || aliases[requested].name || '',
      queuePath: aliases[requested].path || '',
      alias: requested,
      team: aliases[requested].team || ''
    };
  }

  const requestedLow = requested.toLowerCase();
  for (const [alias, row] of Object.entries(aliases)) {
    if (alias.toLowerCase() === requestedLow) {
      return {
        queueName: row.name || row.displayName || alias,
        queueDisplayName: row.displayName || row.name || '',
        queuePath: row.path || '',
        alias,
        team: row.team || ''
      };
    }
  }

  for (const [alias, row] of Object.entries(aliases)) {
    const rowName = String(row.name || '').toLowerCase();
    const rowDisplayName = String(row.displayName || '').toLowerCase();
    if (rowName === requestedLow || rowDisplayName === requestedLow) {
      return {
        queueName: row.name || row.displayName || alias,
        queueDisplayName: row.displayName || row.name || '',
        queuePath: row.path || '',
        alias,
        team: row.team || ''
      };
    }
  }

  return {
    queueName: requested,
    queueDisplayName: requested,
    queuePath: '',
    alias: '',
    team: ''
  };
}

export function loadResolvedConfig(options: Record<string, any> = {}): Record<string, any> {
  const cwd = path.resolve(options.cwd || process.cwd());
  const explicitPath = options.configPath || process.env.ZENDESK_CONFIG || '';
  const configPath = resolveConfigPath(explicitPath, cwd);
  const configDir = configPath ? path.dirname(configPath) : cwd;
  const repoRoot = configPath ? findRepoRoot(configDir) : findRepoRoot(cwd);
  const config = readConfigFile(configPath);

  const queueConfig = {
    defaultQueue: clean(config.defaultQueue || ''),
    queues: normalizeQueues(config.queues)
  };

  return {
    repoRoot,
    configPath,
    configDir,
    config,
    queueConfig
  };
}

export function pickBool({
  cliValue,
  cliSource,
  envValue,
  configValue,
  fallback
}: {
  cliValue: any;
  cliSource: string;
  envValue: any;
  configValue: any;
  fallback: any;
}): boolean {
  if (cliSource === 'cli') {
    return Boolean(cliValue);
  }
  if (envValue !== undefined && envValue !== null && String(envValue).trim()) {
    return truthyString(envValue);
  }
  if (configValue !== undefined && configValue !== null && String(configValue).trim()) {
    return truthyString(configValue);
  }
  return Boolean(fallback);
}

export function pickString({
  cliValue,
  cliSource,
  envValue,
  configValue,
  fallback
}: {
  cliValue: any;
  cliSource: string;
  envValue: any;
  configValue: any;
  fallback: any;
}): string {
  if (cliSource === 'cli') {
    return String(cliValue || '').trim();
  }
  if (envValue !== undefined && envValue !== null && String(envValue).trim()) {
    return String(envValue).trim();
  }
  if (configValue !== undefined && configValue !== null && String(configValue).trim()) {
    return String(configValue).trim();
  }
  return String(fallback || '').trim();
}

export function pickNumber({
  cliValue,
  cliSource,
  envValue,
  configValue,
  fallback
}: {
  cliValue: any;
  cliSource: string;
  envValue: any;
  configValue: any;
  fallback: any;
}): number {
  const resolve = (raw: any): number => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  if (cliSource === 'cli') {
    const n = resolve(cliValue);
    if (Number.isFinite(n)) return n;
  }
  if (envValue !== undefined && envValue !== null && String(envValue).trim()) {
    const n = resolve(envValue);
    if (Number.isFinite(n)) return n;
  }
  if (configValue !== undefined && configValue !== null && String(configValue).trim()) {
    const n = resolve(configValue);
    if (Number.isFinite(n)) return n;
  }
  return Number(fallback);
}

export function safeOptionSource(program: any, name: string): string {
  if (!program || typeof program.getOptionValueSource !== 'function') {
    return '';
  }
  const src = program.getOptionValueSource(name);
  return typeof src === 'string' ? src : '';
}
