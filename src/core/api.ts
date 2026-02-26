import { clean } from './util';

function normalizeBaseUrl(raw: any): string {
  const text = String(raw || '').trim();
  if (!text) {
    return '';
  }
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return '';
  }
}

function inferBaseUrl(page: any, options: { baseUrl?: string } = {}): string {
  const fromOpt = normalizeBaseUrl(options.baseUrl);
  if (fromOpt) {
    return fromOpt;
  }
  return normalizeBaseUrl(page && typeof page.url === 'function' ? page.url() : '');
}

function agentUrl(baseUrl: string, suffix: string): string {
  const path = String(suffix || '').startsWith('/') ? suffix : `/${String(suffix || '')}`;
  if (!baseUrl) {
    return path;
  }
  return `${baseUrl}${path}`;
}

async function apiGet(page: any, path: string): Promise<any> {
  try {
    return await page.evaluate(async (endpoint: string) => {
      try {
        const res = await fetch(endpoint, {
          credentials: 'include',
          headers: {
            Accept: 'application/json'
          }
        });

        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (_) {
          data = null;
        }

        return { ok: res.ok, status: res.status, data };
      } catch (error: any) {
        return { ok: false, status: 0, error: String(error && error.message ? error.message : error), data: null };
      }
    }, path);
  } catch (error: any) {
    const message = String(error && error.message ? error.message : error);
    return { ok: false, status: 0, error: message, data: null };
  }
}

async function apiGetAllPages(
  page: any,
  initialPath: string,
  options: { maxItems?: number; maxPages?: number; itemKey?: string } = {}
): Promise<any[]> {
  const maxItems = Math.max(1, Number(options.maxItems) || 100);
  const maxPages = Math.max(1, Number(options.maxPages) || 20);
  const itemKey = options.itemKey || 'results';

  let nextPath: string | null = initialPath;
  let pageCount = 0;
  const out: any[] = [];

  while (nextPath && pageCount < maxPages && out.length < maxItems) {
    const res = await apiGet(page, nextPath);
    if (!res.ok || !res.data) {
      break;
    }

    const rows = Array.isArray(res.data[itemKey]) ? res.data[itemKey] : [];
    const remaining = maxItems - out.length;
    out.push(...rows.slice(0, remaining));

    const nextPage = res.data.next_page;
    if (!nextPage || typeof nextPage !== 'string') {
      break;
    }

    try {
      const url = new URL(nextPage);
      nextPath = `${url.pathname}${url.search}`;
    } catch (_) {
      nextPath = null;
    }
    pageCount += 1;
  }

  return out;
}

function scoreNameMatch(name: string, target: string): number {
  const low = clean(name).toLowerCase();
  const query = clean(target).toLowerCase();
  if (!low || !query) {
    return -1;
  }
  if (low === query) return 100;
  if (low.includes(query)) return 80;
  if (query.includes(low)) return 60;
  return -1;
}

async function fetchUsersMap(page: any, ids: any[] = []): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniq.length) {
    return {};
  }

  const res = await apiGet(page, `/api/v2/users/show_many.json?ids=${encodeURIComponent(uniq.join(','))}`);
  if (!res.ok || !res.data || !Array.isArray(res.data.users)) {
    return {};
  }

  const map: Record<string, string> = {};
  for (const user of res.data.users) {
    if (!user || user.id === undefined || user.id === null) {
      continue;
    }
    map[String(user.id)] = clean(user.name || user.email || '') || String(user.id);
  }
  return map;
}

export async function readTicketByIdApi(page: any, ticketId: string, options: { count?: number; baseUrl?: string } = {}): Promise<any> {
  const id = String(ticketId || '').replace(/\D+/g, '');
  if (!id) {
    return null;
  }
  const baseUrl = inferBaseUrl(page, options);

  const commentsCount = Math.max(1, Number(options.count) || 10);

  const ticketRes = await apiGet(page, `/api/v2/tickets/${id}.json`);
  if (!ticketRes.ok || !ticketRes.data || !ticketRes.data.ticket) {
    return null;
  }

  const commentsRes = await apiGet(page, `/api/v2/tickets/${id}/comments.json?sort_order=desc`);
  const rawComments = commentsRes.ok && commentsRes.data && Array.isArray(commentsRes.data.comments)
    ? commentsRes.data.comments
    : [];

  const ticket = ticketRes.data.ticket;
  const actorIds = [ticket.requester_id, ticket.assignee_id, ...rawComments.map((c: any) => c && c.author_id)].filter(Boolean);
  const usersById = await fetchUsersMap(page, actorIds);

  const comments = rawComments
    .slice(0, commentsCount)
    .reverse()
    .map((c: any) => ({
      author: usersById[String(c.author_id)] || (c.author_id ? String(c.author_id) : null),
      time: c.created_at || null,
      text: clean(c.plain_body || c.body || '').slice(0, 4000)
    }))
    .filter((c: any) => c.text);

  return {
    pageUrl: agentUrl(baseUrl, `/agent/tickets/${id}`),
    pageTitle: null,
    ticketId: String(ticket.id),
    subject: clean(ticket.subject || '') || null,
    status: clean(ticket.status || '') || null,
    priority: clean(ticket.priority || '') || null,
    assignee: usersById[String(ticket.assignee_id)] || (ticket.assignee_id ? String(ticket.assignee_id) : null),
    requester: usersById[String(ticket.requester_id)] || (ticket.requester_id ? String(ticket.requester_id) : null),
    tags: Array.isArray(ticket.tags) ? ticket.tags : [],
    comments,
    source: 'api'
  };
}

