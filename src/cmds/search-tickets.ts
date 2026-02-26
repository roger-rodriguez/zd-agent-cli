import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerSearchTickets(search: Command, program: Command, core: CoreFacade): void {
  search
    .command('tickets <query>')
    .description('Search Zendesk tickets by phrase')
    .option('--count <n>', 'Max number of search hits to return', '20')
    .action(async (query: string, options: { count?: string }) => {
      const count = Math.max(1, Number(options.count) || 20);

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts, cdp }: BrowserContextArgs) => {
        const searchData = await core.runTicketSearch(page, query, count, globalOpts.uiWaitMs);
        return {
          ok: true,
          command: 'search-tickets',
          launchedChrome: cdp.launchedChrome,
          cdpUrl: cdp.cdpUrl || globalOpts.cdpUrl,
          ...searchData
        };
      });

      core.emitResult(program, result);
    });
}
