const OWNER = 'ribeirogab';
const REPO = 'zeno-agent';
const BRANCH = 'main';
const CONTENT_ROOT = 'apps/docs/content/docs';

interface EditOnGithubOptions {
  owner: string;
  repo: string;
  sha: string;
  path: string;
}

/**
 * Build the EditOnGitHubOptions object Fumadocs's DocsPage expects, from the
 * virtualized MDX path it exposes on `page.path` (relative to the source
 * collection root, e.g. `install.mdx` or `guides/quickstart.mdx`).
 *
 * The owner/repo/branch are constants — Zeno is single-repo and we always
 * link to `main`. If those ever vary, lift them to env vars; today the
 * helper is intentionally pure and synchronous.
 */
export function editOnGithub(pagePath: string): EditOnGithubOptions {
  const normalized = pagePath.replace(/^\//, '');
  return {
    owner: OWNER,
    repo: REPO,
    sha: BRANCH,
    path: `${CONTENT_ROOT}/${normalized}`,
  };
}
