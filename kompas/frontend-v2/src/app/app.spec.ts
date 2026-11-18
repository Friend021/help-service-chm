import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

/**
 * D-2 NOTE: the previous placeholder asserted `<app-shell>` inside the App
 * template, but App (app.ts) uses the inline template `<router-outlet />`;
 * the shell is rendered by the router (app.routes.ts), not by the root
 * component, so that assertion could never pass. Rewritten as a minimal
 * bootstrap test that keeps a green suite.
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render a router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
