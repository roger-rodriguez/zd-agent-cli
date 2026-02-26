import { prepareInteractionContext } from './browser-cdp';
import { DEFAULT_UI_WAIT_MS } from './constants';
import { sleep, clean } from './util';

function extractZendeskHost(urlText = '') {
  try {
    const parsed = new URL(urlText);
    return /zendesk\.com$/i.test(parsed.hostname) ? parsed.hostname : '';
  } catch (_) {
    return '';
  }
}

function baseUrlFromPage(page: any): string {
  try {
    const parsed = new URL(page.url());
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return '';
  }
}

export async function getZendeskPage(context: any, startUrl: string, background: boolean): Promise<any> {
  const targetHost = extractZendeskHost(startUrl);
  const targetPattern = targetHost
    ? new RegExp(`https?://${targetHost.replace(/\./g, '\\.')}/agent`, 'i')
    : /zendesk\.com\/agent/i;

  let page = context.pages().find((p: any) => targetPattern.test(p.url()));

  if (!page) {
    if (!startUrl) {
      throw new Error('No Zendesk agent tab found. Provide --start-path or set domain/startPath in zendesk config.');
    }
    page = await context.newPage();
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } else if (!/\/agent\//i.test(page.url())) {
    if (!startUrl) {
      throw new Error('Found Zendesk tab but not an agent page. Provide --start-path or set domain/startPath in zendesk config.');
    }
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  if (!background) {
    await page.bringToFront().catch(() => undefined);
  }
  await sleep(500);
  return page;
}

export async function waitForAgentReady(page: any, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<void> {
  await prepareInteractionContext(page, uiWaitMs);
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => undefined);
  await page
    .locator('a[href*="/agent/filters/"], a[href*="/agent/tickets/"], main')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => undefined);
  await sleep(Math.max(500, Math.floor(uiWaitMs / 2)));
}

