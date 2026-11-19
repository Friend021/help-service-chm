import { Injectable, inject } from '@angular/core';
import { httpResource, HttpResourceRef } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  EmployeeContextResponse,
  DictionariesResponse,
  IdpDraftResponse,
  ExportResponse,
  ExportRequest,
  IdpPlan,
  IdpPlanDraft,
  ManualContextRequest,
  PositionProfile,
  Scenario,
  WorkflowStage,
} from '../../models/idp.models';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private readonly baseUrl = environment.apiUrl;

  // Helper to create GET resource
  private getResource<T>(url: string, defaultValue: T): HttpResourceRef<T> {
    return httpResource<T>(() => ({ url }), { defaultValue });
  }

  // Helper to create POST/PUT resource (method per mock-backend/openapi.yaml)
  private mutateResource<T, B>(url: string, method: 'POST' | 'PUT', body: () => B, defaultValue: T): HttpResourceRef<T> {
    return httpResource<T>(() => ({ url, method, body: body() }), { defaultValue });
  }

  // --- Context & Session ---
  getContext(scenario?: Scenario): HttpResourceRef<EmployeeContextResponse> {
    const url = scenario ? `${this.baseUrl}/session/context?scenario=${scenario}` : `${this.baseUrl}/session/context`;
    return this.getResource<EmployeeContextResponse>(url, {
      context: {
        employeeId: '',
        fullName: '',
        managerFullName: '',
        hasActiveIdpWarning: false,
        currentPosition: null,
        targetPosition: null,
        returnUrl: '',
        isNewEmployee: true,
      },
      scenario: 'known_employee' as Scenario,
      stage: 'STAGE_1_CONTEXT' as WorkflowStage,
      isNewEmployee: true,
      returnUrl: '',
    });
  }

  setManualContext(body: ManualContextRequest): HttpResourceRef<EmployeeContextResponse> {
    return this.mutateResource<EmployeeContextResponse, ManualContextRequest>(
      `${this.baseUrl}/session/context/manual`,
      'POST',
      () => body,
      {
        context: {
          employeeId: '',
          fullName: '',
          managerFullName: '',
          hasActiveIdpWarning: false,
          currentPosition: null,
          targetPosition: null,
          returnUrl: '',
          isNewEmployee: false,
        },
        scenario: 'known_employee' as Scenario,
        stage: 'STAGE_2_QUESTIONNAIRE' as WorkflowStage,
        isNewEmployee: false,
        returnUrl: '',
      }
    );
  }

  // --- Dictionaries ---
  getDictionaries(): HttpResourceRef<DictionariesResponse> {
    return this.getResource<DictionariesResponse>(`${this.baseUrl}/idp/dictionaries`, {
      directions: [],
      priorities: [],
      developmentTools: [],
      stages: [],
      targetRoles: [],
    });
  }

  // --- Position profile (крошки + ключевые функции) ---
  getPositionProfile(title: string): HttpResourceRef<PositionProfile> {
    return this.getResource<PositionProfile>(
      `${this.baseUrl}/idp/position-profile?title=${encodeURIComponent(title)}`,
      { title, careerTrack: null, orgBlock: null, orgDirection: null, keyFunctions: [] }
    );
  }

  // --- Draft ---
  getDraft(): HttpResourceRef<IdpDraftResponse> {
    return this.getResource<IdpDraftResponse>(`${this.baseUrl}/idp/draft`, {
      stage: 'STAGE_1_CONTEXT' as WorkflowStage,
      plan: { mainGoal: '', directions: [] },
      isValid: false,
      validationErrors: [],
      exportedAt: null,
    });
  }

  updateDraft(plan: IdpPlanDraft): HttpResourceRef<IdpDraftResponse> {
    // Contract: PUT /api/v1/idp/draft (mock-backend/src/routes/idp.ts, openapi.yaml)
    return this.mutateResource<IdpDraftResponse, { plan: IdpPlanDraft }>(
      `${this.baseUrl}/idp/draft`,
      'PUT',
      () => ({ plan }),
      {
        stage: 'STAGE_4_REFINEMENT' as WorkflowStage,
        plan: { mainGoal: '', directions: [] },
        isValid: false,
        validationErrors: [],
        exportedAt: null,
      }
    );
  }

  // --- Export ---
  exportPlan(plan: IdpPlan): HttpResourceRef<ExportResponse> {
    return this.mutateResource<ExportResponse, ExportRequest>(
      `${this.baseUrl}/idp/export`,
      'POST',
      () => ({ plan }),
      { success: false, returnUrl: '' }
    );
  }

  // --- Chat / Assessment (mutations that trigger SSE) ---
  confirmPlan(plan?: IdpPlanDraft): HttpResourceRef<{
    stage: WorkflowStage;
    plan: IdpPlan;
    isValid: boolean;
    validationErrors: string[];
    priorities: Array<{ goal: string; rank: number; label: string }>;
  }> {
    return this.mutateResource<{
      stage: WorkflowStage;
      plan: IdpPlan;
      isValid: boolean;
      validationErrors: string[];
      priorities: Array<{ goal: string; rank: number; label: string }>;
    }, { plan?: IdpPlanDraft }>(
      `${this.baseUrl}/chat/confirm`,
      'POST',
      () => ({ plan }),
      {
        stage: 'STAGE_5_COMPLETED' as WorkflowStage,
        plan: { mainGoal: '', directions: [] },
        isValid: false,
        validationErrors: [],
        priorities: [],
      }
    );
  }

  // --- Mock Control (Dev only) ---
  setScenario(scenario: Scenario): HttpResourceRef<{ scenario: Scenario; stage: WorkflowStage; context: EmployeeContextResponse['context'] }> {
    return this.mutateResource<{ scenario: Scenario; stage: WorkflowStage; context: EmployeeContextResponse['context'] }, { scenario: Scenario }>(
      `${this.baseUrl.replace('/api/v1', '')}/mock/scenario`,
      'POST',
      () => ({ scenario }),
      { scenario: 'known_employee' as Scenario, stage: 'STAGE_1_CONTEXT' as WorkflowStage, context: {} as any }
    );
  }
}