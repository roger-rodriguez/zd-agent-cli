import fs from 'fs';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import getPort, { portNumbers } from 'get-port';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeHttpUrl(cdpUrl: string): string {
  if (cdpUrl.startsWith('http://') || cdpUrl.startsWith('https://')) {
    return cdpUrl;
  }
  return `http://${cdpUrl}`;
}

export function parsePort(cdpUrl: string): number {
  const normalized = normalizeHttpUrl(cdpUrl);
  const url = new URL(normalized);
  const port = Number(url.port || '9222');
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid CDP URL: ${cdpUrl}`);
  }
  return port;
}

export function buildCdpUrlWithPort(cdpUrl: string, port: number): string {
  const normalized = normalizeHttpUrl(cdpUrl);
  const url = new URL(normalized);
  url.port = String(port);
  return `${url.protocol}//${url.hostname}:${port}`;
}

export async function getWsEndpoint(cdpUrl: string): Promise<string> {
  const base = normalizeHttpUrl(cdpUrl);
  const versionUrl = new URL('/json/version', base).toString();
  const response = await fetch(versionUrl);
  if (!response.ok) {
    throw new Error(`CDP endpoint returned ${response.status} at ${versionUrl}`);
  }
  const json = await response.json();
  if (!json.webSocketDebuggerUrl) {
    throw new Error(`No webSocketDebuggerUrl at ${versionUrl}`);
  }
  return json.webSocketDebuggerUrl;
}

export async function isCdpReachable(cdpUrl: string): Promise<boolean> {
  try {
    await getWsEndpoint(cdpUrl);
    return true;
  } catch (_) {
    return false;
  }
}

async function waitForCdp(cdpUrl: string, launchTimeoutMs: number, pollMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < launchTimeoutMs) {
    if (await isCdpReachable(cdpUrl)) {
      return true;
    }
    await sleep(pollMs);
  }
  return false;
}

export function launchChromeForCdp(profileDir: string, port: number): void {
  fs.mkdirSync(profileDir, { recursive: true });
  const chromeArgs = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen'
  ];
  const child = spawn(
    'open',
    ['-na', 'Google Chrome', '--args', ...chromeArgs],
    { stdio: 'ignore', detached: true }
  );
  child.unref();
}

