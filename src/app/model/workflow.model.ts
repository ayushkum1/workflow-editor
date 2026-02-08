export type NodeType = 'STATE' | 'JUNCTION' | 'FORK' | 'JOIN';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  color: string;
  isDragging?: boolean;

  // Metadata for the Backend State Machine
  actions?: string[];
  guards?: string[];
  activities?: string[];
}

export interface Port {
  id: string;
  ownerId: string; // The ID of the Node it belongs to
  x: number; // Relative to node
  y: number; // Relative to node
  position: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId: string;
  targetPortId: string;
  waypoints: { x: number; y: number }[];
  eventName: string;
  isDoubleSided: boolean;
}
