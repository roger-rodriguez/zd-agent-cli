import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerAuthCheck(auth: Command, program: Command, core: CoreFacade): void {
  auth
    .command('check')
    .description('Check CDP reachability, config validity, and Zendesk auth status')
    .action(async () => {
      const globalOpts = core.resolveGlobalOpts(program);
      const cdpReachable = await core.isCdpReachable(globalOpts.cdpUrl);
      const config = {
        ok: Boolean(globalOpts.configPath) && globalOpts.configValidation.ok,
        issues: globalOpts.configValidation.issues || []
      };

      let authResult: {
        checked: boolean;
        authenticated: boolean;
        user: any;
        error: string | null;
      } = {
        checked: false,
        authenticated: false,
        user: null,
        error: null
      };

      if (!globalOpts.domain) {
        authResult.error = 'Missing domain. Set domain in config or pass --domain.';
      } else if (!cdpReachable) {
        authResult.error = 'CDP endpoint is unreachable.';
      } else {
        try {
          authResult = await core.withZendeskBrowser(program, async ({ page }: BrowserContextArgs) => {
            const user = await core.readCurrentUser(page);
            return {
              checked: true,
              authenticated: Boolean(user && user.id),
              user,
              error: null
            };
          });
        } catch (error: any) {
          authResult = {
            checked: true,
            authenticated: false,
            user: null,
            error: String(error && error.message ? error.message : error)
          };
        }
      }

      const result = {
        ok: cdpReachable && config.ok && authResult.authenticated,
        command: 'auth-check',
        cdp: {
          url: globalOpts.cdpUrl,
          reachable: cdpReachable
        },
        config: {
          path: globalOpts.configPath || null,
          ...config
        },
        auth: authResult
      };

      core.emitResult(program, result);
    });
}
