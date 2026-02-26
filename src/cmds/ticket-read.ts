import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerTicketRead(ticket: Command, program: Command, core: CoreFacade): void {
  ticket
    .command('read <ticketId>')
    .description('Read a Zendesk ticket by id')
    .option('--comments <n>', 'Max number of comments to return', '10')
    .option('--cache-ttl <seconds>', 'Override cache TTL for ticket reads')
    .action(async (ticketId: string, options: { comments?: string; cacheTtl?: string }) => {
      const globalOpts = core.resolveGlobalOpts(program);
      const comments = Math.max(1, Number(options.comments) || 10);
      const ticketIdText = String(ticketId || '').replace(/\D+/g, '');
      const ttl = options.cacheTtl !== undefined
        ? Math.max(0, Math.floor(Number(options.cacheTtl) || 0))
        : globalOpts.cacheTtl;

      if (globalOpts.cache || globalOpts.cacheOnly) {
        const cached = core.readCachedTicket({
          storeRoot: globalOpts.storeRoot,
          ticketId: ticketIdText,
          ttlSeconds: ttl
        });
        if (cached) {
          core.emitResult(program, {
            ...cached,
            ok: true,
            command: 'read-ticket',
            requestedTicketId: ticketIdText,
            launchedChrome: false,
            cdpUrl: cached.cdpUrl || globalOpts.cdpUrl
          });
          return;
        }
      }

      if (globalOpts.cacheOnly) {
        throw new Error(`No cached ticket found for ${ticketIdText || ticketId} within ttl=${ttl}s.`);
      }

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts: runOpts, cdp }: BrowserContextArgs) => {
        await core.openTicketById(page, ticketId, runOpts.uiWaitMs);
        const data = await core.readCurrentTicket(page, { count: comments });

        return {
          ok: true,
          command: 'read-ticket',
          launchedChrome: cdp.launchedChrome,
          cdpUrl: cdp.cdpUrl || runOpts.cdpUrl,
          requestedTicketId: ticketIdText || String(ticketId),
          ...data
        };
      });

      core.emitResult(program, result);
    });
}
