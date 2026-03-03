import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerQueueRead(queue: Command, program: Command, core: CoreFacade): void {
  queue
    .command('read [name]')
    .description('Read a Zendesk team queue/view by name or alias (uses configured default queue when omitted)')
    .option('--count <n>', 'Max number of tickets to return (omit for full queue sync)')
    .option('--include-comments', 'Include ticket comments for each returned queue ticket (API-only)')
    .option('--comments <n>', 'Max comments per ticket when --include-comments is enabled', '25')
    .option('--concurrency <n>', 'Concurrent API requests for comment expansion (1-10)', '4')
    .action(async (name: string | undefined, options: { count?: string; includeComments?: boolean; comments?: string; concurrency?: string }) => {
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
      const includeComments = options.includeComments === true;
      const comments = Math.max(1, Number(options.comments) || 25);
      const concurrency = Math.max(1, Math.min(10, Math.floor(Number(options.concurrency) || 4)));

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts: runOpts, cdp }: BrowserContextArgs) => {
        const matchedQueue = await core.openQueueByName(page, queueName, runOpts.uiWaitMs, {
          queuePath
        });
        const queueData: any = await core.readQueueTickets(page, { count, fetchAll: !hasExplicitCount });

        if (includeComments) {
          const ticketIds = (queueData.tickets || [])
            .map((row: any) => String(row && row.ticketId ? row.ticketId : '').replace(/\D+/g, ''))
            .filter(Boolean);
          const detailedRows = await core.readTicketsByIds(page, ticketIds, { count: comments, concurrency });
          const byId = new Map<string, any>();
          for (const row of detailedRows) {
            if (!row || !row.ticketId) {
              continue;
            }
            byId.set(String(row.ticketId), row);
          }

          queueData.tickets = (queueData.tickets || []).map((row: any) => {
            const detailed = byId.get(String(row && row.ticketId ? row.ticketId : ''));
            return {
              ...row,
              priority: detailed && detailed.priority ? detailed.priority : null,
              tags: detailed && Array.isArray(detailed.tags) ? detailed.tags : [],
              comments: detailed && Array.isArray(detailed.comments) ? detailed.comments : []
            };
          });
        }

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
          includeComments,
          commentsPerTicket: includeComments ? comments : 0,
          matchedQueue,
          ...queueData,
          queueName: queueData.queueName || matchedQueue.name || queueName
        };
      });

      core.emitResult(program, result);
    });
}
