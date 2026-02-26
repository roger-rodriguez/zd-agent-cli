import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerQueueRead(queue: Command, program: Command, core: CoreFacade): void {
  queue
    .command('read [name]')
    .description('Read a Zendesk team queue/view by name or alias (uses configured default queue when omitted)')
    .option('--count <n>', 'Max number of tickets to return (omit for full queue sync)')
    .action(async (name: string | undefined, options: { count?: string }) => {
      const globalOpts = core.resolveGlobalOpts(program);
      const queueSelection = core.resolveQueueInput(name, {
        defaultQueue: globalOpts.defaultQueue,
        queues: globalOpts.queueAliases
      });
      const queueName = queueSelection.queueName;
      const queuePath = queueSelection.queuePath;
      if (!queueName && !queuePath) {
        throw new Error(
          'Queue name is required. Pass `queue read "<queue>"`, set `defaultQueue` in zendesk.config.json, or set ZENDESK_DEFAULT_QUEUE.'
        );
      }
      const hasExplicitCount = options.count !== undefined && options.count !== null;
      const count = hasExplicitCount ? Math.max(1, Number(options.count) || 20) : Number.MAX_SAFE_INTEGER;

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts: runOpts, cdp }: BrowserContextArgs) => {
        const matchedQueue = await core.openQueueByName(page, queueName, runOpts.uiWaitMs, {
          queuePath
        });
        const queueData = await core.readQueueTickets(page, { count, fetchAll: !hasExplicitCount });

        return {
          ok: true,
          command: 'read-queue',
          launchedChrome: cdp.launchedChrome,
          cdpUrl: cdp.cdpUrl || runOpts.cdpUrl,
          requestedQueueName: queueName,
          requestedQueueDisplayName: queueSelection.queueDisplayName || null,
          requestedQueuePath: queuePath || null,
          requestedQueueAlias: queueSelection.alias || null,
          requestedQueueTeam: queueSelection.team || null,
          matchedQueue,
          ...queueData,
          queueName: queueData.queueName || matchedQueue.name || queueName
        };
      });

      core.emitResult(program, result);
    });
}
