import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocketService } from './services/socket.service'; 

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, AfterViewInit {
  title = 'Whiteboard Pro';
  drawColor = '#000000';
  isErasing = false;
  isDrawing = false;
  lastX = 0;
  lastY = 0;

  @ViewChild('whiteboard') canvasRef!: ElementRef<HTMLCanvasElement>;
  chatInput = '';
  chatMessages: { username: string, message: string }[] = [];
  username = '';
  private ctx!: CanvasRenderingContext2D;

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    this.username = prompt('Enter your name') || 'Anonymous';

    // Drawing listener
    this.socketService['socket'].on('draw-coordinates', (data: any) => {
      this.drawFromOtherUser(data.fromX, data.fromY, data.toX, data.toY, data.isErasing);
    });

    // Chat listener
    this.socketService['socket'].on('chat-message', (data: any) => {
      this.chatMessages.push(data);
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  startDrawing(event: MouseEvent): void {
    this.isDrawing = true;
    const { offsetX, offsetY } = event;
    this.lastX = offsetX;
    this.lastY = offsetY;
  }

  draw(event: MouseEvent): void {
    if (!this.isDrawing) return;

    const { offsetX, offsetY } = event;

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(offsetX, offsetY);
    this.ctx.strokeStyle = this.isErasing ? '#ffffff' : this.drawColor;
    this.ctx.lineWidth = this.isErasing ? 20 : 2;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();

    this.socketService.emit('draw-coordinates', {
      fromX: this.lastX,
      fromY: this.lastY,
      toX: offsetX,
      toY: offsetY,
      isErasing: this.isErasing
    });

    this.lastX = offsetX;
    this.lastY = offsetY;
  }

  stopDrawing(): void {
    this.isDrawing = false;
  }

  toggleEraser(): void {
    this.isErasing = !this.isErasing;
  }

  disableEraser(): void {
    this.isErasing = false;
  }

  drawFromOtherUser(fromX: number, fromY: number, toX: number, toY: number, isErasing: boolean): void {
    if (!this.ctx) return;

    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.strokeStyle = isErasing ? '#ffffff' : this.drawColor;
    this.ctx.lineWidth = isErasing ? 20 : 2;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  sendMessage(): void {
    if (!this.chatInput.trim()) return;
    const data = { username: this.username, message: this.chatInput };
    this.chatMessages.push(data); // show locally
    this.socketService.emit('chat-message', data); // broadcast
    this.chatInput = '';
  }
}
