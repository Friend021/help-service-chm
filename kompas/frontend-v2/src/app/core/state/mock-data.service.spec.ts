import { TestBed } from '@angular/core/testing';
import { MockDataService } from './mock-data.service';
import { IdpWorkflowService } from '../../features/idp/services/idp-workflow.service';
import { Scenario } from '../../models/idp.models';

describe('MockDataService', () => {
  let service: MockDataService;
  let switchScenarioFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    switchScenarioFn = vi.fn().mockResolvedValue(undefined);

    const workflowStub = {
      switchScenario: switchScenarioFn,
    } as unknown as IdpWorkflowService;

    TestBed.configureTestingModule({
      providers: [{ provide: IdpWorkflowService, useValue: workflowStub }],
    });

    service = TestBed.inject(MockDataService);
  });

  describe('applyVariant', () => {
    it('updates the current variant badge and delegates to the workflow switchScenario', async () => {
      await service.applyVariant('frontend');

      expect(service.currentVariant()).toBe('frontend');
      expect(switchScenarioFn).toHaveBeenCalledTimes(1);
      expect(switchScenarioFn).toHaveBeenCalledWith('known_employee');
    });

    it.each([
      ['frontend', 'known_employee'],
      ['qa', 'known_employee'],
      ['backend', 'known_employee'],
      ['manager', 'known_employee'],
      ['generic', 'new_employee'],
    ] as [string, Scenario][])('maps variant %s to scenario %s', async (variantId, expectedScenario) => {
      await service.applyVariant(variantId);
      expect(switchScenarioFn).toHaveBeenCalledWith(expectedScenario);
    });

    it('does nothing for an unknown variant id', async () => {
      service.currentVariant.set('frontend');
      await service.applyVariant('no-such-variant');

      expect(service.currentVariant()).toBe('frontend');
      expect(switchScenarioFn).not.toHaveBeenCalled();
    });
  });
});
