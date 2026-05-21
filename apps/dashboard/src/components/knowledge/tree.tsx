import { type JSX, useMemo, useState } from 'react';
import type { KnowledgeFileSummary } from '@/lib/use-knowledge';

interface Props {
  files: KnowledgeFileSummary[];
  selectedPath: string | undefined;
  showMeta: boolean;
  onSelect: (path: string) => void;
}

interface FolderNode {
  type: 'folder';
  name: string;
  children: TreeNode[];
}
interface FileNode {
  type: 'file';
  name: string;
  path: string;
}
type TreeNode = FolderNode | FileNode;

export function KnowledgeTree({ files, selectedPath, showMeta, onSelect }: Props): JSX.Element {
  const visible = useMemo(
    () => files.filter((f) => showMeta || !pathHasMeta(f.path)),
    [files, showMeta],
  );
  const tree = useMemo(() => buildTree(visible), [visible]);
  const expanded = useExpanded(selectedPath);

  return (
    <nav className="flex flex-col gap-0.5 font-mono text-[13px]">
      {tree.map((node) => (
        <NodeView
          key={nodeKey(node, '')}
          node={node}
          parentPath=""
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function NodeView(props: {
  node: TreeNode;
  parentPath: string;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}): JSX.Element {
  const { node, parentPath, depth, expanded, selectedPath, onSelect } = props;
  const fullPath = parentPath === '' ? node.name : `${parentPath}/${node.name}`;
  if (node.type === 'file') {
    const isSelected = selectedPath === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`text-left px-2 py-1 rounded hover:bg-gold-soft ${
          isSelected ? 'bg-gold-soft text-text-primary' : 'text-text-secondary'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.name}
      </button>
    );
  }
  const isOpen = expanded.has(fullPath);
  return (
    <div className="flex flex-col">
      <div
        className="px-2 py-1 text-text-tertiary uppercase tracking-wide text-[11px]"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.name}
      </div>
      {isOpen
        ? node.children.map((child) => (
            <NodeView
              key={nodeKey(child, fullPath)}
              node={child}
              parentPath={fullPath}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

function nodeKey(node: TreeNode, parentPath: string): string {
  return parentPath === '' ? node.name : `${parentPath}/${node.name}`;
}

function pathHasMeta(p: string): boolean {
  return p.split('/').some((seg) => seg.startsWith('_'));
}

function buildTree(files: KnowledgeFileSummary[]): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: '', children: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let cursor: FolderNode = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const folderName = parts[i] as string;
      let next = cursor.children.find(
        (c): c is FolderNode => c.type === 'folder' && c.name === folderName,
      );
      if (!next) {
        next = { type: 'folder', name: folderName, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }
    const leaf = parts[parts.length - 1] as string;
    cursor.children.push({ type: 'file', name: leaf, path: file.path });
  }
  sortRecursive(root);
  return root.children;
}

function sortRecursive(node: FolderNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === 'folder') sortRecursive(child);
  }
}

function useExpanded(selectedPath: string | undefined): Set<string> {
  const ancestors = useMemo(() => {
    if (typeof selectedPath !== 'string') return new Set<string>();
    const parts = selectedPath.split('/').slice(0, -1);
    const out = new Set<string>();
    let acc = '';
    for (const part of parts) {
      acc = acc === '' ? part : `${acc}/${part}`;
      out.add(acc);
    }
    return out;
  }, [selectedPath]);
  const [manual] = useState<Set<string>>(new Set());
  return useMemo(() => new Set([...ancestors, ...manual]), [ancestors, manual]);
}
