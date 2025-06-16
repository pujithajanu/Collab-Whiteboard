/* --------------------------------- imports -------------------------------- */
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocketService } from './services/socket.service';

/* ------------------------------- interfaces ------------------------------- */
interface LockBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lockedBy: string;
  hover?: boolean; 
}

/* ------------------------------ component meta ---------------------------- */
@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [CommonModule, FormsModule],
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  /* ------------------------------- whiteboard ------------------------------ */
  title = 'Whiteboard Pro';
  drawColor = '#000000';
  isErasing = false;
  isDrawing = false;
  isMousePressed = false;
  currentTool = 'pen';
  previousTool = 'pen';
  deselectButtonDisabled = true;

  /* ------------------------------- history --------------------------------- */
  drawingActions: any[] = [];
  redoStack: any[] = [];          // ✅ redos
  undoStack: any[] = [];          // ✅ for “clear” undo, if you need it

  /* -------------------------------- canvas -------------------------------- */
  @ViewChild('whiteboard') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;

  private lastX = 0;
  private lastY = 0;
  startX = 0;
  startY = 0;

  lockPreview: any = null;
  lockedAreas: LockBox[] = [];

  /* --------------------------------- chat --------------------------------- */
  chatInput = '';
  chatMessages: { username: string; message: string }[] = [];
  username = '';
  userId = crypto.randomUUID();

  chatBoxOpen = false;
  showChatNotification = false;
  latestMessage: { username: string; message: string } | null = null;

  /* ------------------------------ constructor ----------------------------- */
  constructor(private socketService: SocketService) {}

  /* ------------------------------- lifecycle ------------------------------ */
  ngOnInit(): void {
    this.username = prompt('Enter your name') || 'Anonymous';

    /* ------------- initial sync from server ------------- */
    this.socketService['socket'].on(
      'init-drawing-actions',
      (actions: any[]) => {
        
        for (const a of actions) {
          if (a.type !== 'clear') {
            this.addLockArea(a);
            this.removeDuplicateLocks();
            this.drawFromOtherUser(a);
          }
        }
      },
      
    );

    this.socketService['socket'].on('init-lock-areas', (locks: any[]) => {
      this.lockedAreas = locks;
      this.drawAllLocks();
      this.deselectButtonDisabled = !locks.some(
        l => l.lockedBy === this.userId,
      );
    });

    /* ---------------- live events ---------------- */
 this.socketService['socket'].on('lock-area', data => {
  if (!this.lockedAreas.some(l => l.id === data.id)) {
    this.lockedAreas.push(data);
    this.drawAllLocks(); // 🟩 Ensure entire canvas sees lock box immediately
    if (data.lockedBy === this.userId) this.deselectButtonDisabled = false;

    // Auto-unlock
    setTimeout(() => this.unlockArea(data.id), 5 * 60 * 1000);
  }
});


    this.socketService['socket'].on('draw-coordinates', data => {
      this.drawFromOtherUser(data);
      this.drawingActions.push({ ...data });
    });

    this.socketService['socket'].on('chat-message', m => this.receiveMessage(m));

    this.socketService['socket'].on('unlock-area', data => {
      this.lockedAreas = this.lockedAreas.filter(l => l.id !== data.id);
      this.redrawCanvas();
      if (!this.lockedAreas.some(l => l.lockedBy === this.userId)) {
        this.deselectButtonDisabled = true;
      }
    });

    this.socketService['socket'].on('undo-action', last => {
      this.drawingActions = this.drawingActions.filter(a => a.id !== last.id);
      this.redrawCanvas();
    });

    this.socketService['socket'].on('clear-canvas', () => {
      this.drawingActions = [];
      this.lockedAreas = [];
      this.redrawCanvas();
    });

  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();

    window.addEventListener('resize', this.resizeCanvas);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', () => (this.isMousePressed = false));
    this.drawAllLocks(); // ✅ force draw of any existing lock boxes

  }

  ngOnDestroy(): void {
    const canvas = this.canvasRef.nativeElement;
    window.removeEventListener('resize', this.resizeCanvas);
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
  }

  /* ----------------------------- helpers / UI ----------------------------- */
  selectTool = (tool: string): void => {
    if (tool === this.currentTool) return;
    this.previousTool = this.currentTool;
    this.currentTool = tool;
    this.isErasing = tool === 'eraser';
    this.lockPreview = null;
    this.isDrawing = false;
  };
