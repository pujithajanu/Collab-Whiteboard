import { Component } from '@angular/core';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent {
  chatMessages: { username: string, message: string }[] = [];
  chatInput: string = '';
  username: string = 'User1'; // Replace with dynamic user name if required

  sendMessage(): void {
    if (this.chatInput.trim()) {
      this.chatMessages.push({ username: this.username, message: this.chatInput });
      this.chatInput = '';
    }
  }
}
