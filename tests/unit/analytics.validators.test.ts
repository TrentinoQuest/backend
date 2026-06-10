import { describe, it, expect } from 'vitest';
import { AnalyticsGranularity } from '@trentino-quest/shared-types';
import {
  completionsOverTimeQuerySchema,
  heatmapQuerySchema,
  limitQuerySchema,
} from '../../src/modules/analytics/validators/analytics.validators';

describe('completionsOverTimeQuerySchema', () => {
  it('accetta un oggetto vuoto (tutti i campi opzionali)', () => {
    const result = completionsOverTimeQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accetta from e to come stringhe ISO valide', () => {
    const result = completionsOverTimeQuerySchema.safeParse({
      from: '2025-01-01T00:00:00.000Z',
      to: '2025-01-31T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBeInstanceOf(Date);
      expect(result.data.to).toBeInstanceOf(Date);
    }
  });

  it('accetta tutti i valori validi di AnalyticsGranularity', () => {
    for (const gran of Object.values(AnalyticsGranularity)) {
      const result = completionsOverTimeQuerySchema.safeParse({ granularity: gran });
      expect(result.success).toBe(true);
    }
  });

  it('rifiuta una granularity non valida', () => {
    const result = completionsOverTimeQuerySchema.safeParse({ granularity: 'year' });
    expect(result.success).toBe(false);
  });

  it('rifiuta campi extra (strict)', () => {
    const result = completionsOverTimeQuerySchema.safeParse({ extraField: 'value' });
    expect(result.success).toBe(false);
  });

  it('rifiuta from successivo a to', () => {
    const result = completionsOverTimeQuerySchema.safeParse({
      from: '2025-02-01T00:00:00.000Z',
      to: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('accetta from uguale a to', () => {
    const result = completionsOverTimeQuerySchema.safeParse({
      from: '2025-01-15T00:00:00.000Z',
      to: '2025-01-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accetta solo from senza to', () => {
    const result = completionsOverTimeQuerySchema.safeParse({
      from: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('heatmapQuerySchema', () => {
  it('accetta un oggetto vuoto', () => {
    const result = heatmapQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rifiuta from successivo a to', () => {
    const result = heatmapQuerySchema.safeParse({
      from: '2025-06-01T00:00:00.000Z',
      to: '2025-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rifiuta campi extra (strict)', () => {
    const result = heatmapQuerySchema.safeParse({ granularity: 'day' });
    expect(result.success).toBe(false);
  });

  it('accetta from e to validi', () => {
    const result = heatmapQuerySchema.safeParse({
      from: '2025-03-01T00:00:00.000Z',
      to: '2025-06-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('limitQuerySchema', () => {
  it("usa il default di 10 quando limit non e' specificato", () => {
    const result = limitQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('fa il coerce da stringa a numero', () => {
    const result = limitQuerySchema.safeParse({ limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('accetta il valore minimo (1)', () => {
    const result = limitQuerySchema.safeParse({ limit: 1 });
    expect(result.success).toBe(true);
  });

  it('accetta il valore massimo (100)', () => {
    const result = limitQuerySchema.safeParse({ limit: 100 });
    expect(result.success).toBe(true);
  });

  it('rifiuta limit minore di 1', () => {
    const result = limitQuerySchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rifiuta limit maggiore di 100', () => {
    const result = limitQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('rifiuta un valore decimale', () => {
    const result = limitQuerySchema.safeParse({ limit: 5.5 });
    expect(result.success).toBe(false);
  });

  it('rifiuta campi extra (strict)', () => {
    const result = limitQuerySchema.safeParse({ limit: 10, extra: true });
    expect(result.success).toBe(false);
  });
});