function getListenerPid(port: number): string {
  try {
    const raw = execFileSync('lsof', ['-n', '-P', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim();
    const first = raw.split('\n').map((x: string) => x.trim()).find(Boolean);
    return first || '';
  } catch (_) {
    return '';
  }
}

function getProcessCommand(pid: string): string {
  if (!pid) return '';
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

function extractUserDataDirArg(commandText = ''): string {
  const text = String(commandText || '');
  if (!text) return '';

  const m = text.match(/--user-data-dir=(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  if (!m) return '';
  return m[1] || m[2] || m[3] || '';
}

function normalizePath(p: string): string {
  const raw = String(p || '').trim();
  if (!raw) return '';
  try {
    return fs.realpathSync(raw);
  } catch (_) {
    return path.resolve(raw);
  }
}

export function checkCdpOwnership({ cdpUrl, expectedProfileDir }: { cdpUrl: string; expectedProfileDir: string }) {
  const port = parsePort(cdpUrl);
  const pid = getListenerPid(port);
  const command = getProcessCommand(pid);
  const actualRaw = extractUserDataDirArg(command);
  const expected = normalizePath(expectedProfileDir);
  const actual = normalizePath(actualRaw);
  const matches = Boolean(expected && actual && expected === actual);

  return {
    port,
    pid: pid || null,
    actualProfileDir: actualRaw || null,
    expectedProfileDir: expectedProfileDir || null,
    matches,
    command: command || null
  };
}

async function findOwnedReachableCdp({
  cdpUrl,
  expectedProfileDir,
  portSpan
}: {
  cdpUrl: string;
  expectedProfileDir: string;
  portSpan: number;
}): Promise<{ cdpUrl: string; ownership: any } | null> {
  const startPort = parsePort(cdpUrl);
  const endPort = startPort + Math.max(0, Number(portSpan) || 0);
  for (let port = startPort; port <= endPort; port += 1) {
    const candidateUrl = buildCdpUrlWithPort(cdpUrl, port);
    if (!(await isCdpReachable(candidateUrl))) {
      continue;
    }
    const ownership = checkCdpOwnership({
      cdpUrl: candidateUrl,
      expectedProfileDir
    });
    if (ownership.matches) {
      return {
        cdpUrl: candidateUrl,
        ownership
      };
    }
  }
  return null;
}

async function findFreePortInRange(cdpUrl: string, portSpan: number): Promise<number> {
  const startPort = parsePort(cdpUrl);
  const endPort = startPort + Math.max(0, Number(portSpan) || 0);
  return getPort({ port: portNumbers(startPort, endPort) });
}

export async function ensureCdp({
  cdpUrl,
  profileDir,
  noLaunch = false,
  launchTimeoutMs = 20000,
  pollMs = 500,
  allowSharedCdp = false,
  autoPort = true,
  cdpPortSpan = 10
}: {
  cdpUrl: string;
  profileDir: string;
  noLaunch?: boolean;
  launchTimeoutMs?: number;
  pollMs?: number;
  allowSharedCdp?: boolean;
  autoPort?: boolean;
  cdpPortSpan?: number;
}): Promise<{ launchedChrome: boolean; cdpUrl: string; wsEndpoint: string }> {
  const span = Math.max(0, Number(cdpPortSpan) || 0);

  if (await isCdpReachable(cdpUrl)) {
    if (!allowSharedCdp) {
      const ownership = checkCdpOwnership({ cdpUrl, expectedProfileDir: profileDir });
      if (!ownership.matches) {
        if (autoPort) {
          const ownedExisting = await findOwnedReachableCdp({
            cdpUrl,
            expectedProfileDir: profileDir,
            portSpan: span
          });
          if (ownedExisting) {
            return {
              launchedChrome: false,
              cdpUrl: ownedExisting.cdpUrl,
              wsEndpoint: await getWsEndpoint(ownedExisting.cdpUrl)
            };
          }

          if (!noLaunch) {
            const freePort = await findFreePortInRange(cdpUrl, span);
            const launchUrl = buildCdpUrlWithPort(cdpUrl, freePort);
            launchChromeForCdp(profileDir, freePort);
            const up = await waitForCdp(launchUrl, launchTimeoutMs, pollMs);
            if (up) {
              return {
                launchedChrome: true,
                cdpUrl: launchUrl,
                wsEndpoint: await getWsEndpoint(launchUrl)
              };
            }
            throw new Error(`CDP endpoint did not come up at ${launchUrl}`);
          }
        }

        const actual = ownership.actualProfileDir || 'unknown';
        const pid = ownership.pid || 'unknown';
        throw new Error(
          `CDP endpoint ${cdpUrl} is already in use by Chrome pid=${pid} with user-data-dir=${actual}. Expected ${profileDir}. ` +
            'Stop that Chrome instance, use a different --cdp-url, pass --allow-shared-cdp, or keep auto port fallback enabled.'
        );
      }
    }
    return { launchedChrome: false, cdpUrl, wsEndpoint: await getWsEndpoint(cdpUrl) };
  }

  if (noLaunch) {
    if (autoPort) {
      const ownedExisting = await findOwnedReachableCdp({
        cdpUrl,
        expectedProfileDir: profileDir,
        portSpan: span
      });
      if (ownedExisting) {
        return {
          launchedChrome: false,
          cdpUrl: ownedExisting.cdpUrl,
          wsEndpoint: await getWsEndpoint(ownedExisting.cdpUrl)
        };
      }
    }
    throw new Error(`CDP endpoint is not reachable at ${cdpUrl} and --no-launch is set.`);
  }

  const launchPort = autoPort ? await findFreePortInRange(cdpUrl, span) : parsePort(cdpUrl);
  const launchUrl = buildCdpUrlWithPort(cdpUrl, launchPort);
  launchChromeForCdp(profileDir, launchPort);

  const up = await waitForCdp(launchUrl, launchTimeoutMs, pollMs);
  if (up) {
    return { launchedChrome: true, cdpUrl: launchUrl, wsEndpoint: await getWsEndpoint(launchUrl) };
  }

  throw new Error(`CDP endpoint did not come up at ${launchUrl}`);
}

export async function prepareInteractionContext(page: any, uiWaitMs = 1000, opts: { x?: number; y?: number } = {}): Promise<void> {
  const x = Number.isFinite(opts.x) ? opts.x : 40;
  const y = Number.isFinite(opts.y) ? opts.y : 40;

  await page
    .evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') {
        active.blur();
      }
    })
    .catch(() => undefined);

  await page.click('body', { position: { x, y } }).catch(() => undefined);
  await sleep(Math.max(120, Math.floor(uiWaitMs / 4)));
}

export {};
