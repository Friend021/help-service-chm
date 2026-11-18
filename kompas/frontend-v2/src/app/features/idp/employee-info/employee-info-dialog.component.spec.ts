import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { EmployeeInfoDialogComponent } from './employee-info-dialog.component';
import { EmployeeContext } from '../../../models/idp.models';

describe('EmployeeInfoDialogComponent', () => {
  const context: EmployeeContext = {
    employeeId: 'EMP-42',
    fullName: 'Иванова Мария Петровна',
    managerFullName: 'Петров Сергей Иванович',
    hasActiveIdpWarning: false,
    currentPosition: 'Аналитик',
    targetPosition: null,
    returnUrl: '',
    isNewEmployee: false,
  };

  let fixture: ComponentFixture<EmployeeInfoDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function setup(data: EmployeeContext): void {
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      imports: [EmployeeInfoDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });

    fixture = TestBed.createComponent(EmployeeInfoDialogComponent);
    fixture.detectChanges();
  }

  it('renders the employee context fields', () => {
    setup(context);

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Информация о сотруднике');
    expect(text).toContain('Иванова Мария Петровна');
    expect(text).toContain('EMP-42');
    expect(text).toContain('Аналитик');
    expect(text).toContain('Не определена');
    expect(text).toContain('Петров Сергей Иванович');
  });

  it('renders the active IDP warning only when flagged', () => {
    setup({ ...context, hasActiveIdpWarning: true });

    expect(fixture.nativeElement.textContent).toContain('У сотрудника уже есть активный ИПР');
  });

  it('does not render the warning without the flag', () => {
    setup(context);

    expect(fixture.nativeElement.textContent).not.toContain('У сотрудника уже есть активный ИПР');
  });

  it('closes the dialog from the footer action', () => {
    setup(context);

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    );
    const closeButton = buttons.find((button) => button.textContent?.includes('Закрыть'));

    closeButton?.click();

    expect(dialogRef.close).toHaveBeenCalledOnce();
  });
});
