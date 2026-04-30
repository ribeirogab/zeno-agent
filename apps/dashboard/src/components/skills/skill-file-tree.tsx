/**
 * Spec 0062 — collapsible file tree for the skill detail page.
 * Renders the flat path[] response of GET /api/skills/:id/files as a
 * hierarchical tree. Selected row uses the gold-soft + 2px gold border
 * convention from artboards 6JK-0 / 6OQ-0.
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { SkillFileEntry } from '@/lib/use-skills';

interface SkillFileTreeProps {
  files: SkillFileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string; // full path from root
  isDir: boolean;
  children: TreeNode[];
  // For files only (omitted for directories):
  sizeBytes: number | null;
}

function buildTree(files: SkillFileEntry[]): TreeNode {
  const root: TreeNode = { name: '/', path: '', isDir: true, children: [], sizeBytes: null };
  for (const f of files) {
    const parts = f.path.split('/');
    let cursor: TreeNode = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i] ?? '';
      const isLast = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join('/');
      let next: TreeNode | undefined = cursor.children.find((c) => c.name === name);
      if (!next) {
        next = {
          name,
          path: childPath,
          isDir: !isLast,
          children: [],
          sizeBytes: isLast ? f.sizeBytes : null,
        };
        cursor.children.push(next);
      }
      cursor = next;
    }
  }
  // Sort: directories first, then files, alphabetically inside each.
  const sortNode = (node: TreeNode): void => {
    node.children.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of node.children) if (c.isDir) sortNode(c);
  };
  sortNode(root);
  return root;
}

const DEFAULT_OPEN_FOLDERS = new Set(['references', 'scripts', 'examples', 'templates']);

export function SkillFileTree({ files, selectedPath, onSelect }: SkillFileTreeProps): JSX.Element {
  const tree = useMemo(() => buildTree(files), [files]);
  // Track which folders are open. Default-open the conventional folders.
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    const set = new Set<string>();
    set.add(''); // root
    for (const c of tree.children) {
      if (c.isDir && DEFAULT_OPEN_FOLDERS.has(c.name)) set.add(c.path);
    }
    return set;
  });

  const toggle = (path: string): void => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: '#0F1119',
        border: '1px solid #151824',
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #151824',
        }}
      >
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            lineHeight: '12px',
            color: '#4B4F66',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          files
        </span>
        <span
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            lineHeight: '12px',
            color: '#4B4F66',
          }}
        >
          {files.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 0' }}>
        <Row
          name="/"
          path=""
          depth={0}
          isDir
          isOpen={openFolders.has('')}
          isSelected={false}
          onClick={() => toggle('')}
        />
        {openFolders.has('') &&
          tree.children.map((child) => (
            <RenderNode
              key={child.path}
              node={child}
              depth={1}
              openFolders={openFolders}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={toggle}
            />
          ))}
      </div>
    </div>
  );
}

function RenderNode({
  node,
  depth,
  openFolders,
  selectedPath,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  openFolders: Set<string>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}): JSX.Element {
  const isOpen = node.isDir && openFolders.has(node.path);
  const isSelected = !node.isDir && node.path === selectedPath;
  return (
    <>
      <Row
        name={node.isDir ? `${node.name}/` : node.name}
        path={node.path}
        depth={depth}
        isDir={node.isDir}
        isOpen={isOpen}
        isSelected={isSelected}
        onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
      />
      {isOpen &&
        node.children.map((child) => (
          <RenderNode
            key={child.path}
            node={child}
            depth={depth + 1}
            openFolders={openFolders}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

function Row({
  name,
  depth,
  isDir,
  isOpen,
  isSelected,
  onClick,
}: {
  name: string;
  path: string;
  depth: number;
  isDir: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onClick: () => void;
}): JSX.Element {
  // Indent: 14px per depth level (matches artboard).
  const paddingLeft = 14 + depth * 14;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        padding: `5px 14px 5px ${paddingLeft}px`,
        gap: 6,
        cursor: 'pointer',
        background: isSelected ? '#D9B3621A' : 'transparent',
        borderLeft: isSelected ? '2px solid #D9B362' : '2px solid transparent',
        marginLeft: isSelected ? 0 : 0,
      }}
    >
      {isDir ? (
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style={{
            flexShrink: 0,
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 80ms',
          }}
          aria-hidden="true"
        >
          <path d="M2 1 L7 5 L2 9 Z" fill="#4B4F66" />
        </svg>
      ) : (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isSelected ? '#D9B362' : '#4B4F66'}
          strokeWidth="2"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="M14 2 H6 a2 2 0 0 0-2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2-2 V8 z" />
          {isSelected && <polyline points="14 2 14 8 20 8" />}
        </svg>
      )}
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          lineHeight: '16px',
          color: isSelected ? '#D9B362' : '#8A8FAB',
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        {name}
      </span>
    </button>
  );
}