export async function openTicketByIdDom(page: any, ticketId: string, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<void> {
  const id = String(ticketId || '').replace(/\D+/g, '');
  if (!id) {
    throw new Error('Ticket id is required.');
  }

  const url = `${baseUrlFromPage(page)}/agent/tickets/${id}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForAgentReady(page, uiWaitMs);

  if (!new RegExp(`/agent/tickets/${id}(?:$|[/?#])`, 'i').test(page.url())) {
    throw new Error(`Ticket ${id} was not opened. Current URL: ${page.url()}`);
  }
}

export async function readCurrentTicketDom(page: any, options: { count?: number } = {}): Promise<any> {
  const count = Math.max(1, Number(options.count) || 10);

  return page.evaluate((maxComments: number) => {
    function cleanText(text: string) {
      return (text || '').replace(/\s+/g, ' ').trim();
    }

    const pageUrl = location.href;
    const ticketId = (pageUrl.match(/\/agent\/tickets\/(\d+)/i) || [null, null])[1];

    const subject =
      cleanText(
        document.querySelector('[data-test-id="ticket-pane-subject"], [data-garden-id="forms.input"], h1, [title]')?.textContent || ''
      ) || null;

    function readField(labelNeedle: string) {
      const rows = Array.from(document.querySelectorAll('label, dt, div, span'));
      const row = rows.find((n) => cleanText(n.textContent || '').toLowerCase() === labelNeedle.toLowerCase());
      if (!row) return null;
      const holder = row.closest('div, dl') || row.parentElement;
      if (!holder) return null;
      const value = cleanText(holder.querySelector('button, [data-garden-id="dropdowns.menu_wrapper"], [aria-haspopup="listbox"], dd, [title]')?.textContent || '');
      return value || null;
    }

    const status = readField('Status');
    const priority = readField('Priority');
    const assignee = readField('Assignee');
    const requester = readField('Requester');

    const tags = Array.from(document.querySelectorAll('a[href*="tags"], [data-test-id="ticket-tags"] span, [data-garden-id="tags.item"]'))
      .map((n) => cleanText(n.textContent || ''))
      .filter(Boolean)
      .slice(0, 40);

    const commentNodes = Array.from(
      document.querySelectorAll('[data-test-id="omni-log-comment-item"], article, [role="article"], [data-test-id="ticket-pane-comment"]')
    );

    const comments = [];
    for (const node of commentNodes) {
      const text = cleanText(
        node.querySelector('[data-test-id="rich-text"], [data-test-id="comment-body"], .zd-comment, p, div')?.textContent ||
          node.textContent ||
          ''
      );
      if (!text) continue;

      const author =
        cleanText(
          node.querySelector('[data-test-id="omni-log-comment-author"], [data-test-id="author"], h4, strong')?.textContent || ''
        ) || null;
      const time = cleanText(node.querySelector('time, [data-test-id="omni-log-comment-time"]')?.textContent || '') || null;

      comments.push({ author, time, text: text.slice(0, 4000) });
      if (comments.length >= maxComments) {
        break;
      }
    }

    return {
      pageUrl,
      pageTitle: document.title,
      ticketId,
      subject,
      status,
      priority,
      assignee,
      requester,
      tags,
      comments,
      source: 'dom'
    };
  }, count);
}

export async function openQueueByNameDom(page: any, queueName: string, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<any> {
  const target = clean(queueName).toLowerCase();
  if (!target) {
    throw new Error('Queue name is required.');
  }

  await waitForAgentReady(page, uiWaitMs);

  if (/^\d+$/.test(target)) {
    const directUrl = `${baseUrlFromPage(page)}/agent/filters/${target}`;
    await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForAgentReady(page, uiWaitMs);
    return { score: 100, name: queueName, href: directUrl, source: 'id-dom' };
  }

  const queue = await page.evaluate((targetName: string) => {
    function cleanText(text: string) {
      return (text || '').replace(/\s+/g, ' ').trim();
    }

    const links = Array.from(document.querySelectorAll('a[href*="/agent/filters/"]'));
    let best = null;

    for (const link of links) {
      const name = cleanText(link.textContent || '');
      if (!name) continue;
      const low = name.toLowerCase();
      const href = link.getAttribute('href') || '';

      let score = -1;
      if (low === targetName) score = 100;
      else if (low.includes(targetName)) score = 80;
      else if (targetName.includes(low)) score = 60;

      if (score >= 0 && (!best || score > best.score)) {
        best = {
          score,
          name,
          href: new URL(href, location.origin).toString(),
          source: 'dom'
        };
      }
    }

    return best;
  }, target);

  if (!queue || !queue.href) {
    throw new Error(`Could not find queue: ${queueName}`);
  }

  await page.goto(queue.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForAgentReady(page, uiWaitMs);
  return queue;
}

export async function openQueueByPathDom(page: any, queuePath: string, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<any> {
  const targetPath = clean(queuePath);
  if (!/^\/agent\//i.test(targetPath)) {
    throw new Error(`Invalid queue path "${targetPath}". Queue paths must begin with "/agent/".`);
  }
  const baseUrl = baseUrlFromPage(page);
  const target = targetPath ? `${baseUrl}${targetPath}` : '';
  if (!target) {
    throw new Error('Queue path is required.');
  }

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await waitForAgentReady(page, uiWaitMs);
  return { score: 100, name: null, href: target, source: 'config-path' };
}

export async function readQueueTicketsDom(page: any, options: { count?: number } = {}): Promise<any> {
  const count = Math.max(1, Number(options.count) || 20);

  return page.evaluate((maxCount: number) => {
    function cleanText(text: string) {
      return (text || '').replace(/\s+/g, ' ').trim();
    }

    const queueName = cleanText(document.querySelector('h1, [data-test-id="views_table_header"]')?.textContent || '') || null;

    const anchors = Array.from(document.querySelectorAll('a[href*="/agent/tickets/"]'));
    const tickets = [];
    const seen = new Set();

    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/agent\/tickets\/(\d+)/i);
      if (!m) continue;

      const ticketId = m[1];
      if (seen.has(ticketId)) continue;
      seen.add(ticketId);

      const row = a.closest('tr, li, article, div') || a;
      const title = cleanText(a.textContent || '') || null;
      const status = cleanText(row.querySelector('[data-test-id*="status"], [title*="status" i], [aria-label*="status" i]')?.textContent || '') || null;
      const requester = cleanText(row.querySelector('[data-test-id*="requester"], [title*="requester" i]')?.textContent || '') || null;

      tickets.push({
        ticketId,
        subject: title,
        status,
        requester,
        url: new URL(href, location.origin).toString()
      });

      if (tickets.length >= maxCount) {
        break;
      }
    }

    return {
      pageUrl: location.href,
      pageTitle: document.title,
      queueName,
      source: 'dom',
      resultCount: tickets.length,
      tickets
    };
  }, count);
}

async function submitSearchFromUi(page: any, query: string, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<boolean> {
  await waitForAgentReady(page, uiWaitMs);
  await prepareInteractionContext(page, uiWaitMs);

  const triggerSelectors = [
    'button[aria-label*="Search" i]',
    '[data-test-id*="search-launcher"]',
    '[data-test-id*="search"] button'
  ];
  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    const count = await trigger.count();
    if (!count) {
      continue;
    }
    await trigger.click({ timeout: 2000 }).catch(() => undefined);
    await sleep(Math.max(200, Math.floor(uiWaitMs / 3)));
  }

  await page.keyboard.press('Meta+K').catch(async () => page.keyboard.press('Control+K')).catch(() => undefined);
  await sleep(Math.max(200, Math.floor(uiWaitMs / 3)));

  const focused = await page.evaluate(() => {
    function isVisible(el: any) {
      if (!el || !(el instanceof HTMLElement)) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    const selectors = [
      'input[type="search"]',
      'input[role="combobox"]',
      'input[placeholder*="Search" i]',
      'input[aria-label*="Search" i]',
      'textarea[aria-label*="Search" i]',
      '[role="searchbox"]',
      '[role="combobox"][contenteditable="true"]',
      '[contenteditable="true"][aria-label*="Search" i]',
      '[data-test-id*="search"] input',
      '[data-test-id*="search"] [contenteditable="true"]'
    ];

    let target = null;
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      const visibleNode = nodes.find((n) => isVisible(n));
      if (visibleNode) {
        target = visibleNode;
        break;
      }
    }

    if (!target) {
      return false;
    }

    (target as HTMLElement).focus();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });

  if (!focused) {
    return false;
  }

  await page.keyboard.press('Meta+A').catch(async () => page.keyboard.press('Control+A')).catch(() => undefined);
  await page.keyboard.press('Backspace').catch(() => undefined);
  await page.keyboard.type(query, { delay: 25 });
  await page.keyboard.press('Enter');
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);
  await sleep(Math.max(700, Math.floor(uiWaitMs / 2)));
  return true;
}

export async function runTicketSearchDom(page: any, query: string, count = 20, uiWaitMs = DEFAULT_UI_WAIT_MS): Promise<any> {
  const q = clean(query);
  if (!q) {
    throw new Error('Search query is required.');
  }

  const uiSubmitted = await submitSearchFromUi(page, q, uiWaitMs);
  if (!uiSubmitted) {
    const url = `${baseUrlFromPage(page)}/agent/search/1?query=${encodeURIComponent(q)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForAgentReady(page, uiWaitMs);
  }

  const maxCount = Math.max(1, Number(count) || 20);

  return page.evaluate(({ maxCount, searchQuery }: { maxCount: number; searchQuery: string }) => {
    function cleanText(text: string) {
      return (text || '').replace(/\s+/g, ' ').trim();
    }

    const rows = Array.from(document.querySelectorAll('a[href*="/agent/tickets/"]'));
    const seen = new Set();
    const results = [];

    for (const row of rows) {
      const href = row.getAttribute('href') || '';
      const m = href.match(/\/agent\/tickets\/(\d+)/i);
      if (!m) continue;
      const ticketId = m[1];
      if (seen.has(ticketId)) continue;
      seen.add(ticketId);

      const container = row.closest('article, li, tr, div') || row;
      const title = cleanText(row.textContent || '') || null;
      const snippet =
        cleanText(container.querySelector('p, [data-test-id*="snippet"], [data-test-id*="description"]')?.textContent || '') || null;

      results.push({
        ticketId,
        title,
        snippet,
        url: new URL(href, location.origin).toString()
      });

      if (results.length >= maxCount) {
        break;
      }
    }

    return {
      pageUrl: location.href,
      pageTitle: document.title,
      query: searchQuery,
      source: 'dom',
      resultCount: results.length,
      results
    };
  }, { maxCount, searchQuery: q });
}

export {};
