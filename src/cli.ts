#!/usr/bin/env node

import { Command } from 'commander';
import core from './core/index';
import { loadResolvedConfig } from './core/config';
import { registerTicketRead } from './cmds/ticket-read';
import { registerQueueList } from './cmds/queue-list';
import { registerQueueRead } from './cmds/queue-read';
import { registerSearchTickets } from './cmds/search-tickets';
import { registerAuthCheck } from './cmds/auth-check';
import { registerAuthLogin } from './cmds/auth-login';
import { registerDoctor } from './cmds/doctor';

function resolveConfigPathFromArgv(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config' && argv[i + 1]) {
      return argv[i + 1];
    }
    if (arg.startsWith('--config=')) {
      return arg.slice('--config='.length);
    }
  }
  return '';
}

function buildQueueHelpText(): string {
  try {
    const configPath = resolveConfigPathFromArgv(process.argv.slice(2));
    const loaded = loadResolvedConfig({
      cwd: process.cwd(),
      configPath
    });
    const queueCfg = loaded.queueConfig || { defaultQueue: '', queues: {} };
    const aliases = Object.keys(queueCfg.queues || {}).sort();
    if (!aliases.length) {
      return '';
    }

    const defaultLine = queueCfg.defaultQueue ? `Default queue: ${queueCfg.defaultQueue}\n` : '';
    return `\nConfigured queue aliases:\n${defaultLine}${aliases.map((alias) => `- ${alias}`).join('\n')}\n`;
  } catch (_) {
    return '';
  }
}

const program = new Command();
program
  .name('zagent')
  .description('Zendesk automation CLI (CDP)')
  .option('--config <path>', 'Path to zendesk config JSON (defaults to zendesk.config.json or zendesk.json)')
  .option('--domain <host>', 'Zendesk host (example: acme.zendesk.com)')
  .option('--cdp-url <url>', 'CDP endpoint URL')
  .option('--profile-dir <path>', 'Chrome user-data-dir for auto-launch')
  .option('--start-path <path>', 'Zendesk agent path to open if none active (example: /agent/filters/12345)')
  .option('--ui-wait-ms <n>', 'Extra wait between UI actions')
  .option('--no-launch', 'Do not auto-launch Chrome when CDP is unavailable')
  .option('--allow-shared-cdp', 'Allow using an already-running CDP endpoint even if profile ownership cannot be verified')
  .option('--no-auto-port', 'Disable automatic CDP port fallback when preferred port is unavailable or owned by another profile')
  .option('--cdp-port-span <n>', 'Number of additional ports to scan for automatic CDP fallback')
  .option('--foreground', 'Allow bring-to-front behavior (default is background mode)')
  .option('--store-root <path>', 'Root folder for structured run state/output')
  .option('--no-store', 'Disable structured state/output persistence')
  .option('--no-cache', 'Disable local cache reads')
  .option('--cache-only', 'Read only from local cache and do not fetch from Zendesk')
  .option('--cache-ttl <seconds>', 'Cache freshness TTL in seconds for cache-enabled commands')
  .option('--json', 'Print JSON output')
  .option('--out <path>', 'Write JSON output to file');

const ticket = program.command('ticket').description('Ticket commands');
registerTicketRead(ticket, program, core);

const queue = program.command('queue').description('Queue/view commands');
registerQueueList(queue, program, core);
registerQueueRead(queue, program, core);
queue.addHelpText('after', buildQueueHelpText());

const search = program.command('search').description('Search commands');
registerSearchTickets(search, program, core);

const auth = program.command('auth').description('Auth/session commands');
registerAuthCheck(auth, program, core);
registerAuthLogin(auth, program, core);

registerDoctor(program, core);

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
