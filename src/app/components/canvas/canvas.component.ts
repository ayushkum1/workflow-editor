import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CoordinateService } from '../../services/coordinate.service';
import {
  ExportedWorkflow,
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

  // Panning & interaction
  isPanning = false;
  hasMovedDuringPan = false;
  isSpacePressed = false;
  lastMousePos = { x: 0, y: 0 };

  // Data
  nodes: WorkflowNode[] = [];
  edges: WorkflowEdge[] = [];

  // Dragging & Moving
  draggedNode: WorkflowNode | null = null;
  dragOffset = { x: 0, y: 0 };
  draggedNodesStart = new Map<number | string, { x: number; y: number }>();

  // Edge drawing
  tempEdge: { x1: number; y1: number; x2: number; y2: number } | null = null;
  drawingSource: { nodeId: number | string; portIndex: number } | null = null;

  // Selection states
  selectedNode: WorkflowNode | null = null;
  selectedNodeIds = new Set<number | string>();
  selectedEdge: WorkflowEdge | null = null;
  selectedEdgeIds = new Set<number | string>();

  // Marquee / Box Selection
  isMarqueeSelecting = false;
  marqueeStartWorld = { x: 0, y: 0 };
  marqueeRect: { x: number; y: number; width: number; height: number } | null = null;

  // Inline node title editing
  editingNodeId: number | string | null = null;
  editingLabel: string = '';

  // Node resizing
  resizingNode: WorkflowNode | null = null;
  nodeResizeStart = { mouseX: 0, mouseY: 0, width: 120, height: 60 };

  // Sidebar widths & collapsing
  paletteWidth = 140;
  inspectorWidth = 320;
  isPaletteCollapsed = false;
  isInspectorCollapsed = false;
  isResizingPalette = false;
  isResizingInspector = false;

  // Canvas interaction mode: 'pan' (hand tool) or 'select' (marquee selection)
  canvasMode: 'pan' | 'select' = 'pan';

  // Minimal palette shapes
  paletteShapes: { type: NodeType; label: string }[] = [
    { type: 'STATE', label: 'State' },
    { type: 'FAILED_STATE', label: 'Failed' },
    { type: 'DECISION', label: 'Decision' },
    { type: 'JUNCTION', label: 'Junction' },
    { type: 'FORK', label: 'Fork' },
    { type: 'JOIN', label: 'Join' },
    { type: 'START', label: 'Start' },
    { type: 'END', label: 'End' },
  ];

  // UI Tabs & sidebar states
  activeTab: 'properties' | 'transitions' = 'properties';
  newActionName: string = '';
  newGuardName: string = '';
  newActivityName: string = '';
  importExportText: string = '';

  constructor(public coord: CoordinateService) {}

  // Window listeners for fluid two-way sidebar resizing
  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    if (this.isResizingPalette) {
      const newWidth = Math.max(120, Math.min(480, event.clientX - 24));
      this.paletteWidth = newWidth;
    } else if (this.isResizingInspector) {
      const newWidth = Math.max(180, Math.min(600, window.innerWidth - event.clientX));
      this.inspectorWidth = newWidth;
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    if (this.isResizingPalette || this.isResizingInspector) {
      this.isResizingPalette = false;
      this.isResizingInspector = false;
    }
  }

  // Keyboard shortcut listener (Delete / Backspace / Space)
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const activeEl = document.activeElement;
    const isTyping =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      (activeEl && activeEl.getAttribute('contenteditable') === 'true');

    if (event.code === 'Space' && !isTyping) {
      this.isSpacePressed = true;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !isTyping) {
      this.deleteSelection();
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.isSpacePressed = false;
    }
  }

  // Delete all currently selected elements
  deleteSelection(): void {
    if (this.selectedNodeIds.size > 0) {
      const idsToDelete = new Set(this.selectedNodeIds);
      this.nodes = this.nodes.filter((n) => !idsToDelete.has(n.id));
      this.edges = this.edges.filter(
        (e) => !idsToDelete.has(e.sourceNodeId) && !idsToDelete.has(e.targetNodeId)
      );
      this.selectedNodeIds.clear();
      this.selectedNode = null;
    } else if (this.selectedNode) {
      this.deleteNode(this.selectedNode.id);
    }

    if (this.selectedEdgeIds.size > 0) {
      const edgeIdsToDelete = new Set(this.selectedEdgeIds);
      this.edges = this.edges.filter((e) => !edgeIdsToDelete.has(e.id));
      this.selectedEdgeIds.clear();
      this.selectedEdge = null;
    } else if (this.selectedEdge) {
      this.deleteEdge(this.selectedEdge.id);
    }
  }

  // Proportional port offsets adapting to node's width and height
  getPortOffsets(node: WorkflowNode) {
    const w = node.width || 120;
    const h = node.height || 60;
    return [
      { x: w * 0.25, y: 0, pos: 'TOP' },
      { x: w * 0.5, y: 0, pos: 'TOP' },
      { x: w * 0.75, y: 0, pos: 'TOP' },
      { x: w * 0.25, y: h, pos: 'BOTTOM' },
      { x: w * 0.5, y: h, pos: 'BOTTOM' },
      { x: w * 0.75, y: h, pos: 'BOTTOM' },
      { x: 0, y: h * 0.25, pos: 'LEFT' },
      { x: 0, y: h * 0.5, pos: 'LEFT' },
      { x: 0, y: h * 0.75, pos: 'LEFT' },
      { x: w, y: h * 0.25, pos: 'RIGHT' },
      { x: w, y: h * 0.5, pos: 'RIGHT' },
      { x: w, y: h * 0.75, pos: 'RIGHT' },
    ];
  }

  // Mouse wheel interactions: zoom with Ctrl, horizontal scroll with Shift, else vertical scroll
  onWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();
      event.deltaY < 0 ? this.coord.zoomIn() : this.coord.zoomOut();
    } else {
      event.preventDefault();
      if (event.shiftKey) {
        this.coord.translateX -= event.deltaY;
      } else {
        this.coord.translateY -= event.deltaY;
      }
    }
  }

  // Mouse down on canvas background
  onMouseDown(event: MouseEvent): void {
    // If inline editing, save edit
    if (this.editingNodeId !== null) {
      const node = this.nodes.find((n) => n.id === this.editingNodeId);
      if (node) this.saveInlineEdit(node);
    }

    // Panning (middle click, right click, or Space+left click)
    if (event.button === 1 || event.button === 2 || this.isSpacePressed) {
      this.isPanning = true;
      this.hasMovedDuringPan = false;
      this.lastMousePos = { x: event.clientX, y: event.clientY };
      return;
    }

    // Left click on empty canvas
    if (event.button === 0) {
      // Shift-drag or explicit select mode -> Marquee selection box
      if (event.shiftKey || this.canvasMode === 'select') {
        const worldPos = this.coord.screenToWorld(
          event.clientX,
          event.clientY,
          this.svgRef.nativeElement
        );
        this.isMarqueeSelecting = true;
        this.marqueeStartWorld = { ...worldPos };
        this.marqueeRect = { x: worldPos.x, y: worldPos.y, width: 0, height: 0 };

        if (!event.ctrlKey && !event.metaKey) {
          this.deselectAll();
        }
      } else {
        // Default mode: Left-click and pull -> Pan the graph!
        this.isPanning = true;
        this.hasMovedDuringPan = false;
        this.lastMousePos = { x: event.clientX, y: event.clientY };
      }
    }
  }

  onMouseMove(event: MouseEvent): void {
    // Panel resizing
    if (this.isResizingPalette) {
      const newWidth = Math.max(160, Math.min(450, event.clientX));
      this.paletteWidth = newWidth;
      return;
    }
    if (this.isResizingInspector) {
      const newWidth = Math.max(220, Math.min(500, window.innerWidth - event.clientX));
      this.inspectorWidth = newWidth;
      return;
    }

    const mousePos = this.coord.screenToWorld(
      event.clientX,
      event.clientY,
      this.svgRef.nativeElement
    );

    // Node resizing
    if (this.resizingNode) {
      const dx = mousePos.x - this.nodeResizeStart.mouseX;
      const dy = mousePos.y - this.nodeResizeStart.mouseY;
      this.resizingNode.width = Math.max(80, Math.round((this.nodeResizeStart.width + dx) / 10) * 10);
      this.resizingNode.height = Math.max(40, Math.round((this.nodeResizeStart.height + dy) / 10) * 10);
      return;
    }

    // Temporary edge line
    if (this.tempEdge) {
      this.tempEdge.x2 = mousePos.x;
      this.tempEdge.y2 = mousePos.y;
    }

    // Marquee selection box
    if (this.isMarqueeSelecting && this.marqueeRect) {
      const x = Math.min(this.marqueeStartWorld.x, mousePos.x);
      const y = Math.min(this.marqueeStartWorld.y, mousePos.y);
      const width = Math.abs(mousePos.x - this.marqueeStartWorld.x);
      const height = Math.abs(mousePos.y - this.marqueeStartWorld.y);
      this.marqueeRect = { x, y, width, height };

      // Update multi-selection of nodes intersecting marquee box
      this.nodes.forEach((n) => {
        const nw = n.width || 120;
        const nh = n.height || 60;
        const intersects =
          n.x < x + width &&
          n.x + nw > x &&
          n.y < y + height &&
          n.y + nh > y;

        if (intersects) {
          this.selectedNodeIds.add(n.id);
        } else if (!event.ctrlKey && !event.metaKey) {
          this.selectedNodeIds.delete(n.id);
        }
      });

      // Update multi-selection of edges intersecting marquee box
      this.edges.forEach((e) => {
        const pts = this.getEdgePoints(e);
        const intersects = pts.some(
          (pt) =>
            pt.x >= x && pt.x <= x + width && pt.y >= y && pt.y <= y + height
        );

        if (intersects) {
          this.selectedEdgeIds.add(e.id);
        } else if (!event.ctrlKey && !event.metaKey) {
          this.selectedEdgeIds.delete(e.id);
        }
      });

      if (this.selectedNodeIds.size === 1) {
        const singleId = Array.from(this.selectedNodeIds)[0];
        this.selectedNode = this.nodes.find((n) => n.id === singleId) || null;
      } else {
        this.selectedNode = null;
      }

      if (this.selectedEdgeIds.size === 1) {
        const singleEdgeId = Array.from(this.selectedEdgeIds)[0];
        this.selectedEdge = this.edges.find((e) => e.id === singleEdgeId) || null;
      } else {
        this.selectedEdge = null;
      }
      return;
    }

    // Node dragging (single or multi-selection)
    if (this.draggedNode) {
      const deltaX = mousePos.x - (this.draggedNode.x + this.dragOffset.x);
      const deltaY = mousePos.y - (this.draggedNode.y + this.dragOffset.y);

      if (this.selectedNodeIds.has(this.draggedNode.id) && this.selectedNodeIds.size > 1) {
        // Move all selected nodes synchronously
        this.selectedNodeIds.forEach((id) => {
          const node = this.nodes.find((n) => n.id === id);
          const start = this.draggedNodesStart.get(id);
          if (node && start) {
            node.x = start.x + deltaX;
            node.y = start.y + deltaY;
          }
        });
      } else {
        this.draggedNode.x = mousePos.x - this.dragOffset.x;
        this.draggedNode.y = mousePos.y - this.dragOffset.y;
      }
    } else if (this.isPanning) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.hasMovedDuringPan = true;
      }
      this.coord.translateX += dx;
      this.coord.translateY += dy;
      this.lastMousePos = { x: event.clientX, y: event.clientY };
    }
  }

  onMouseUp(): void {
    // Finish panel resizing
    this.isResizingPalette = false;
    this.isResizingInspector = false;
    this.resizingNode = null;

    // Finish marquee selection
    if (this.isMarqueeSelecting) {
      this.isMarqueeSelecting = false;
      this.marqueeRect = null;
    }

    // Finish node drag with 50px grid snap
    if (this.draggedNode) {
      if (this.selectedNodeIds.has(this.draggedNode.id) && this.selectedNodeIds.size > 1) {
        this.selectedNodeIds.forEach((id) => {
          const node = this.nodes.find((n) => n.id === id);
          if (node) {
            node.x = Math.round(node.x / 50) * 50;
            node.y = Math.round(node.y / 50) * 50;
          }
        });
      } else {
        this.draggedNode.x = Math.round(this.draggedNode.x / 50) * 50;
        this.draggedNode.y = Math.round(this.draggedNode.y / 50) * 50;
      }
    }

    // If was panning and didn't drag/move -> treat as click to deselect
    if (this.isPanning && !this.hasMovedDuringPan) {
      this.deselectAll();
    }

    this.isPanning = false;
    this.hasMovedDuringPan = false;
    this.draggedNode = null;
    this.draggedNodesStart.clear();
    this.cleanupDrawing();
  }

  // Sidebar drag resizer triggers
  startResizePalette(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isResizingPalette = true;
  }

  startResizeInspector(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isResizingInspector = true;
  }

  togglePalette(): void {
    this.isPaletteCollapsed = !this.isPaletteCollapsed;
  }

  toggleInspector(): void {
    this.isInspectorCollapsed = !this.isInspectorCollapsed;
  }

  // Node corner resize trigger
  startResizeNode(node: WorkflowNode, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    const mousePos = this.coord.screenToWorld(
      event.clientX,
      event.clientY,
      this.svgRef.nativeElement
    );
    this.resizingNode = node;
    this.nodeResizeStart = {
      mouseX: mousePos.x,
      mouseY: mousePos.y,
      width: node.width || 120,
      height: node.height || 60,
    };
  }

  // Inline double click title editing
  startInlineEdit(node: WorkflowNode, event: MouseEvent): void {
    event.stopPropagation();
    this.editingNodeId = node.id;
    this.editingLabel = node.label;
    setTimeout(() => {
      const el = document.getElementById('inline-edit-' + node.id) as HTMLInputElement;
      if (el) {
        el.focus();
        el.select();
      }
    }, 50);
  }

  saveInlineEdit(node: WorkflowNode): void {
    if (this.editingNodeId === node.id) {
      if (this.editingLabel.trim()) {
        node.label = this.editingLabel.trim();
      }
      this.editingNodeId = null;
    }
  }

  cancelInlineEdit(): void {
    this.editingNodeId = null;
  }

  // Helper to translate center screen coordinates to world
  getCanvasCenter() {
    const svg = this.svgRef.nativeElement;
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;
    const rect = svg.getBoundingClientRect();
    return this.coord.screenToWorld(
      rect.left + width / 2,
      rect.top + height / 2,
      svg
    );
  }

  // Numerical ID generators
  getNextNodeId(): number {
    if (this.nodes.length === 0) return 1;
    return (
      Math.max(
        ...this.nodes.map((n) =>
          typeof n.id === 'number'
            ? n.id
            : parseInt(String(n.id).replace(/\D/g, '')) || 0
        )
      ) + 1
    );
  }

  getNextEdgeId(): number {
    if (this.edges.length === 0) return 1;
    return (
      Math.max(
        ...this.edges.map((e) =>
          typeof e.id === 'number'
            ? e.id
            : parseInt(String(e.id).replace(/\D/g, '')) || 0
        )
      ) + 1
    );
  }

  // Unified Node Creator
  createNodeAt(type: NodeType, x: number, y: number) {
    let label = '';
    let color = '';

    switch (type) {
      case 'STATE':
        label = `State ${this.nodes.filter((n) => n.type === 'STATE').length + 1}`;
        color = '#e3f2fd';
        break;
      case 'FAILED_STATE':
        label = 'Failed State';
        color = '#fee2e2';
        break;
      case 'JUNCTION':
        label = 'Junction';
        color = '#f1f5f9';
        break;
      case 'DECISION':
        label = 'Decision';
        color = '#fffbeb';
        break;
      case 'FORK':
        label = 'Fork';
        color = '#f3e8ff';
        break;
      case 'JOIN':
        label = 'Join';
        color = '#f3e8ff';
        break;
      case 'START':
        label = 'Start';
        color = '#ecfdf5';
        break;
      case 'END':
        label = 'End';
        color = '#ffedd5';
        break;
    }

    const newNode: WorkflowNode = {
      id: this.getNextNodeId(),
      type,
      x,
      y,
      width: 120,
      height: 60,
      label,
      color,
      actions: [],
      guards: [],
      activities: [],
    };
    this.nodes.push(newNode);
    this.selectNode(newNode);
  }

  // Spawns nodes in viewport center to avoid overlaps
  addNode(type: NodeType) {
    const center = this.getCanvasCenter();
    let spawnX = Math.round(center.x / 50) * 50;
    let spawnY = Math.round(center.y / 50) * 50;

    // Shift down by 80px if collision detected
    while (
      this.nodes.some(
        (n) => Math.abs(n.x - spawnX) < 140 && Math.abs(n.y - spawnY) < 80
      )
    ) {
      spawnY += 80;
    }
    this.createNodeAt(type, spawnX, spawnY);
  }

  onNodeMouseDown(node: WorkflowNode, event: MouseEvent) {
    event.stopPropagation();

    // Multi-selection with Ctrl or Meta key
    if (event.ctrlKey || event.metaKey) {
      if (this.selectedNodeIds.has(node.id)) {
        this.selectedNodeIds.delete(node.id);
        if (this.selectedNode?.id === node.id) {
          this.selectedNode = null;
        }
      } else {
        this.selectedNodeIds.add(node.id);
        this.selectedNode = node;
      }
    } else {
      if (!this.selectedNodeIds.has(node.id)) {
        this.selectedNodeIds.clear();
        this.selectedNodeIds.add(node.id);
        this.selectNode(node);
      } else {
        this.selectedNode = node;
      }
    }

    this.selectedEdge = null;
    this.activeTab = 'properties';

    if (this.tempEdge) return;
    this.draggedNode = node;
    const mousePos = this.coord.screenToWorld(
      event.clientX,
      event.clientY,
      this.svgRef.nativeElement
    );
    this.dragOffset.x = mousePos.x - node.x;
    this.dragOffset.y = mousePos.y - node.y;

    // Snapshot positions of all selected nodes for synchronized dragging
    this.draggedNodesStart.clear();
    this.selectedNodeIds.forEach((id) => {
      const n = this.nodes.find((item) => item.id === id);
      if (n) {
        this.draggedNodesStart.set(id, { x: n.x, y: n.y });
      }
    });
  }

  getPortPos(node: WorkflowNode, portIndex: number) {
    const offsets = this.getPortOffsets(node);
    const offset = offsets[portIndex] || { x: 0, y: 0, pos: 'TOP' };
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
      const sourceNode = this.nodes.find((n) => n.id === this.drawingSource!.nodeId);
      const newEdge: WorkflowEdge = {
        id: this.getNextEdgeId(),
        sourceNodeId: this.drawingSource.nodeId,
        sourcePortId: this.drawingSource.portIndex.toString(),
        targetNodeId: targetNode.id,
        targetPortId: portIndex.toString(),
        waypoints: [],
        eventName: '',
        isDoubleSided: false,
        guard: '',
        actions: sourceNode?.actions && sourceNode.actions.length > 0 ? [...sourceNode.actions] : [],
        guards: sourceNode?.guards && sourceNode.guards.length > 0 ? [...sourceNode.guards] : [],
      };
      this.edges.push(newEdge);
      this.selectEdge(newEdge, event);
    }
    this.cleanupDrawing();
  }

  cleanupDrawing() {
    this.drawingSource = null;
    this.tempEdge = null;
  }

  // =========================================================================
  // CAMUNDA / DRAW.IO STRICTLY ORTHOGONAL ROUTING ALGORITHM (Zero diagonal lines)
  // =========================================================================
  getEdgePath(edge: WorkflowEdge): string {
    const points = this.getEdgePoints(edge);
    return this.pointsToSvgPath(points, 6);
  }

  // Calculate strictly orthogonal waypoints
  getEdgePoints(edge: WorkflowEdge): { x: number; y: number }[] {
    const sourceNode = this.nodes.find((n) => n.id === edge.sourceNodeId);
    const targetNode = this.nodes.find((n) => n.id === edge.targetNodeId);
    if (!sourceNode || !targetNode) return [];

    const sIdx = parseInt(edge.sourcePortId) || 0;
    const tIdx = parseInt(edge.targetPortId) || 0;

    const sOffsets = this.getPortOffsets(sourceNode);
    const tOffsets = this.getPortOffsets(targetNode);
    const sOffset = sOffsets[sIdx] || { x: 0, y: 0, pos: 'RIGHT' };
    const tOffset = tOffsets[tIdx] || { x: 0, y: 0, pos: 'LEFT' };

    const start = { x: sourceNode.x + sOffset.x, y: sourceNode.y + sOffset.y };
    const end = { x: targetNode.x + tOffset.x, y: targetNode.y + tOffset.y };

    const sDir = this.getDir(sOffset.pos);
    const tDir = this.getDir(tOffset.pos);

    // Track sibling edges connecting the same two nodes
    const siblingEdges = this.edges.filter(
      (e) =>
        (e.sourceNodeId === edge.sourceNodeId && e.targetNodeId === edge.targetNodeId) ||
        (e.sourceNodeId === edge.targetNodeId && e.targetNodeId === edge.sourceNodeId)
    );
    const edgeIndex = siblingEdges.findIndex((e) => e.id === edge.id);

    // Channel offset for multiple edges (e.g. 0, 24, -24, 48, -48...)
    let channelOffset = 0;
    if (siblingEdges.length > 1) {
      const sign = edgeIndex % 2 === 0 ? 1 : -1;
      const step = Math.ceil(edgeIndex / 2);
      channelOffset = sign * step * 24;
    }

    const sDist = 20;
    const tDist = 20;

    // Initial orthogonal escapes out of ports
    const p1 = { x: start.x + sDir.x * sDist, y: start.y + sDir.y * sDist };
    const pEnd = { x: end.x + tDir.x * tDist, y: end.y + tDir.y * tDist };

    const points: { x: number; y: number }[] = [start, p1];

    // Case 1: Both ports exit vertically (sDir.y !== 0 && tDir.y !== 0)
    if (sDir.y !== 0 && tDir.y !== 0) {
      if (sDir.y === -1 && tDir.y === -1) {
        // Both ports exit UPWARDS (e.g. middle edge between top ports)
        const topBypass = Math.min(p1.y, pEnd.y) - 20 - Math.abs(channelOffset);
        points.push({ x: p1.x, y: topBypass }, { x: pEnd.x, y: topBypass });
      } else if (sDir.y === 1 && tDir.y === 1) {
        // Both ports exit DOWNWARDS (e.g. bottom edge between bottom ports)
        const bottomBypass = Math.max(p1.y, pEnd.y) + 20 + Math.abs(channelOffset);
        points.push({ x: p1.x, y: bottomBypass }, { x: pEnd.x, y: bottomBypass });
      } else if (sDir.y === 1 && tDir.y === -1 && p1.y < pEnd.y) {
        // Forward facing downwards
        if (Math.abs(start.x - end.x) < 2 && channelOffset === 0) {
          return [start, end];
        } else if (channelOffset !== 0 && Math.abs(start.x - end.x) < 2) {
          const bypassX = start.x + channelOffset;
          points.push({ x: bypassX, y: p1.y }, { x: bypassX, y: pEnd.y });
        } else {
          const midY = Math.round((p1.y + pEnd.y) / 2) + channelOffset;
          points.push({ x: p1.x, y: midY }, { x: pEnd.x, y: midY });
        }
      } else if (sDir.y === -1 && tDir.y === 1 && p1.y > pEnd.y) {
        // Forward facing upwards
        if (Math.abs(start.x - end.x) < 2 && channelOffset === 0) {
          return [start, end];
        } else if (channelOffset !== 0 && Math.abs(start.x - end.x) < 2) {
          const bypassX = start.x + channelOffset;
          points.push({ x: bypassX, y: p1.y }, { x: bypassX, y: pEnd.y });
        } else {
          const midY = Math.round((p1.y + pEnd.y) / 2) + channelOffset;
          points.push({ x: p1.x, y: midY }, { x: pEnd.x, y: midY });
        }
      } else {
        // Reversing / looping vertically around sides
        const sNodeW = sourceNode.width || 120;
        const tNodeW = targetNode.width || 120;
        const leftBypass = Math.min(sourceNode.x, targetNode.x) - 40 - Math.abs(channelOffset);
        const rightBypass = Math.max(sourceNode.x + sNodeW, targetNode.x + tNodeW) + 40 + Math.abs(channelOffset);
        const bypassX = channelOffset >= 0 ? leftBypass : rightBypass;

        points.push({ x: bypassX, y: p1.y }, { x: bypassX, y: pEnd.y });
      }
    }
    // Case 2: Both ports exit horizontally (sDir.x !== 0 && tDir.x !== 0)
    else if (sDir.x !== 0 && tDir.x !== 0) {
      if (sDir.x === -1 && tDir.x === -1) {
        // Both ports exit LEFT
        const leftBypass = Math.min(p1.x, pEnd.x) - 20 - Math.abs(channelOffset);
        points.push({ x: leftBypass, y: p1.y }, { x: leftBypass, y: pEnd.y });
      } else if (sDir.x === 1 && tDir.x === 1) {
        // Both ports exit RIGHT
        const rightBypass = Math.max(p1.x, pEnd.x) + 20 + Math.abs(channelOffset);
        points.push({ x: rightBypass, y: p1.y }, { x: rightBypass, y: pEnd.y });
      } else if (sDir.x === 1 && tDir.x === -1 && p1.x < pEnd.x) {
        // Forward facing (East to West, source on left, target on right)
        if (Math.abs(start.y - end.y) < 2 && channelOffset === 0) {
          return [start, end];
        } else if (channelOffset !== 0 && Math.abs(start.y - end.y) < 2) {
          const bypassY = start.y + channelOffset;
          points.push({ x: p1.x, y: bypassY }, { x: pEnd.x, y: bypassY });
        } else {
          const midX = Math.round((p1.x + pEnd.x) / 2) + channelOffset;
          points.push({ x: midX, y: p1.y }, { x: midX, y: pEnd.y });
        }
      } else if (sDir.x === -1 && tDir.x === 1 && p1.x > pEnd.x) {
        // Forward facing (West to East, source on right, target on left)
        if (Math.abs(start.y - end.y) < 2 && channelOffset === 0) {
          return [start, end];
        } else if (channelOffset !== 0 && Math.abs(start.y - end.y) < 2) {
          const bypassY = start.y + channelOffset;
          points.push({ x: p1.x, y: bypassY }, { x: pEnd.x, y: bypassY });
        } else {
          const midX = Math.round((p1.x + pEnd.x) / 2) + channelOffset;
          points.push({ x: midX, y: p1.y }, { x: midX, y: pEnd.y });
        }
      } else {
        // Reversing / looping around nodes (e.g. facing away, loop over top/bottom)
        const sNodeH = sourceNode.height || 60;
        const tNodeH = targetNode.height || 60;
        const topBypass = Math.min(sourceNode.y, targetNode.y) - 45 - Math.abs(channelOffset);
        const bottomBypass = Math.max(sourceNode.y + sNodeH, targetNode.y + tNodeH) + 45 + Math.abs(channelOffset);
        const bypassY = channelOffset >= 0 ? topBypass : bottomBypass;

        points.push({ x: p1.x, y: bypassY }, { x: pEnd.x, y: bypassY });
      }
    }
    // Case 3: Perpendicular connection (e.g. Horizontal to Vertical or vice versa)
    else {
      if (sDir.x !== 0) {
        // Source exits horizontally, target enters vertically
        points.push({ x: pEnd.x, y: p1.y });
      } else {
        // Source exits vertically, target enters horizontally
        points.push({ x: p1.x, y: pEnd.y });
      }
    }

    points.push(pEnd, end);
    return points;
  }

  // Convert orthogonal points to SVG path with rounded fillets (radius = 6px)
  pointsToSvgPath(points: { x: number; y: number }[], radius: number = 6): string {
    if (points.length < 2) return '';

    // Step 1: Remove duplicate adjacent points
    const clean: { x: number; y: number }[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = clean[clean.length - 1];
      const curr = points[i];
      if (Math.abs(curr.x - prev.x) > 0.5 || Math.abs(curr.y - prev.y) > 0.5) {
        clean.push(curr);
      }
    }

    // Step 2: Remove redundant collinear points along straight lines
    const reduced: { x: number; y: number }[] = [clean[0]];
    for (let i = 1; i < clean.length - 1; i++) {
      const prev = reduced[reduced.length - 1];
      const curr = clean[i];
      const next = clean[i + 1];
      const isCollinearX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
      const isCollinearY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
      if (!isCollinearX && !isCollinearY) {
        reduced.push(curr);
      }
    }
    if (clean.length > 1) {
      reduced.push(clean[clean.length - 1]);
    }

    if (reduced.length < 2) return '';
    if (reduced.length === 2) {
      return `M ${reduced[0].x} ${reduced[0].y} L ${reduced[1].x} ${reduced[1].y}`;
    }

    // Step 3: Draw quadratic fillets at each 90-degree corner
    let d = `M ${reduced[0].x} ${reduced[0].y}`;
    for (let i = 1; i < reduced.length - 1; i++) {
      const prev = reduced[i - 1];
      const curr = reduced[i];
      const next = reduced[i + 1];

      const dIn = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const dOut = Math.hypot(next.x - curr.x, next.y - curr.y);
      const r = Math.min(radius, dIn / 2, dOut / 2);

      if (r < 1) {
        d += ` L ${curr.x} ${curr.y}`;
        continue;
      }

      const startX = curr.x - (r * (curr.x - prev.x)) / dIn;
      const startY = curr.y - (r * (curr.y - prev.y)) / dIn;
      const endX = curr.x + (r * (next.x - curr.x)) / dOut;
      const endY = curr.y + (r * (next.y - curr.y)) / dOut;

      d += ` L ${startX} ${startY} Q ${curr.x} ${curr.y} ${endX} ${endY}`;
    }

    const last = reduced[reduced.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  }

  // Calculate true midpoint and orientation (isVertical) of the edge for event pill placement
  getEdgeLabelInfo(edge: WorkflowEdge): { x: number; y: number; isVertical: boolean } {
    const points = this.getEdgePoints(edge);
    if (points.length < 2) return { x: 0, y: 0, isVertical: false };

    // Calculate total length and segment lengths
    let totalLength = 0;
    const segmentLengths: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const segLen = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      segmentLengths.push(segLen);
      totalLength += segLen;
    }

    const targetDistance = totalLength / 2;
    let accumulated = 0;

    for (let i = 0; i < segmentLengths.length; i++) {
      const segLen = segmentLengths[i];
      if (accumulated + segLen >= targetDistance || i === segmentLengths.length - 1) {
        const segRemain = targetDistance - accumulated;
        const ratio = segLen > 0 ? Math.max(0, Math.min(1, segRemain / segLen)) : 0.5;

        const pA = points[i];
        const pB = points[i + 1];

        const midX = pA.x + ratio * (pB.x - pA.x);
        const midY = pA.y + ratio * (pB.y - pA.y);

        const isVertical = Math.abs(pB.x - pA.x) < 2 && Math.abs(pB.y - pA.y) > 2;
        return { x: midX, y: midY, isVertical };
      }
      accumulated += segLen;
    }

    return { x: points[0].x, y: points[0].y, isVertical: false };
  }

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
        return { x: 1, y: 0 };
    }
  }

  deleteEdge(edgeId: number | string, event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.edges = this.edges.filter((e) => e.id !== edgeId);
    this.selectedEdgeIds.delete(edgeId);
    if (this.selectedEdge?.id === edgeId) {
      const nextId = Array.from(this.selectedEdgeIds)[0];
      this.selectedEdge = nextId ? this.edges.find((e) => e.id === nextId) || null : null;
    }
  }

  // Selection Actions
  selectNode(node: WorkflowNode) {
    this.selectedNode = node;
    this.selectedEdge = null;
    this.selectedEdgeIds.clear();
    this.activeTab = 'properties';
  }

  selectEdge(edge: WorkflowEdge, event: MouseEvent) {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      if (this.selectedEdgeIds.has(edge.id)) {
        this.selectedEdgeIds.delete(edge.id);
        if (this.selectedEdge?.id === edge.id) {
          const nextId = Array.from(this.selectedEdgeIds)[0];
          this.selectedEdge = nextId ? this.edges.find((e) => e.id === nextId) || null : null;
        }
      } else {
        this.selectedEdgeIds.add(edge.id);
        this.selectedEdge = edge;
      }
    } else {
      this.selectedEdgeIds.clear();
      this.selectedEdgeIds.add(edge.id);
      this.selectedEdge = edge;
      this.selectedNode = null;
      this.selectedNodeIds.clear();
    }
    this.activeTab = 'properties';
  }

  onEdgeMouseDown(edge: WorkflowEdge, event: MouseEvent): void {
    event.stopPropagation();
  }

  deselectAll() {
    this.selectedNode = null;
    this.selectedNodeIds.clear();
    this.selectedEdge = null;
    this.selectedEdgeIds.clear();
  }

  deleteNode(nodeId: number | string, event?: MouseEvent) {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.nodes = this.nodes.filter((n) => n.id !== nodeId);
    this.edges = this.edges.filter(
      (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
    );
    this.selectedNodeIds.delete(nodeId);
    if (this.selectedNode?.id === nodeId) {
      this.selectedNode = null;
    }
  }

  // Dropdown NodeType handler
  onNodeTypeChange(node: WorkflowNode) {
    switch (node.type) {
      case 'STATE':
        node.color = '#e3f2fd';
        if (!node.label || ['Failed State', 'Junction', 'Fork', 'Join', 'Decision', 'Start', 'End'].includes(node.label)) {
          node.label = `State ${this.nodes.filter((n) => n.type === 'STATE').length}`;
        }
        break;
      case 'FAILED_STATE':
        node.color = '#fee2e2';
        node.label = 'Failed State';
        break;
      case 'JUNCTION':
        node.color = '#f1f5f9';
        node.label = 'Junction';
        break;
      case 'DECISION':
        node.color = '#fffbeb';
        node.label = 'Decision';
        break;
      case 'FORK':
        node.color = '#f3e8ff';
        node.label = 'Fork';
        break;
      case 'JOIN':
        node.color = '#f3e8ff';
        node.label = 'Join';
        break;
      case 'START':
        node.color = '#ecfdf5';
        node.label = 'Start';
        break;
      case 'END':
        node.color = '#ffedd5';
        node.label = 'End';
        break;
    }
  }

  // Transition Actions & Guards helpers
  addEdgeAction(edge: WorkflowEdge) {
    if (!this.newActionName.trim()) return;
    if (!edge.actions) edge.actions = [];
    edge.actions.push(this.newActionName.trim());
    this.newActionName = '';
  }

  removeEdgeAction(edge: WorkflowEdge, index: number) {
    edge.actions?.splice(index, 1);
  }

  addEdgeGuard(edge: WorkflowEdge) {
    if (!this.newGuardName.trim()) return;
    if (!edge.guards) edge.guards = [];
    edge.guards.push(this.newGuardName.trim());
    this.newGuardName = '';
  }

  removeEdgeGuard(edge: WorkflowEdge, index: number) {
    edge.guards?.splice(index, 1);
  }

  getNodeLabel(nodeId: number | string): string {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return 'Unknown';
    if (node.label) return node.label;
    return `[${node.type}]`;
  }

  getNodeType(nodeId: number | string): NodeType {
    const node = this.nodes.find((n) => n.id === nodeId);
    return node ? node.type : 'STATE';
  }

  // HTML5 Drag and Drop events
  onDragStart(event: DragEvent, type: NodeType) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', type);
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer?.getData('text/plain') as NodeType;
    if (!type) return;

    const mousePos = this.coord.screenToWorld(
      event.clientX,
      event.clientY,
      this.svgRef.nativeElement
    );

    // Grid snapping (50px)
    const x = Math.round(mousePos.x / 50) * 50;
    const y = Math.round(mousePos.y / 50) * 50;

    this.createNodeAt(type, x, y);
  }

  // Normalize IDs to clean integers 1, 2, 3...
  normalizeIds() {
    const idMap = new Map<number | string, number>();
    this.nodes.forEach((node, index) => {
      const newId = typeof node.id === 'number' && node.id > 0 ? node.id : index + 1;
      idMap.set(node.id, newId);
      node.id = newId;
    });
    this.edges.forEach((edge, index) => {
      edge.id = typeof edge.id === 'number' && edge.id > 0 ? edge.id : index + 1;
      if (idMap.has(edge.sourceNodeId)) {
        edge.sourceNodeId = idMap.get(edge.sourceNodeId)!;
      }
      if (idMap.has(edge.targetNodeId)) {
        edge.targetNodeId = idMap.get(edge.targetNodeId)!;
      }
    });
  }

  // Clean JSON export for backend transitions
  exportWorkflow() {
    this.normalizeIds();

    const exportData: ExportedWorkflow = {
      nodes: this.nodes.map((node) => ({
        id: Number(node.id),
        type: node.type,
        label: node.label,
      })),
      edges: this.edges.map((edge) => {
        const sourceNode = this.nodes.find((n) => n.id === edge.sourceNodeId);
        const targetNode = this.nodes.find((n) => n.id === edge.targetNodeId);

        const actions =
          edge.actions && edge.actions.length > 0
            ? edge.actions
            : sourceNode?.actions && sourceNode.actions.length > 0
            ? sourceNode.actions
            : [];

        let guards: string[] = [];
        if (edge.guards && edge.guards.length > 0) {
          guards = edge.guards;
        } else if (edge.guard && edge.guard.trim()) {
          guards = [edge.guard.trim()];
        } else if (sourceNode?.guards && sourceNode.guards.length > 0) {
          guards = sourceNode.guards;
        }

        return {
          id: Number(edge.id),
          sourceNodeId: Number(edge.sourceNodeId),
          sourceNodeLabel: sourceNode?.label || this.getNodeLabel(edge.sourceNodeId),
          sourceNodeType: sourceNode?.type || 'STATE',
          targetNodeId: Number(edge.targetNodeId),
          targetNodeLabel: targetNode?.label || this.getNodeLabel(edge.targetNodeId),
          targetNodeType: targetNode?.type || 'STATE',
          eventName: edge.eventName || '',
          actions,
          guards,
        };
      }),
    };

    this.importExportText = JSON.stringify(exportData, null, 2);
  }

  // Import JSON with support for both clean transitions and full canvas formats
  importWorkflow() {
    if (!this.importExportText.trim()) return;
    try {
      const parsed = JSON.parse(this.importExportText);
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        this.nodes = parsed.nodes.map((n: any, index: number) => {
          const defaultX = n.x !== undefined ? n.x : 100 + (index % 4) * 200;
          const defaultY = n.y !== undefined ? n.y : 150 + Math.floor(index / 4) * 150;
          const defaultColor = n.color || this.getDefaultColorForType(n.type);

          return {
            id: n.id !== undefined ? n.id : index + 1,
            type: n.type || 'STATE',
            x: defaultX,
            y: defaultY,
            width: n.width || 120,
            height: n.height || 60,
            label: n.label || `State ${index + 1}`,
            color: defaultColor,
            actions: n.actions || [],
            guards: n.guards || [],
            activities: n.activities || [],
          };
        });
      }

      if (parsed.edges && Array.isArray(parsed.edges)) {
        this.edges = parsed.edges.map((e: any, index: number) => {
          return {
            id: e.id !== undefined ? e.id : index + 1,
            sourceNodeId: e.sourceNodeId,
            sourcePortId: e.sourcePortId || '10', // Right port
            targetNodeId: e.targetNodeId,
            targetPortId: e.targetPortId || '7', // Left port
            waypoints: e.waypoints || [],
            eventName: e.eventName || '',
            isDoubleSided: e.isDoubleSided || false,
            guard: e.guard || (e.guards && e.guards[0]) || '',
            actions: e.actions || [],
            guards: e.guards || (e.guard ? [e.guard] : []),
          };
        });
      }

      this.normalizeIds();
      this.deselectAll();
    } catch (e) {
      alert('Failed to parse JSON. Please check coordinates and structure.');
    }
  }

  getDefaultColorForType(type: NodeType): string {
    switch (type) {
      case 'STATE':
        return '#e3f2fd';
      case 'FAILED_STATE':
        return '#fee2e2';
      case 'JUNCTION':
        return '#f1f5f9';
      case 'DECISION':
        return '#fffbeb';
      case 'FORK':
      case 'JOIN':
        return '#f3e8ff';
      case 'START':
        return '#ecfdf5';
      case 'END':
        return '#ffedd5';
      default:
        return '#e3f2fd';
    }
  }

  clearCanvas() {
    if (confirm('Are you sure you want to clear the entire canvas?')) {
      this.nodes = [];
      this.edges = [];
      this.deselectAll();
      this.importExportText = '';
    }
  }
}
