import { Component, ElementRef, ViewChild } from '@angular/core';
import { CoordinateService } from '../../services/coordinate.service';
import {
  NodeType,
  WorkflowEdge,
  WorkflowNode,
} from 'src/app/model/workflow.model';

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
})
export class CanvasComponent {
  @ViewChild('svgRef') svgRef!: ElementRef<SVGSVGElement>;

  isPanning = false;
  lastMousePos = { x: 0, y: 0 };
  nodes: WorkflowNode[] = [];
  edges: WorkflowEdge[] = [];

  draggedNode: WorkflowNode | null = null;
  dragOffset = { x: 0, y: 0 };
  selectedEventName: string = 'ON_EVENT';
  tempEdge: { x1: number; y1: number; x2: number; y2: number } | null = null;
  drawingSource: { nodeId: string; portIndex: number } | null = null;

  readonly PORT_OFFSETS = [
    { x: 30, y: 0, pos: 'TOP' },
    { x: 60, y: 0, pos: 'TOP' },
    { x: 90, y: 0, pos: 'TOP' },
    { x: 30, y: 60, pos: 'BOTTOM' },
    { x: 60, y: 60, pos: 'BOTTOM' },
    { x: 90, y: 60, pos: 'BOTTOM' },
    { x: 0, y: 15, pos: 'LEFT' },
    { x: 0, y: 30, pos: 'LEFT' },
    { x: 0, y: 45, pos: 'LEFT' },
    { x: 120, y: 15, pos: 'RIGHT' },
    { x: 120, y: 30, pos: 'RIGHT' },
    { x: 120, y: 45, pos: 'RIGHT' },
  ];

  constructor(public coord: CoordinateService) {}

  onWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();
      event.deltaY < 0 ? this.coord.zoomIn() : this.coord.zoomOut();
    }
  }

  onMouseDown(event: MouseEvent): void {
    if (event.button === 1 || event.button === 2) {
      this.isPanning = true;
      this.lastMousePos = { x: event.clientX, y: event.clientY };
    }
  }

  onMouseMove(event: MouseEvent): void {
    const mousePos = this.coord.screenToWorld(
      event.clientX,
      event.clientY,
      this.svgRef.nativeElement
    );

    if (this.tempEdge) {
      this.tempEdge.x2 = mousePos.x;
      this.tempEdge.y2 = mousePos.y;
    }

    if (this.draggedNode) {
      this.draggedNode.x = mousePos.x - this.dragOffset.x;
      this.draggedNode.y = mousePos.y - this.dragOffset.y;
    } else if (this.isPanning) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;
      this.coord.translateX += dx;
      this.coord.translateY += dy;
      this.lastMousePos = { x: event.clientX, y: event.clientY };
    }
  }

  onMouseUp(): void {
    if (this.draggedNode) {
      // Phase 1: Grid Snapping (50px)
      this.draggedNode.x = Math.round(this.draggedNode.x / 50) * 50;
      this.draggedNode.y = Math.round(this.draggedNode.y / 50) * 50;
    }

    this.isPanning = false;
    this.draggedNode = null;
    this.cleanupDrawing();
  }

  addNode(type: NodeType) {
    let spawnX = 300,
      spawnY = 300;
    while (
      this.nodes.some(
        (n) => Math.abs(n.x - spawnX) < 140 && Math.abs(n.y - spawnY) < 80
      )
    ) {
      spawnY += 80;
      if (spawnY > 500) {
        spawnY = 100;
        spawnX += 140;
      }
    }
    this.nodes.push({
      id: 'node_' + Date.now(),
      type,
      x: spawnX,
      y: spawnY,
      label: type === 'STATE' ? `State ${this.nodes.length + 1}` : '',
      color: type === 'STATE' ? '#e3f2fd' : '#333',
    });
  }

  onNodeMouseDown(node: WorkflowNode, event: MouseEvent) {
    event.stopPropagation();
    if (this.tempEdge) return;
    this.draggedNode = node;
    const mousePos = this.coord.screenToWorld(
      event.clientX,
      event.clientY,
      this.svgRef.nativeElement
    );
    this.dragOffset.x = mousePos.x - node.x;
    this.dragOffset.y = mousePos.y - node.y;
  }

  getPortPos(node: WorkflowNode, portIndex: number) {
    const offset = this.PORT_OFFSETS[portIndex];
    return { x: node.x + offset.x, y: node.y + offset.y };
  }

  startDrawingEdge(node: WorkflowNode, portIndex: number, event: MouseEvent) {
    event.stopPropagation();
    const pos = this.getPortPos(node, portIndex);
    this.drawingSource = { nodeId: node.id, portIndex };
    this.tempEdge = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
  }

  completeEdge(targetNode: WorkflowNode, portIndex: number, event: MouseEvent) {
    event.stopPropagation();
    if (this.drawingSource && this.drawingSource.nodeId !== targetNode.id) {
      this.edges.push({
        id: 'edge_' + Date.now(),
        sourceNodeId: this.drawingSource.nodeId,
        sourcePortId: this.drawingSource.portIndex.toString(),
        targetNodeId: targetNode.id,
        targetPortId: portIndex.toString(),
        waypoints: [],
        eventName: 'ON_EVENT',
        isDoubleSided: false,
      });
    }
    this.cleanupDrawing();
  }

  cleanupDrawing() {
    this.drawingSource = null;
    this.tempEdge = null;
  }

  getEdgePath(edge: WorkflowEdge): string {
    const sourceNode = this.nodes.find((n) => n.id === edge.sourceNodeId);
    const targetNode = this.nodes.find((n) => n.id === edge.targetNodeId);
    if (!sourceNode || !targetNode) return '';

    const sIdx = parseInt(edge.sourcePortId);
    const tIdx = parseInt(edge.targetPortId);
    const start = this.getPortPos(sourceNode, sIdx);
    const end = this.getPortPos(targetNode, tIdx);

    const sDir = this.getDir(this.PORT_OFFSETS[sIdx].pos);
    const tDir = this.getDir(this.PORT_OFFSETS[tIdx].pos);

    // --- DYNAMIC BUFFER CALCULATION ---
    // Calculate raw distance between ports
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    // If nodes are close, reduce the buffer so it doesn't "loop" behind the ports
    const horizontalDist = dx > 0 ? dx : 0;
    const verticalDist = dy > 0 ? dy : 0;

    // We want the buffer to be at most 40% of the gap between nodes to prevent overshooting
    const maxSafeBuf = Math.min(
      20,
      (sDir.x !== 0 ? horizontalDist : verticalDist) * 0.4
    );
    const sEscapeDist = Math.max(5, Math.min(20 + sIdx * 5, maxSafeBuf));
    const tEscapeDist = Math.max(5, Math.min(20 + tIdx * 5, maxSafeBuf));

    const p1 = {
      x: start.x + sDir.x * sEscapeDist,
      y: start.y + sDir.y * sEscapeDist,
    };
    const p2 = {
      x: end.x + tDir.x * tEscapeDist,
      y: end.y + tDir.y * tEscapeDist,
    };

    const points = [start, p1];

    // --- PATH GENERATION (Midpoint-Z logic) ---
    if (
      (sDir.x !== 0 && tDir.x !== 0 && sDir.x === -tDir.x) ||
      (sDir.y !== 0 && tDir.y !== 0 && sDir.y === -tDir.y)
    ) {
      // Check if they are "facing" (standard Z-bend)
      const isFacing =
        (sDir.x === 1 && p1.x < p2.x) ||
        (sDir.x === -1 && p1.x > p2.x) ||
        (sDir.y === 1 && p1.y < p2.y) ||
        (sDir.y === -1 && p1.y > p2.y);

      if (isFacing) {
        if (sDir.x !== 0) {
          const midX = (p1.x + p2.x) / 2;
          points.push({ x: midX, y: p1.y });
          points.push({ x: midX, y: p2.y });
        } else {
          const midY = (p1.y + p2.y) / 2;
          points.push({ x: p1.x, y: midY });
          points.push({ x: p2.x, y: midY });
        }
      } else {
        // Logic for "facing away" remains the same (Bypass logic)
        const bypassOffset = 30 + sIdx * 10;
        if (sDir.x !== 0) {
          const bypassY = Math.min(sourceNode.y, targetNode.y) - bypassOffset;
          points.push({ x: p1.x, y: bypassY }, { x: p2.x, y: bypassY });
        } else {
          const bypassX = Math.min(sourceNode.x, targetNode.x) - bypassOffset;
          points.push({ x: bypassX, y: p1.y }, { x: bypassX, y: p2.y });
        }
      }
    } else {
      // Perpendicular logic (L-bend)
      points.push({
        x: sDir.x !== 0 ? p2.x : p1.x,
        y: sDir.x !== 0 ? p1.y : p2.y,
      });
    }

    points.push(p2, end);
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  }

  // Helper for Direction Vectors
  getDir(pos: string) {
    switch (pos) {
      case 'TOP':
        return { x: 0, y: -1 };
      case 'BOTTOM':
        return { x: 0, y: 1 };
      case 'LEFT':
        return { x: -1, y: 0 };
      case 'RIGHT':
        return { x: 1, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  }

  getEdgeLabelPos(edge: WorkflowEdge) {
    const path = this.getEdgePath(edge);
    if (!path) return { x: 0, y: 0 };

    const pathData = path.split(' ');
    // We grab the segment where the bypass or midpoint usually is (index 4/5)
    if (pathData.length >= 8) {
      return {
        x: parseFloat(pathData[4]),
        y: parseFloat(pathData[5]),
      };
    }
    return { x: 0, y: 0 };
  }

  assignEventToEdge(edge: WorkflowEdge) {
    edge.eventName = this.selectedEventName;
  }

  deleteEdge(edgeId: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    // Removing the edge from the array automatically deletes its eventName
    // because eventName is a property of the edge object itself.
    this.edges = this.edges.filter((e) => e.id !== edgeId);
  }
}
