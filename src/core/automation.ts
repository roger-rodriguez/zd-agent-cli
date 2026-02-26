import { DEFAULT_UI_WAIT_MS } from './constants';
import { clean } from './util';
import * as dom from './dom';
import * as api from './api';

function getBaseUrlFromPage(page: any): string {
  try {
    const url = new URL(page.url());
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return '';
  }
}

function parseViewIdFromUrl(pageUrl = ''): string | null {
  const m = String(pageUrl).match(/\/agent\/filters\/(\d+)/i);
  return m ? m[1] : null;
}

function parseTicketIdFromUrl(pageUrl = ''): string | null {
  const m = String(pageUrl).match(/\/agent\/tickets\/(\d+)/i);
  return m ? m[1] : null;
}

export async function getZendeskPage(context: any, startUrl: string, background: boolean): Promise<any> {
  return dom.getZendeskPage(context, startUrl, background);
}

export async function openTicketById(page: any, ticketId: string, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<any> {
  return dom.openTicketByIdDom(page, ticketId, uiWaitMs);
}

export async function readCurrentTicket(page: any, options: { count?: number } = {}): Promise<any> {
  const count = Math.max(1, Number(options.count) || 10);
  const ticketId = parseTicketIdFromUrl(page.url());
  const baseUrl = getBaseUrlFromPage(page);

  if (ticketId) {
    const apiResult = await api.readTicketByIdApi(page, ticketId, { count, baseUrl });
    if (apiResult) {
      return {
        ...apiResult,
        pageUrl: page.url(),
        pageTitle: (await page.title().catch(() => null)) || apiResult.pageTitle || null
      };
    }
  }

  return dom.readCurrentTicketDom(page, { count });
}

export async function openQueueByName(
  page: any,
  queueName: string,
  uiWaitMs = DEFAULT_UI_WAIT_MS,
  options: { queuePath?: string } = {}
): Promise<any> {
  const requested = clean(queueName);
  const queuePath = clean(options.queuePath || '');
  if (!requested && !queuePath) {
    throw new Error('Queue name or queue path is required.');
  }

  if (queuePath) {
    return dom.openQueueByPathDom(page, queuePath, uiWaitMs);
  }

  await dom.waitForAgentReady(page, uiWaitMs);

  const matchedApi = await api.findViewByNameApi(page, requested);
  if (matchedApi && matchedApi.href) {
    await page.goto(matchedApi.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dom.waitForAgentReady(page, uiWaitMs);
    return matchedApi;
  }

  return dom.openQueueByNameDom(page, requested, uiWaitMs);
}

export async function readQueueTickets(page: any, options: { count?: number; fetchAll?: boolean } = {}): Promise<any> {
  const requestedCount = Number(options.count);
  const hasCount = Number.isFinite(requestedCount) && requestedCount > 0;
  const count = hasCount ? Math.max(1, Math.floor(requestedCount)) : Number.MAX_SAFE_INTEGER;
  const fetchAll = options.fetchAll === true || !hasCount;
  const viewId = parseViewIdFromUrl(page.url());
  const baseUrl = getBaseUrlFromPage(page);

  if (viewId) {
    const apiResult = await api.readQueueByViewIdApi(page, viewId, { count, fetchAll, baseUrl });
    if (apiResult) {
      return {
        ...apiResult,
        pageUrl: page.url(),
        pageTitle: (await page.title().catch(() => null)) || apiResult.pageTitle || null
      };
    }
  }

  return dom.readQueueTicketsDom(page, { count });
}

export async function runTicketSearch(page: any, query: string, count = 20, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<any> {
  await dom.waitForAgentReady(page, uiWaitMs);
  const baseUrl = getBaseUrlFromPage(page);

  const apiResult = await api.searchTicketsApi(page, query, { count, baseUrl });
  if (apiResult && apiResult.resultCount > 0) {
    return {
      ...apiResult,
      pageUrl: baseUrl
        ? `${baseUrl}/agent/search/1?query=${encodeURIComponent(clean(query))}`
        : apiResult.pageUrl,
      pageTitle: (await page.title().catch(() => null)) || apiResult.pageTitle || null
    };
  }

  const domResult = await dom.runTicketSearchDom(page, query, count, uiWaitMs);
  if (domResult && domResult.resultCount > 0) {
    return domResult;
  }

  return apiResult || domResult;
}

export async function readCurrentUser(page: any): Promise<any> {
  return api.readCurrentUserApi(page);
}

export async function isAuthenticated(page: any): Promise<boolean> {
  const user = await readCurrentUser(page);
  return Boolean(user && user.id);
}

export {};
