import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';
import { clean } from '../core/util';

export function registerSearchTickets(search: Command, program: Command, core: CoreFacade): void {
  search
    .command('tickets [query]')
    .description('Search Zendesk tickets by phrase')
    .option('--query <text>', 'Search query text (alternative to positional argument)')
    .option('--count <n>', 'Max number of search hits to return', '20')
    .option('--queue <alias>', 'Limit results to tickets that are members of the queue/view alias')
    .action(async (queryArg: string | undefined, options: { query?: string; count?: string; queue?: string }) => {
      const globalOpts = core.resolveGlobalOpts(program);
      const query = clean(options.query || queryArg || '');
      if (!query) {
        throw new Error('Search query is required. Pass a positional query or --query "<text>".');
      }
      const count = Math.max(1, Number(options.count) || 20);
      const queueAlias = clean(options.queue || '');
      const queueSelection = queueAlias
        ? core.resolveQueueInput(queueAlias, {
            defaultQueue: globalOpts.defaultQueue,
            queues: globalOpts.queueAliases
          })
        : null;

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts, cdp }: BrowserContextArgs) => {
        let queueScope: any = null;
        let queueTicketIds: Set<string> | null = null;

        if (queueSelection) {
          const queueName = queueSelection.queueName;
          const queuePath = queueSelection.queuePath;
          if (!queueName && !queuePath) {
            throw new Error(`Queue alias "${queueAlias}" could not be resolved.`);
          }
          const matchedQueue = await core.openQueueByName(page, queueName, globalOpts.uiWaitMs, { queuePath });
          const queueData = await core.readQueueTickets(page, { count: Number.MAX_SAFE_INTEGER, fetchAll: true });
          const ids = (queueData.tickets || [])
            .map((row: any) => String(row && row.ticketId ? row.ticketId : '').replace(/\D+/g, ''))
            .filter(Boolean);
          queueTicketIds = new Set(ids);
          queueScope = {
            requestedQueueAlias: queueAlias,
            requestedQueueDisplayName: queueSelection.queueDisplayName || null,
            requestedQueuePath: queuePath || null,
            requestedQueueTeam: queueSelection.team || null,
            queueName: queueData.queueName || matchedQueue.name || queueName || null,
            queueSize: ids.length,
            mode: 'post-filter'
          };
        }

        const probeCount = queueScope ? Math.max(count, Math.min(1000, count * 5)) : count;
        const searchData = (await core.runTicketSearch(page, query, probeCount, globalOpts.uiWaitMs)) || {
          pageUrl: null,
          pageTitle: null,
          query,
          source: 'none',
          resultCount: 0,
          results: []
        };
        const rawResults = Array.isArray(searchData.results) ? searchData.results : [];
        const filteredResults = queueTicketIds
          ? rawResults.filter((row: any) => queueTicketIds && queueTicketIds.has(String(row && row.ticketId ? row.ticketId : '')))
          : rawResults;

        return {
          ok: true,
          command: 'search-tickets',
          launchedChrome: cdp.launchedChrome,
          cdpUrl: cdp.cdpUrl || globalOpts.cdpUrl,
          ...searchData,
          queueScope,
          unfilteredResultCount: rawResults.length,
          resultCount: Math.min(count, filteredResults.length),
          results: filteredResults.slice(0, count)
        };
      });

      core.emitResult(program, result);
    });
}
