import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

const REQUIRED_PATHS = [
  '/api/v1/session/context',
  '/api/v1/session/context/manual',
  '/api/v1/chat/init-assessment',
  '/api/v1/chat/generate-draft',
  '/api/v1/chat/dialog',
  '/api/v1/chat/refine-draft',
  '/api/v1/chat/confirm',
  '/api/v1/idp/draft',
  '/api/v1/idp/export',
  '/api/v1/idp/dictionaries',
  '/mock/state',
  '/mock/scenario',
  '/mock/reset',
];

describe('openapi.yaml', () => {
  const spec = parse(readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf8')) as OpenApiDocument;

  it('валиден как OpenAPI 3.1', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths).toBeTypeOf('object');
  });

  it('описывает все эндпоинты мока', () => {
    for (const path of REQUIRED_PATHS) {
      expect(Object.keys(spec.paths)).toContain(path);
    }
  });

  it('описывает ключевые схемы контракта', () => {
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas).toEqual(
      expect.arrayContaining([
        'EmployeeContext',
        'IdpPlan',
        'IdpDirection',
        'IdpTask',
        'IdpExportRequest',
        'IdpExportResponse',
        'WorkflowStage',
      ]),
    );
  });
});
