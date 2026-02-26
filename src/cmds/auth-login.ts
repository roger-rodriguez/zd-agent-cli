import type { Command } from 'commander';
import { sleep } from '../core/util';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerAuthLogin(auth: Command, program: Command, core: CoreFacade): void {
  auth
    .command('login')
    .description('Open Zendesk and wait for successful authenticated session')
    .option('--timeout <seconds>', 'Max seconds to wait for login confirmation', '300')
    .action(async (options: { timeout?: string }) => {
      const globalOpts = core.resolveGlobalOpts(program);
      const timeoutMs = Math.max(5, Number(options.timeout) || 300) * 1000;
      if (!globalOpts.json) {
        console.log(`Waiting up to ${Math.floor(timeoutMs / 1000)}s for Zendesk login at ${globalOpts.startUrl}`);
      }

      const result = await core.withZendeskBrowser(program, async ({ page, globalOpts: runOpts, cdp }: BrowserContextArgs) => {
        await page.goto(runOpts.startUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        const deadline = Date.now() + timeoutMs;
        let user = await core.readCurrentUser(page);
        while (!(user && user.id) && Date.now() < deadline) {
          await sleep(2000);
          user = await core.readCurrentUser(page);
        }

        return {
          ok: Boolean(user && user.id),
          command: 'auth-login',
          launchedChrome: cdp.launchedChrome,
          cdpUrl: cdp.cdpUrl || runOpts.cdpUrl,
          startUrl: runOpts.startUrl,
          pageUrl: page.url(),
          authenticated: Boolean(user && user.id),
          user,
          timeoutSeconds: Math.floor(timeoutMs / 1000)
        };
      });

      core.emitResult(program, result);
    });
}
