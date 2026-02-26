import type { Command } from 'commander';
import type { BrowserContextArgs, CoreFacade } from '../core/facade';

export function registerDoctor(program: Command, core: CoreFacade): void {
  program
    .command('doctor')
    .description('Run environment diagnostics (config, CDP, and Zendesk auth)')
    .action(async () => {
      const globalOpts = core.resolveGlobalOpts(program);
      const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

      checks.push({
        name: 'config-file',
        ok: Boolean(globalOpts.configPath),
        detail: globalOpts.configPath || 'No zendesk.config.json or zendesk.json found'
      });

      checks.push({
        name: 'config-contract',
        ok: globalOpts.configValidation.ok,
        detail: globalOpts.configValidation.ok
          ? 'valid'
          : (globalOpts.configValidation.issues || []).join('; ')
      });

      checks.push({
        name: 'profile-dir',
        ok: Boolean(globalOpts.profileDir),
        detail: globalOpts.profileDir || 'No profileDir resolved'
      });

      const cdpReachable = await core.isCdpReachable(globalOpts.cdpUrl);
      checks.push({
        name: 'cdp',
        ok: cdpReachable,
        detail: globalOpts.cdpUrl
      });

      if (cdpReachable && !globalOpts.allowSharedCdp) {
        const ownership = core.checkCdpOwnership({
          cdpUrl: globalOpts.cdpUrl,
          expectedProfileDir: globalOpts.profileDir
        });
        checks.push({
          name: 'cdp-profile-ownership',
          ok: ownership.matches,
          detail: ownership.matches
            ? `pid=${ownership.pid || 'unknown'}`
            : `expected=${ownership.expectedProfileDir || 'unknown'} actual=${ownership.actualProfileDir || 'unknown'}`
        });
      }

      let user: any = null;
      let authDetail = '';
      if (cdpReachable && globalOpts.domain) {
        try {
          user = await core.withZendeskBrowser(program, async ({ page }: BrowserContextArgs) => core.readCurrentUser(page));
          authDetail = user && user.id ? user.email || user.name || user.id : 'Not logged into Zendesk';
        } catch (error: any) {
          authDetail = String(error && error.message ? error.message : error);
        }
      } else if (!globalOpts.domain) {
        authDetail = 'Missing domain';
      } else {
        authDetail = 'Skipped because CDP is unreachable';
      }

      checks.push({
        name: 'zendesk-auth',
        ok: Boolean(user && user.id),
        detail: authDetail
      });

      const result = {
        ok: checks.every((check) => check.ok),
        command: 'doctor',
        checks
      };

      core.emitResult(program, result);
    });
}
