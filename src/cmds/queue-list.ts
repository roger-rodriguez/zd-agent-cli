import type { Command } from 'commander';
import type { CoreFacade } from '../core/facade';

export function registerQueueList(queue: Command, program: Command, core: CoreFacade): void {
  queue
    .command('list')
    .description('List configured queue aliases from zendesk config')
    .option('--team <name>', 'Filter queues by team')
    .action(async (options: { team?: string }) => {
      const globalOpts = core.resolveGlobalOpts(program);
      const aliases = globalOpts.queueAliases || {};
      const teamFilter = String(options.team || '').trim().toLowerCase();

      const rows = Object.entries(aliases)
        .map(([alias, meta]: [string, any]) => ({
          alias,
          path: meta.path || '',
          team: meta.team || null,
          isDefault: alias === globalOpts.defaultQueue
        }))
        .filter((row) => !teamFilter || String(row.team || '').toLowerCase() === teamFilter)
        .sort((a, b) => a.alias.localeCompare(b.alias));

      const result = {
        ok: true,
        command: 'list-queues',
        domain: globalOpts.domain || null,
        defaultQueue: globalOpts.defaultQueue || null,
        count: rows.length,
        queues: rows
      };

      core.emitResult(program, result);
    });
}
