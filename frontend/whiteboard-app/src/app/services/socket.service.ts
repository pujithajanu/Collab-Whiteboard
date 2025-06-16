import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';  // Importing the necessary Socket.IO classes

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;  // Declaring a private socket variable with a proper type

  constructor() {
    // Replace with your backend server URL
    this.socket = io('http://localhost:3000', {
      transports: ['websocket']  // Ensures connection is via websocket
    });
  }
emitUndoAction(data: any) {
  this.socket.emit('undoAction', data);
}

onUndoAction(callback: (data: any) => void) {
  this.socket.on('undoAction', callback);
}

  // Method to listen for events from the server
  public on(eventName: string, callback: (...args: any[]) => void): void {
    this.socket.on(eventName, callback);
  }

  // Method to emit events to the server
  public emit(eventName: string, data?: any): void {
    this.socket.emit(eventName, data);
  }

  // Method to disconnect the socket when needed
  public disconnect(): void {
    this.socket.disconnect();
  }
}