export async function findViewByNameApi(page: any, queueName: string): Promise<any> {
  const requested = clean(queueName);
  if (!requested) {
    return null;
  }
  const baseUrl = inferBaseUrl(page);

  if (/^\d+$/.test(requested)) {
    const id = requested;
    return {
      id,
      score: 100,
      name: requested,
      href: agentUrl(baseUrl, `/agent/filters/${id}`),
      source: 'id-api'
    };
  }

  const responses = [
    await apiGet(page, '/api/v2/views.json?page[size]=100'),
    await apiGet(page, '/api/v2/views/active.json?page[size]=100')
  ];

  const allViews: any[] = [];
  for (const res of responses) {
    if (!res.ok || !res.data || !Array.isArray(res.data.views)) {
      continue;
    }
    allViews.push(...res.data.views);
  }

  if (!allViews.length) {
    return null;
  }

  let best = null;
  for (const view of allViews) {
    if (!view || !view.id) {
      continue;
    }
    const name = clean(view.title || '');
    if (!name) {
      continue;
    }
    const score = scoreNameMatch(name, requested);
    if (score < 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = {
        id: String(view.id),
        score,
        name,
        href: agentUrl(baseUrl, `/agent/filters/${view.id}`),
        source: 'api'
      };
    }
  }

  return best;
}

export async function readQueueByViewIdApi(
  page: any,
  viewId: string,
  options: { count?: number; fetchAll?: boolean; baseUrl?: string } = {}
): Promise<any> {
  const id = String(viewId || '').replace(/\D+/g, '');
  if (!id) {
    return null;
  }
  const baseUrl = inferBaseUrl(page, options);

  const requestedCount = Number(options.count);
  const fetchAll = options.fetchAll === true || !Number.isFinite(requestedCount) || requestedCount <= 0;
  const count = fetchAll ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(requestedCount));
  const viewRes = await apiGet(page, `/api/v2/views/${id}.json`);
  const rawTickets = await apiGetAllPages(page, `/api/v2/views/${id}/tickets.json?per_page=${Math.min(count, 100)}`, {
    maxItems: count,
    maxPages: 500,
    itemKey: 'tickets'
  });
  if (!rawTickets.length) {
    return null;
  }

  const userIds = rawTickets
    .flatMap((t) => {
      const ids = [];
      if (t && t.requester_id !== undefined && t.requester_id !== null) {
        ids.push(String(t.requester_id));
      }
      if (t && t.assignee_id !== undefined && t.assignee_id !== null) {
        ids.push(String(t.assignee_id));
      }
      return ids;
    })
    .filter(Boolean);
  const usersById = await fetchUsersMap(page, userIds);

  const tickets = rawTickets.map((t) => ({
    ticketId: t && t.id !== undefined && t.id !== null ? String(t.id) : null,
    subject: clean((t && t.subject) || ''),
    status: clean((t && t.status) || ''),
    assigneeId: t && t.assignee_id ? String(t.assignee_id) : null,
    assignee:
      t && t.assignee_id
        ? usersById[String(t.assignee_id)] || String(t.assignee_id)
        : null,
    requesterId: t && t.requester_id ? String(t.requester_id) : null,
    requester:
      t && t.requester_id
        ? usersById[String(t.requester_id)] || String(t.requester_id)
        : null,
    url: t && t.id ? agentUrl(baseUrl, `/agent/tickets/${t.id}`) : null
  }));

  const queueName =
    viewRes.ok && viewRes.data && viewRes.data.view && clean(viewRes.data.view.title || '')
      ? clean(viewRes.data.view.title || '')
      : null;

  return {
    pageUrl: agentUrl(baseUrl, `/agent/filters/${id}`),
    pageTitle: null,
    queueName,
    source: 'api',
    fullSync: fetchAll,
    resultCount: tickets.length,
    tickets
  };
}

export async function searchTicketsApi(page: any, query: string, options: { count?: number; baseUrl?: string } = {}): Promise<any> {
  const q = clean(query);
  if (!q) {
    return null;
  }
  const baseUrl = inferBaseUrl(page, options);

  const count = Math.max(1, Number(options.count) || 20);
  const rows = await apiGetAllPages(
    page,
    `/api/v2/search.json?query=${encodeURIComponent(`type:ticket ${q}`)}&per_page=${Math.min(count, 100)}`,
    {
      maxItems: count,
      maxPages: 50,
      itemKey: 'results'
    }
  );
  if (!rows.length) {
    return null;
  }

  const results = rows
    .filter((row) => row && row.result_type === 'ticket')
    .slice(0, count)
    .map((row) => ({
      ticketId: row.id ? String(row.id) : null,
      title: clean(row.subject || ''),
      snippet: clean(row.description || '').slice(0, 500),
      url: row.id ? agentUrl(baseUrl, `/agent/tickets/${row.id}`) : null
    }));

  return {
    pageUrl: agentUrl(baseUrl, `/agent/search/1?query=${encodeURIComponent(q)}`),
    pageTitle: null,
    query: q,
    source: 'api',
    resultCount: results.length,
    results
  };
}

export async function readCurrentUserApi(page: any): Promise<any> {
  const res = await apiGet(page, '/api/v2/users/me.json');
  if (!res.ok || !res.data || !res.data.user) {
    return null;
  }

  const user = res.data.user;
  return {
    id: user.id !== undefined && user.id !== null ? String(user.id) : null,
    name: clean(user.name || '') || null,
    email: clean(user.email || '') || null,
    role: clean(user.role || '') || null
  };
}

export {};
