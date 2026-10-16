import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { GreeterComponent } from './greeter.component';
import { GreetingService } from './greeting.service';

describe('GreeterComponent (TestBed)', () => {
  it('renders the greeting from the service', async () => {
    await TestBed.configureTestingModule({ imports: [GreeterComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GreeterComponent);
    fixture.componentRef.setInput('name', 'Ann');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Hello, Ann!');
  });

  it('uses a mocked service', async () => {
    const fake = { greet: jest.fn(() => 'Hi from mock') };
    await TestBed.configureTestingModule({
      imports: [GreeterComponent],
      providers: [{ provide: GreetingService, useValue: fake }],
    }).compileComponents();
    const fixture = TestBed.createComponent(GreeterComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Hi from mock');
    expect(fake.greet).toHaveBeenCalledWith('world');
  });
});

describe('GreeterComponent (Testing Library)', () => {
  it('emits likes', async () => {
    const liked = jest.fn();
    await render(GreeterComponent, { inputs: { name: 'Bo' }, on: { liked } });
    screen.getByRole('button', { name: /like/i }).click();
    expect(await screen.findByRole('button', { name: 'Like (1)' })).toBeTruthy();
    expect(liked).toHaveBeenCalledWith(1);
    expect(screen.getByRole('heading').textContent).toBe('Hello, Bo!');
  });
});

describe('GreetingService', () => {
  it('greets', () => {
    expect(TestBed.inject(GreetingService).greet('Cy')).toBe('Hello, Cy!');
  });
});
