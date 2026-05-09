/**
 * CLI command builder for the dashboard.
 *
 * Spec: vault/specs/2026-05-08-connectors-cli-first-design (Phase 4 / Task 18).
 *
 * The dashboard never mutates state directly; every actionable button opens
 * a `CommandModal` that displays the exact `zeno connector …` command the
 * operator should run. This module is the single source of truth for that
 * mapping — given a discriminated `CommandKind`, return the title shown in
 * the modal header, the exact command string, the `docsAnchor` slug used to
 * deep-link into the CLI docs, and a `destructive` flag (carmine variant).
 *
 * Adding a new kind: extend `CommandKind`, add a `case` to `buildCliCommand`,
 * and the exhaustiveness check in the default branch will surface any miss.
 */

export type CommandKind =
  | { kind: 'install'; catalogId: string; label?: string }
  | { kind: 'enable'; slug: string }
  | { kind: 'disable'; slug: string }
  | { kind: 'uninstall'; slug: string }
  | { kind: 'test'; slug: string }
  | { kind: 'refresh-tools'; slug: string }
  | { kind: 'reveal-secret'; slug: string; key: string }
  | { kind: 'set-secret'; slug: string; key: string }
  | {
      kind: 'tool-set';
      slug: string;
      tool: string;
      permission: 'always_allow' | 'ask' | 'never';
    }
  | {
      kind: 'tool-bulk';
      slug: string;
      category: 'read' | 'write' | 'interactive';
      permission: 'always_allow' | 'ask' | 'never';
    }
  | { kind: 'app-install'; appId: string; pemPath: string }
  | { kind: 'app-installations-discover' }
  | { kind: 'app-installations-add'; installationId: string; label: string }
  | { kind: 'app-uninstall'; appName: string };

export interface CliCommand {
  title: string;
  command: string;
  docsAnchor: string;
  destructive: boolean;
}

export function buildCliCommand(spec: CommandKind): CliCommand {
  switch (spec.kind) {
    case 'install': {
      const command = spec.label
        ? `zeno connector install ${spec.catalogId} --label "${spec.label}"`
        : `zeno connector install ${spec.catalogId}`;
      return {
        title: `Install ${spec.catalogId}`,
        command,
        docsAnchor: 'install',
        destructive: false,
      };
    }
    case 'enable':
      return {
        title: `Enable ${spec.slug}`,
        command: `zeno connector enable ${spec.slug}`,
        docsAnchor: 'enable',
        destructive: false,
      };
    case 'disable':
      return {
        title: `Disable ${spec.slug}`,
        command: `zeno connector disable ${spec.slug}`,
        docsAnchor: 'disable',
        destructive: false,
      };
    case 'uninstall':
      return {
        title: `Uninstall ${spec.slug}`,
        command: `zeno connector uninstall ${spec.slug} --yes`,
        docsAnchor: 'uninstall',
        destructive: true,
      };
    case 'test':
      return {
        title: `Test ${spec.slug}`,
        command: `zeno connector test ${spec.slug}`,
        docsAnchor: 'test',
        destructive: false,
      };
    case 'refresh-tools':
      return {
        title: `Refresh tools ${spec.slug}`,
        command: `zeno connector refresh-tools ${spec.slug}`,
        docsAnchor: 'refresh-tools',
        destructive: false,
      };
    case 'reveal-secret':
      return {
        title: 'Reveal secret',
        command: `zeno connector secret reveal ${spec.slug} ${spec.key}`,
        docsAnchor: 'secret-reveal',
        destructive: false,
      };
    case 'set-secret':
      return {
        title: 'Set secret',
        command: `zeno connector secret set ${spec.slug} ${spec.key}`,
        docsAnchor: 'secret-set',
        destructive: false,
      };
    case 'tool-set':
      return {
        title: 'Set permission',
        command: `zeno connector tool set ${spec.slug} ${spec.tool} ${spec.permission}`,
        docsAnchor: 'tool-set',
        destructive: false,
      };
    case 'tool-bulk':
      return {
        title: 'Bulk set permission',
        command: `zeno connector tool bulk ${spec.slug} --category ${spec.category} --permission ${spec.permission}`,
        docsAnchor: 'tool-bulk',
        destructive: false,
      };
    case 'app-install':
      return {
        title: 'Install GitHub App',
        command: `zeno connector app install --catalog github-app --app-id ${spec.appId} --pem-file ${spec.pemPath}`,
        docsAnchor: 'app-install',
        destructive: false,
      };
    case 'app-installations-discover':
      return {
        title: 'Discover installations',
        command: 'zeno connector app installations discover',
        docsAnchor: 'app-discover',
        destructive: false,
      };
    case 'app-installations-add':
      return {
        title: 'Add installation',
        command: `zeno connector app installations add --installation-id ${spec.installationId} --label "${spec.label}"`,
        docsAnchor: 'app-add-installation',
        destructive: false,
      };
    case 'app-uninstall':
      return {
        title: 'Uninstall App',
        command: `zeno connector app uninstall --confirm "${spec.appName}"`,
        docsAnchor: 'app-uninstall',
        destructive: true,
      };
    default: {
      // Exhaustiveness check — TS will error here if a new CommandKind is
      // added without a matching case above.
      const _exhaustive: never = spec;
      throw new Error(`Unhandled CommandKind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
