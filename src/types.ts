export type QueueAlias = string;

export interface QueueConfigEntry {
  path: string;
  team?: string;
  displayName?: string;
}

export interface ZendeskConfig {
  domain: string;
  startPath: string;
  defaultQueue: QueueAlias;
  queues: Record<QueueAlias, QueueConfigEntry>;
  cdpUrl?: string;
  cdpPortSpan?: number;
  profileDir?: string;
  storeRoot?: string;
  uiWaitMs?: number;
  noLaunch?: boolean;
  allowSharedCdp?: boolean;
  noAutoPort?: boolean;
  noStore?: boolean;
  noCache?: boolean;
  cacheOnly?: boolean;
  cacheTtl?: number;
  foreground?: boolean;
  json?: boolean;
}

export interface CdpSessionMeta {
  launchedChrome: boolean;
  cdpUrl: string;
}

export interface PersistedInfo {
  entity: 'ticket' | 'queue' | 'search';
  latestPath: string;
  snapshotPath?: string;
}

export interface BaseResult {
  ok: boolean;
  command: string;
  cdpUrl?: string;
  cacheHit?: boolean;
  cacheAgeSeconds?: number;
  persisted?: PersistedInfo;
}

export interface TicketComment {
  author: string | null;
  time: string | null;
  text: string;
}

export interface ReadTicketResult extends BaseResult {
  command: 'read-ticket';
  ticketId: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  requester: string | null;
  tags: string[];
  comments: TicketComment[];
}

export interface QueueTicket {
  ticketId: string | null;
  subject: string;
  status: string;
  assignee?: string | null;
  requester?: string | null;
  url?: string | null;
}

export interface ReadQueueResult extends BaseResult {
  command: 'read-queue';
  queueName: string;
  pageUrl: string;
  resultCount: number;
  tickets: QueueTicket[];
}

export interface SearchHit {
  ticketId: string | null;
  title: string;
  snippet?: string;
  url?: string | null;
}

export interface SearchTicketsResult extends BaseResult {
  command: 'search-tickets';
  query: string;
  resultCount: number;
  results: SearchHit[];
}
