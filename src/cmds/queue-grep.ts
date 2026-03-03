import type { Command } from 'commander';
import { clean } from '../core/util';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

type GrepField = 'subject' | 'comments';

function parseFields(raw: string): GrepField[] {
  const allowed: GrepField[] = ['subject', 'comments'];
  const parsed = String(raw || '')
    .split(',')
    .map((part) => clean(part).toLowerCase())
    .filter((part): part is GrepField => allowed.includes(part as GrepField));
  const unique = [...new Set(parsed)];
  return unique.length ? unique : ['subject', 'comments'];
}

function buildSnippet(text: string, rx: RegExp): string | null {
  const source = clean(text || '');
  if (!source) {
    return null;
  }
  const match = source.match(rx);
  if (!match || typeof match.index !== 'number') {
    return null;
  }
  const from = Math.max(0, match.index - 50);
  const to = Math.min(source.length, match.index + String(match[0] || '').length + 110);
  return source.slice(from, to);
}

export function registerQueueGrep(queue: Command, program: Command, core: CoreFacade): void {
  queue
    .command('grep [aliases...]')
    .description('Search tickets in one or more queues by regex pattern over selected fields')
    .requiredOption('--pattern <regex>', 'Regex pattern to search for (example: "model|upgrade|SL")')
    .option('--fields <list>', 'Comma-separated fields: subject,comments', 'subject,comments')
    .option('--count <n>', 'Max tickets per queue to inspect (omit for full queue scan)')
    .option('--comments <n>', 'Max comments per ticket when comments field is used', '25')
    .option('--concurrency <n>', 'Concurrent API requests for comment reads (1-10)', '4')
    .action(
      async (
        aliases: string[] | undefined,
        options: { pattern?: string; fields?: string; count?: string; comments?: string; concurrency?: string }
      ) => {
        const globalOpts = core.resolveGlobalOpts(program);
        const pattern = String(options.pattern || '').trim();
        if (!pattern) {
          throw new Error('Pattern is required.');
        }

        const fields = parseFields(options.fields || 'subject,comments');
        const useComments = fields.includes('comments');
        const comments = Math.max(1, Number(options.comments) || 25);
        const concurrency = Math.max(1, Math.min(10, Math.floor(Number(options.concurrency) || 4)));
        const hasExplicitCount = options.count !== undefined && options.count !== null;
        const count = hasExplicitCount ? Math.max(1, Number(options.count) || 50) : Number.MAX_SAFE_INTEGER;

        let rx: RegExp;
        try {
          rx = new RegExp(pattern, 'i');
        } catch (error: any) {
          throw new Error(`Invalid regex pattern: ${String(error && error.message ? error.message : error)}`);
        }

        const requestedAliases = Array.isArray(aliases) && aliases.length
          ? aliases
          : globalOpts.defaultQueue
            ? [globalOpts.defaultQueue]
            : [];
        if (!requestedAliases.length) {
          throw new Error('Queue alias is required. Pass one or more aliases, or configure defaultQueue.');
        }

        const result = await core.withZendeskBrowser(program, async ({ page, globalOpts: runOpts, cdp }: BrowserContextArgs) => {
          const queueSummaries: any[] = [];
          const matches: any[] = [];
          let inspectedTickets = 0;

          for (const requestedAlias of requestedAliases) {
            const queueSelection = core.resolveQueueInput(requestedAlias, {
              defaultQueue: runOpts.defaultQueue,
              queues: runOpts.queueAliases
            });
            const queueName = queueSelection.queueName;
            const queuePath = queueSelection.queuePath;

            if (!queueName && !queuePath) {
              continue;
            }

            const matchedQueue = await core.openQueueByName(page, queueName, runOpts.uiWaitMs, { queuePath });
            const queueData: any = await core.readQueueTickets(page, { count, fetchAll: !hasExplicitCount });
            const ticketRows = Array.isArray(queueData.tickets) ? queueData.tickets : [];
            inspectedTickets += ticketRows.length;

            const detailedById = new Map<string, any>();
            if (useComments) {
              const ids = ticketRows
                .map((row: any) => String(row && row.ticketId ? row.ticketId : '').replace(/\D+/g, ''))
                .filter(Boolean);
              const detailed = await core.readTicketsByIds(page, ids, { count: comments, concurrency });
              for (const row of detailed) {
                if (!row || !row.ticketId) {
                  continue;
                }
                detailedById.set(String(row.ticketId), row);
              }
            }

            let queueMatchCount = 0;
            for (const ticket of ticketRows) {
              const ticketId = String(ticket && ticket.ticketId ? ticket.ticketId : '').replace(/\D+/g, '');
              if (!ticketId) {
                continue;
              }

              const detailed = detailedById.get(ticketId);
              const subjectText = clean(ticket && ticket.subject ? ticket.subject : '');
              const commentsText = useComments && detailed && Array.isArray(detailed.comments)
                ? detailed.comments.map((c: any) => clean(c && c.text ? c.text : '')).filter(Boolean).join('\n')
                : '';

              const matchedFields: string[] = [];
              let snippet = null;

              if (fields.includes('subject') && subjectText && rx.test(subjectText)) {
                matchedFields.push('subject');
                snippet = snippet || buildSnippet(subjectText, rx);
              }

              if (fields.includes('comments') && commentsText && rx.test(commentsText)) {
                matchedFields.push('comments');
                snippet = snippet || buildSnippet(commentsText, rx);
              }

              if (!matchedFields.length) {
                continue;
              }

              queueMatchCount += 1;
              matches.push({
                queueAlias: queueSelection.alias || requestedAlias,
                queueName: queueData.queueName || matchedQueue.name || queueName,
                ticketId,
                subject: subjectText || null,
                matchedFields,
                snippet,
                url: ticket && ticket.url ? ticket.url : null
              });
            }

            queueSummaries.push({
              queueAlias: queueSelection.alias || requestedAlias,
              queueName: queueData.queueName || matchedQueue.name || queueName,
              inspectedTickets: ticketRows.length,
              matchCount: queueMatchCount
            });
          }

          return {
            ok: true,
            command: 'queue-grep',
            launchedChrome: cdp.launchedChrome,
            cdpUrl: cdp.cdpUrl || runOpts.cdpUrl,
            pattern,
            fields,
            commentsPerTicket: useComments ? comments : 0,
            inspectedQueues: queueSummaries.length,
            inspectedTickets,
            resultCount: matches.length,
            queues: queueSummaries,
            matches
          };
        });

        core.emitResult(program, result);
      }
    );
}