undoLast = (): void => {
  for (let i = this.drawingActions.length - 1; i >= 0; i--) {
    if (this.drawingActions[i].userId === this.userId) {
      const last = this.drawingActions.splice(i, 1)[0];
      this.redoStack.push(last);
      this.redrawCanvas();

      // ⬇️ Emit full action to remove
      this.socketService.emit('undo-action', last);
      break;
    }
  }
};



  redoLast = (): void => {
    if (!this.redoStack.length) return;
    const last = this.redoStack.pop()!;
    this.drawingActions.push(last);
    this.drawFromOtherUser(last);
    this.socketService.emit('draw-coordinates', last);
  };

  clearCanvas = (): void => {
    this.drawingActions = [];
    this.lockedAreas = [];
    this.redrawCanvas();
    this.socketService.emit('clear-canvas');
  };

  refreshCanvas = (): void => {
    this.drawingActions = [];
    this.lockedAreas = [];
    this.ctx.clearRect(
      0,
      0,
      this.canvasRef.nativeElement.width,
      this.canvasRef.nativeElement.height,
    );
    this.socketService.emit('refresh-canvas');
  };

  manualUnlock = (id: string): void =>
    this.socketService.emit('unlock-area', { id });

  /* ----------------------------- chat actions ----------------------------- */
  sendMessage = (): void => {
    const msg = this.chatInput.trim();
    if (!msg) return;
    const data = { username: this.username, message: msg };
    this.chatMessages.push(data);
    this.socketService.emit('chat-message', data);
    this.chatInput = '';
  };

  toggleChatBox = (): void => {
    this.chatBoxOpen = !this.chatBoxOpen;
    this.showChatNotification = false;
  };

  receiveMessage(msg: { username: string; message: string }): void {
    this.chatMessages.push(msg);
    this.latestMessage = msg;
    if (!this.chatBoxOpen) {
      this.showChatNotification = true;
      setTimeout(() => (this.showChatNotification = false), 4000);
    }
  }

  /* ----------------------- drawing / locking helpers ---------------------- */
  resizeCanvas = (): void => {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.redrawCanvas();
  };

  onMouseDown = (e: MouseEvent): void => {
    const { offsetX: x, offsetY: y } = e;
    this.isMousePressed = true;

    if (this.currentTool === 'lock') {
      this.startX = x;
      this.startY = y;
      this.isDrawing = true;
      return;
    }

    if (this.currentTool === 'unlock') {
      const lock = this.lockedAreas.find(
        l =>
          x >= l.x &&
          x <= l.x + l.width &&
          y >= l.y &&
          y <= l.y + l.height &&
          l.lockedBy === this.userId,
      );
      if (lock) this.socketService.emit('unlock-area', { id: lock.id });
      return;
    }

    /* pen / eraser */
    if (this.isInLockedArea(x, y)) return;
    this.isDrawing = true;
    this.lastX = x;
    this.lastY = y;
  };

  onMouseMove = (e: MouseEvent): void => {
    const { offsetX: x, offsetY: y } = e;
    if (!this.isMousePressed || !this.isDrawing) return;

    if (this.currentTool === 'lock') {
      this.lockPreview = { x: this.startX, y: this.startY, width: x - this.startX, height: y - this.startY };
      this.redrawCanvas();
      this.ctx.save();
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeStyle = 'rgba(0,0,255,0.4)';
      this.ctx.strokeRect(this.lockPreview.x, this.lockPreview.y, this.lockPreview.width, this.lockPreview.height);
      
      this.ctx.restore();
      return;
    }

   if (
  ['pen', 'eraser'].includes(this.currentTool) &&
  !this.isLineIntersectingLockedArea(this.lastX, this.lastY, x, y)
)
 {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);
      this.ctx.strokeStyle = this.isErasing ? '#ffffff' : this.drawColor;
      this.ctx.lineWidth = this.isErasing ? 20 : 2;
      this.ctx.lineCap = 'round';
      this.ctx.stroke();
      this.drawAllLocks(); 

const draw = {
  id: crypto.randomUUID(),
  fromX: this.lastX,
  fromY: this.lastY,
  toX: x,
  toY: y,
  isErasing: this.isErasing,
  color: this.isErasing ? '#ffffff' : this.drawColor,
  userId: this.userId, // ✅ Track who drew it
};

      this.drawingActions.push(draw);
      this.socketService.emit('draw-coordinates', draw);

      this.redoStack = []; // new draw → redo history invalid
      this.lastX = x;
      this.lastY = y;
    }
  };

  onMouseUp = (): void => {
    this.isMousePressed = false;
    this.isDrawing = false;

    if (this.currentTool === 'lock' && this.lockPreview) {
      const box: LockBox = {
        id: crypto.randomUUID(),
        lockedBy: this.userId,
        ...this.lockPreview,
      };
      this.lockedAreas.push(box);
      this.socketService.emit('lock-area', { ...box, username: this.username, type: 'lock' });
      this.lockPreview = null;
      this.selectTool(this.previousTool);
      this.deselectButtonDisabled = false;
      this.drawAllLocks(); 
    }
  };
