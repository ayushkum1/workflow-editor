export type NodeType =
  | 'STATE'
  | 'AUTOMATIC'
  | 'MANUAL'
  | 'SUB_PROCESS'
  | 'JUNCTION'
  | 'FORK'
  | 'JOIN'
  | 'DECISION'
  | 'START'
  | 'END'
  | 'FAILED_STATE';

export type EdgeLineStyle = 'solid' | 'dotted' | 'dashed' | 'dash-dot';

export interface WorkflowNode {
  id: number | string;
  type: NodeType;
  originalType?: NodeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label: string;
  color: string;
  isDragging?: boolean;

  // BPMN-style text annotation attached to state (movable & resizable)
  annotation?: string;
  showAnnotation?: boolean;
  annotationOffsetX?: number;
  annotationOffsetY?: number;
  annotationWidth?: number;
  annotationHeight?: number;

  // Metadata for the Backend State Machine (legacy or node-level)
  actions?: string[];
  guards?: string[];
  activities?: string[];
}

export interface Port {
  id: string;
  ownerId: number | string; // The ID of the Node it belongs to
  x: number; // Relative to node
  y: number; // Relative to node
  position: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
}

export interface WorkflowEdge {
  id: number | string;
  sourceNodeId: number | string;
  targetNodeId: number | string;
  sourcePortId: string;
  targetPortId: string;
  waypoints: { x: number; y: number }[];
  eventName: string;
  isDoubleSided: boolean;
  guard?: string;
  lineStyle?: EdgeLineStyle;

  // Transition Actions & Guards
  actions?: string[];
  guards?: string[];
}

// Clean transition format for backend state machine consumption
export interface ExportedNode {
  id: number;
  type: NodeType;
  label: string;
  annotation?: string;
}

export interface ExportedTransition {
  id: number;
  sourceNodeId: number;
  sourceNodeLabel: string;
  sourceNodeType: NodeType;
  targetNodeId: number;
  targetNodeLabel: string;
  targetNodeType: NodeType;
  eventName: string;
  lineStyle?: EdgeLineStyle;
  actions: string[];
  guards: string[];
}

export interface WorkflowContainer {
  id: number | string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;
  borderColor?: string;
  borderStyle?: 'dashed' | 'solid' | 'dotted';
}

export interface ExportedWorkflow {
  nodes: ExportedNode[];
  edges: ExportedTransition[];
  containers?: WorkflowContainer[];
}

