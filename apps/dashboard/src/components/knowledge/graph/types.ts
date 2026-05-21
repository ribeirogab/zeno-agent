export interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  tags: string[];
  exists: boolean;
  isMeta: boolean;
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

export interface FilterState {
  search: string;
  tags: string[];
  folders: string[];
  showMeta: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
}

export interface DisplayState {
  nodeSize: number;
  linkThickness: number;
  labelFadeZoom: number;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  tags: [],
  folders: [],
  showMeta: false,
  existingOnly: false,
  showOrphans: true,
};

export const DEFAULT_DISPLAY_STATE: DisplayState = {
  nodeSize: 1.0,
  linkThickness: 1.0,
  labelFadeZoom: 1.5,
};
