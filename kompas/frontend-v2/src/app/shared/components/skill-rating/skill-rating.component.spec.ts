import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkillRatingComponent } from './skill-rating.component';
import { SkillAssessmentItem } from '../../../models/idp.models';

/**
 * D-2: light component tests for the rating widget (tiles 1–5: model
 * set/toggle, readonly view).
 */
describe('SkillRatingComponent', () => {
  const SKILL: SkillAssessmentItem = {
    skillId: 's1',
    skillName: 'Angular',
    description: 'Description of the skill',
    rating: null,
  };

  let fixture: ComponentFixture<SkillRatingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillRatingComponent],
    }).compileComponents();
  });

  function setup(anItem: SkillAssessmentItem, readonly: boolean): void {
    fixture = TestBed.createComponent(SkillRatingComponent);
    fixture.componentRef.setInput('skill', anItem);
    fixture.componentRef.setInput('readonly', readonly);
    fixture.detectChanges();
  }

  it('renders the skill name and 5 rating tiles', () => {
    setup(SKILL, false);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.tiles')).toBeTruthy();
    expect(el.querySelectorAll('.tiles .tile').length).toBe(5);
  });

  it('sets the rating model on click and toggles back to null on the same tile', () => {
    setup(SKILL, false);
    const tiles = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tile');
    const third = tiles[2];
    expect(third.getAttribute('aria-label')).toBe('Оценка 3 из 5');

    third.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.rating()).toBe(3);
    expect(third.getAttribute('aria-checked')).toBe('true');
    expect(third.classList.contains('fill')).toBe(true);

    third.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.rating()).toBeNull();
  });

  it('disables tiles and reflects the rating in readonly mode', () => {
    const rated: SkillAssessmentItem = { ...SKILL, rating: 4 };
    setup(rated, true);
    const tiles = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tile');
    expect(tiles.length).toBe(5);
    expect(tiles[0].disabled).toBe(true);
    expect(tiles[3].classList.contains('fill')).toBe(true);
    expect(tiles[4].classList.contains('fill')).toBe(false);
  });
});