isLineIntersectingLockedArea(x1: number, y1: number, x2: number, y2: number): boolean {
  for (const lock of this.lockedAreas) {
    if (lock.lockedBy === this.userId) continue;

    const left = lock.x;
    const right = lock.x + lock.width;
    const top = lock.y;
    const bottom = lock.y + lock.height;

    // Simple AABB line intersection check (bounding box)
    if (
      Math.min(x1, x2) < right &&
      Math.max(x1, x2) > left &&
      Math.min(y1, y2) < bottom &&
      Math.max(y1, y2) > top
    ) {
      return true;
    }
  }
  return false;
}

  isInLockedArea(x: number, y: number): boolean {
    return this.lockedAreas.some(
      l =>
        x >= l.x &&
        x <= l.x + l.width &&
        y >= l.y &&
        y <= l.y + l.height &&
        l.lockedBy !== this.userId,
    );
  }

  /* ------------------------- low-level drawing ---------------------------- */
  drawFromOtherUser(d: any): void {
    this.ctx.beginPath();
    this.ctx.moveTo(d.fromX, d.fromY);
    this.ctx.lineTo(d.toX, d.toY);
    this.ctx.strokeStyle = d.color;
    this.ctx.lineWidth = d.isErasing ? 20 : 2;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  redrawCanvas(): void {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.drawingActions.forEach(a => this.drawFromOtherUser(a));
    this.drawAllLocks();
  }

drawLockOverlay(lock: LockBox): void {
  this.ctx.save();
  this.ctx.setLineDash([4, 4]);
  this.ctx.strokeStyle = lock.lockedBy === this.userId ? 'green' : 'red';
  this.ctx.lineWidth = 1;
  this.ctx.strokeRect(lock.x, lock.y, lock.width, lock.height);

  // ✅ Draw username
  if ((lock as any).username) {
    this.ctx.font = '12px Arial';
    this.ctx.fillStyle = 'blue';
    this.ctx.fillText((lock as any).username, lock.x + 5, lock.y - 5);
  }

  this.ctx.setLineDash([]);
  this.ctx.restore();
}


  drawAllLocks(): void {
    this.lockedAreas.forEach(l => this.drawLockOverlay(l));
  }

  /* ------------------------------ utilities ------------------------------- */
  unlockArea(id: string): void {
    this.socketService.emit('unlock-area', { id });
  }

  unlockAll(): void {
    const mine = this.lockedAreas.filter(l => l.lockedBy === this.userId);
    mine.forEach(l => this.socketService.emit('unlock-area', { id: l.id }));
    this.lockedAreas = this.lockedAreas.filter(l => l.lockedBy !== this.userId);
    this.redrawCanvas();
    this.deselectButtonDisabled = true;
  }

  addLockArea(a: any): void {
    if (a.type === 'lock' && !this.lockedAreas.some(l => l.id === a.id)) {
      this.lockedAreas.push(a);
    }
  }

  removeDuplicateLocks(): void {
    const seen = new Set<string>();
    this.lockedAreas = this.lockedAreas.filter(l => {
      const key = `${l.x}-${l.y}-${l.width}-${l.height}-${l.lockedBy}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
