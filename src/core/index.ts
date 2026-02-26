import * as constants from './constants';
import * as runtime from './runtime';
import * as config from './config';
import * as automation from './automation';
import * as browserCdp from './browser-cdp';
import * as storage from './storage';
import type { CoreFacade } from './facade';

const core: CoreFacade = {
  ...constants,
  resolveGlobalOpts: runtime.resolveGlobalOpts,
  resolveQueueInput: config.resolveQueueInput,
  withZendeskBrowser: runtime.withZendeskBrowser,
  emitResult: runtime.emitResult,
  openTicketById: automation.openTicketById,
  readCurrentTicket: automation.readCurrentTicket,
  openQueueByName: automation.openQueueByName,
  readQueueTickets: automation.readQueueTickets,
  runTicketSearch: automation.runTicketSearch,
  readCurrentUser: automation.readCurrentUser,
  isCdpReachable: browserCdp.isCdpReachable,
  checkCdpOwnership: browserCdp.checkCdpOwnership,
  readCachedTicket: storage.readCachedTicket
};

export default core;
