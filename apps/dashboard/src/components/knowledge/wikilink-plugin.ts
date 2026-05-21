import type { Link, Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

const WIKILINK_RE = /\[\[([^[\]]+?)\]\]/g;

interface PluginOptions {
  wikilinks: Record<string, string | null>;
}

type ReplacementNode = Text | Link;

/**
 * Transforms `[[slug]]` tokens in text nodes into either a link (when the
 * slug resolves to a known file via the `wikilinks` map) or a text node
 * with `hName: 'span'` carrying `data-broken="true"` (when the slug is
 * unresolved or ambiguous). The map is per-file — supplied once when the
 * viewer constructs the plugin chain.
 */
export const wikilinkPlugin: Plugin<[PluginOptions], Root> = (options) => {
  const wikilinks = options.wikilinks;
  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      const value = node.value;
      if (typeof value !== 'string' || !value.includes('[[')) return;

      const newChildren: ReplacementNode[] = [];
      let lastEnd = 0;
      let matched = false;
      WIKILINK_RE.lastIndex = 0;
      let match: RegExpExecArray | null = WIKILINK_RE.exec(value);
      while (match !== null) {
        matched = true;
        const slug = (match[1] ?? '').trim();
        if (match.index > lastEnd) {
          newChildren.push({ type: 'text', value: value.slice(lastEnd, match.index) });
        }
        const resolved = slug.length > 0 ? wikilinks[slug] : undefined;
        if (typeof resolved === 'string') {
          const linkNode: Link = {
            type: 'link',
            url: `?file=${encodeURIComponent(resolved)}`,
            title: null,
            children: [{ type: 'text', value: slug }],
            data: {
              hProperties: {
                'data-wikilink': slug,
                className: 'wikilink',
              },
            },
          };
          newChildren.push(linkNode);
        } else {
          const brokenNode: Text = {
            type: 'text',
            value: slug,
            data: {
              hName: 'span',
              hProperties: {
                'data-broken': 'true',
                title: `wikilink not found: ${slug}`,
                className: 'wikilink-broken',
              },
            },
          };
          newChildren.push(brokenNode);
        }
        lastEnd = match.index + match[0].length;
        match = WIKILINK_RE.exec(value);
      }
      if (!matched) return;
      if (lastEnd < value.length) {
        newChildren.push({ type: 'text', value: value.slice(lastEnd) });
      }
      WIKILINK_RE.lastIndex = 0;
      parent.children.splice(index, 1, ...(newChildren as unknown as Text[]));
      return [SKIP, index + newChildren.length];
    });
  };
};
