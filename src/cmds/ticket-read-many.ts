import type { Command } from 'commander';
import { clean } from '../core/util';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

function parseIds(rawIds: string[]): string[] {
  const tokens = (Array.isArray(rawIds) ? rawIds : [])
    .flatMap((id) => String(id || '').split(/[\s,]+/g))
    .map((id) => String(id || '').replace(/\D+/g, ''))
    .filter(Boolean);
  return [...new Set(tokens)];
}

export function registerTicketReadMany(ticket: Command, program: Command, core: CoreFacade): void {
  ticket
    .command('read-many <ids...>')
    .description('Read many Zendesk tickets by id using API-only mode')
    .option('--comments <n>', 'Max comments per ticket', '10')
    .option('--concurrency <n>', 'Concurrent API requests (1-10)', '4')
    .option('--jsonl', 'Print one JSON object per line for each ticket result')
    .action(async (ids: string[], options: { comments?: string; concurrency?: string; jsonl?: boolean }) => {
      const comments = Math.max(1, Number(options.comments) || 10);
      const concurrency = Math.max(1, Math.min(10, Math.floor(Number(options.concurrency) || 4)));
      const parsedIds = parseIds(ids);
      if (!parsedIds.length) {
        throw new Error('At least one ticket id is required.');
      }

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts, cdp }: BrowserContextArgs) => {
        const rows = await core.readTicketsByIds(page, parsedIds, { count: comments, concurrency });
        const success = rows.filter((row) => row && row.ok === true);
        const failed = rows.filter((row) => !row || row.ok !== true);

        return {
          ok: true,
          command: 'read-ticket-many',
          launchedChrome: cdp.launchedChrome,
          cdpUrl: cdp.cdpUrl || globalOpts.cdpUrl,
          requestedTicketIds: parsedIds,
          comments,
          concurrency,
          resultCount: rows.length,
          successCount: success.length,
          failureCount: failed.length,
          tickets: rows
        };
      });

      if (options.jsonl) {
        for (const row of result.tickets || []) {
          const line = {
            command: 'read-ticket-many-item',
            requestedTicketId: row && row.requestedTicketId ? clean(row.requestedTicketId) : null,
            ...row
          };
          console.log(JSON.stringify(line));
        }
        return;
      }

      core.emitResult(program, result);
    });
}
