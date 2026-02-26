export interface GlobalOpts {
  cdpUrl: string;
  domain: string;
  startPath: string;
  profileDir: string;
  startUrl: string;
  noLaunch: boolean;
  autoPort: boolean;
  cdpPortSpan: number;
  out: string;
  uiWaitMs: number;
  defaultQueue: string;
  queueAliases: Record<string, any>;
  configPath: string;
  repoRoot: string;
  configValidation: { ok: boolean; issues: string[] };
  storeRoot: string;
  store: boolean;
  cache: boolean;
  cacheOnly: boolean;
  cacheTtl: number;
  background: boolean;
  allowSharedCdp: boolean;
  json: boolean;
}

export interface BrowserContextArgs {
  page: any;
  globalOpts: GlobalOpts;
  cdp: {
    launchedChrome: boolean;
    cdpUrl?: string;
    wsEndpoint?: string;
  };
}

export interface CoreFacade {
  resolveGlobalOpts(program: any): GlobalOpts;
  emitResult(program: any, result: any): void;
  resolveQueueInput(rawInput: any, queueConfig: Record<string, any>): Record<string, any>;
  withZendeskBrowser(program: any, handler: (args: BrowserContextArgs) => Promise<any>): Promise<any>;

  openQueueByName(page: any, queueName: string, uiWaitMs?: number, options?: { queuePath?: string }): Promise<any>;
  readQueueTickets(page: any, options?: { count?: number; fetchAll?: boolean }): Promise<any>;
  openTicketById(page: any, ticketId: string, uiWaitMs?: number): Promise<any>;
  readCurrentTicket(page: any, options?: { count?: number }): Promise<any>;
  runTicketSearch(page: any, query: string, count?: number, uiWaitMs?: number): Promise<any>;
  readCurrentUser(page: any): Promise<any>;
  isCdpReachable(cdpUrl: string): Promise<boolean>;
  checkCdpOwnership(args: { cdpUrl: string; expectedProfileDir: string }): {
    matches: boolean;
    pid: string | null;
    expectedProfileDir: string | null;
    actualProfileDir: string | null;
  };
  readCachedTicket(args: { storeRoot: string; ticketId: string; ttlSeconds?: number }): any;
}
