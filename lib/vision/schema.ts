import { z } from 'zod';

export const checkItemResultSchema = z.object({
  item: z.string().min(1),
  result: z.enum(['ok', 'ng']),
  reason: z.string().min(1)
});

export const visionCheckResultSchema = z.object({
  checks: z.array(checkItemResultSchema),
  overall: z.enum(['ok', 'ng', 'error']),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.any()).optional().default([]),
  misses: z.array(z.any()).optional().default([])
});

export type VisionCheckResult = z.infer<typeof visionCheckResultSchema>;

export const visionResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['checks', 'overall', 'summary', 'confidence'],
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item', 'result', 'reason'],
        properties: {
          item: { type: 'string' },
          result: { type: 'string', enum: ['ok', 'ng'] },
          reason: { type: 'string' }
        }
      }
    },
    overall: { type: 'string', enum: ['ok', 'ng', 'error'] },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
} as const;
