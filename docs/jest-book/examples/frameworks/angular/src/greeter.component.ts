import { Component, inject, input, output, signal } from '@angular/core';
import { GreetingService } from './greeting.service';
@Component({
  selector: 'app-greeter',
  standalone: true,
  template: `
    <h1>{{ message() }}</h1>
    <button (click)="like()">Like ({{ likes() }})</button>
  `,
})
export class GreeterComponent {
  private service = inject(GreetingService);
  name = input('world');
  liked = output<number>();
  likes = signal(0);
  message() { return this.service.greet(this.name()); }
  like() { this.likes.update((n) => n + 1); this.liked.emit(this.likes()); }
}
