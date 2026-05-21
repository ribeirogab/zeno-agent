export type GraphNodeKind = 'file' | 'tag' | 'ghost';

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  tags: string[];
  exists: boolean;
  isMeta: boolean;
  kind: GraphNodeKind;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GroupColor {
  group: string;
  color: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GroupColor[];
}
