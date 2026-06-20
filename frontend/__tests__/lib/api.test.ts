/**
 * api.test.ts — Tests for lib/api.ts
 *
 * All fetch() calls are mocked globally in jest.setup.js.
 * Tests cover: success, network error, non-200 response, edge cases.
 * streamActionPlan tests cover token callbacks, done callback, abort.
 */

import {
  fetchHeatmap,
  fetchIncidents,
  fetchAnomalyScores,
  fetchAnalytics,
  parseNLPDescription,
  predictIncident,
  submitFeedback,
  resetAnomalyReplay,
  fetchHeatmapReplay,
  resetHeatmapReplay,
  geocodeZone,
  streamActionPlan,
} from '@/lib/api';

// Helper to create a mock Response object
function mockResponse(body: any, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    body: null,
    headers: new Headers(),
  } as unknown as Response;
}

function mockStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let idx = 0;
  const readable = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx++]));
      } else {
        controller.close();
      }
    },
  });
  return {
    ok: true,
    status: 200,
    body: readable,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    json: () => Promise.reject(new Error('not JSON')),
  } as unknown as Response;
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchHeatmap
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchHeatmap', () => {
  it('returns heatmap data on success', async () => {
    const mockData = [{ lat: 12.9, lng: 77.6, weight: 1.5 }];
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockData));
    const result = await fetchHeatmap();
    expect(result).toEqual(mockData);
  });

  it('calls the correct endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse([]));
    await fetchHeatmap();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/heatmap'));
  });

  it('returns [] on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const result = await fetchHeatmap();
    expect(result).toEqual([]);
  });

  it('returns [] on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({}, 500));
    const result = await fetchHeatmap();
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchIncidents
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchIncidents', () => {
  const mockIncidents = [{ id: '1', lat: 12.9, lng: 77.6, priority: 'High' }];

  it('returns incidents on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockIncidents));
    const result = await fetchIncidents();
    expect(result).toEqual(mockIncidents);
  });

  it('calls correct endpoint without filters', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse([]));
    await fetchIncidents();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/incidents'));
  });

  it('appends zone filter to URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse([]));
    await fetchIncidents({ zone: 'Koramangala' });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('zone=Koramangala');
  });

  it('appends priority filter to URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse([]));
    await fetchIncidents({ priority: 'High' });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('priority=High');
  });

  it('appends event_type filter to URL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse([]));
    await fetchIncidents({ event_type: 'unplanned' });
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('event_type=unplanned');
  });

  it('returns [] on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Failed'));
    const result = await fetchIncidents();
    expect(result).toEqual([]);
  });

  it('returns [] on non-200 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({}, 503));
    const result = await fetchIncidents();
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchAnomalyScores
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchAnomalyScores', () => {
  const mockAnomalyData = {
    zones: [{ zone: 'Koramangala', alert_level: 'Normal', incident_count: 5 }],
    progress: { done: 100, total: 500, finished: false },
  };

  it('returns anomaly data on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockAnomalyData));
    const result = await fetchAnomalyScores();
    expect(result.zones).toHaveLength(1);
    expect(result.progress.done).toBe(100);
  });

  it('handles legacy array format gracefully', async () => {
    const legacyArray = [{ zone: 'Koramangala', alert_level: 'Normal' }];
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(legacyArray));
    const result = await fetchAnomalyScores();
    expect(result.zones).toEqual(legacyArray);
    expect(result.progress).toBeDefined();
  });

  it('returns empty zones on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Timeout'));
    const result = await fetchAnomalyScores();
    expect(result.zones).toEqual([]);
  });

  it('returns empty zones on non-200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({}, 503));
    const result = await fetchAnomalyScores();
    expect(result.zones).toEqual([]);
  });

  it('calls /anomaly endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockAnomalyData));
    await fetchAnomalyScores();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/anomaly'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchAnalytics
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchAnalytics', () => {
  const mockAnalytics = {
    volume_grid: [[1, 2]],
    top_junctions: [],
    corridor_durations: [],
    planned_vs_unplanned: [],
  };

  it('returns analytics data on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockAnalytics));
    const result = await fetchAnalytics();
    expect(result).toEqual(mockAnalytics);
  });

  it('returns null on error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const result = await fetchAnalytics();
    expect(result).toBeNull();
  });

  it('returns null on non-200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({}, 503));
    const result = await fetchAnalytics();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseNLPDescription
// ─────────────────────────────────────────────────────────────────────────────

describe('parseNLPDescription', () => {
  const mockNLPResult = {
    root_cause: 'vehicle_breakdown',
    vehicle_type: 'bmtc_bus',
    severity: 2,
    action_needed: true,
    normalized_summary: 'BMTC bus has broken down.',
  };

  it('returns parsed NLP result on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockNLPResult));
    const result = await parseNLPDescription('BMTC bus ketto nimdide');
    expect(result).toEqual(mockNLPResult);
  });

  it('sends POST request to /nlp-parse', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockNLPResult));
    await parseNLPDescription('test description');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/nlp-parse'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('includes description in request body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockNLPResult));
    await parseNLPDescription('my test description');
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.description).toBe('my test description');
  });

  it('includes optional model in request body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockNLPResult));
    await parseNLPDescription('test', 'llama-3.3-70b-versatile');
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('llama-3.3-70b-versatile');
  });

  it('does not include model if not provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockNLPResult));
    await parseNLPDescription('test');
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBeUndefined();
  });

  it('returns null on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('fail'));
    const result = await parseNLPDescription('test');
    expect(result).toBeNull();
  });

  it('returns null on non-200', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({}, 503));
    const result = await parseNLPDescription('test');
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// predictIncident
// ─────────────────────────────────────────────────────────────────────────────

describe('predictIncident', () => {
  const mockPrediction = {
    priority: 'High',
    confidence: 0.85,
    estimated_duration_minutes: 75,
    estimated_resolution_time: '2024-06-15T10:15:00',
  };

  it('returns prediction on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockPrediction));
    const result = await predictIncident({ event_cause: 'vehicle_breakdown' });
    expect(result).toEqual(mockPrediction);
  });

  it('sends POST to /predict', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockPrediction));
    await predictIncident({ event_cause: 'accident' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/predict'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns null on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const result = await predictIncident({});
    expect(result).toBeNull();
  });

  it('returns null on 503 response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({}, 503));
    const result = await predictIncident({});
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// submitFeedback
// ─────────────────────────────────────────────────────────────────────────────

describe('submitFeedback', () => {
  const feedbackPayload = {
    incident_context: { zone: 'Koramangala' },
    action_plan: 'Officers: 4 deployed.',
    rating: 'up' as const,
  };

  it('returns success response on POST', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ status: 'ok' }));
    const result = await submitFeedback(feedbackPayload);
    expect(result).toEqual({ status: 'ok' });
  });

  it('sends POST to /feedback', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ status: 'ok' }));
    await submitFeedback(feedbackPayload);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/feedback'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns null on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('fail'));
    const result = await submitFeedback(feedbackPayload);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetAnomalyReplay
// ─────────────────────────────────────────────────────────────────────────────

describe('resetAnomalyReplay', () => {
  it('returns reset data on success', async () => {
    const resetData = { zones: [], progress: { done: 0, total: 500, finished: false } };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(resetData));
    const result = await resetAnomalyReplay();
    expect(result?.progress.done).toBe(0);
  });

  it('sends POST to /anomaly/replay', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ zones: [], progress: {} }));
    await resetAnomalyReplay();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/anomaly/replay'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns null on error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('reset failed'));
    const result = await resetAnomalyReplay();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchHeatmapReplay
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchHeatmapReplay', () => {
  it('returns heatmap replay data on success', async () => {
    const data = [{ lat: 12.9, lng: 77.6, weight: 1.0 }];
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(data));
    const result = await fetchHeatmapReplay();
    expect(result).toEqual(data);
  });

  it('returns null on error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('fail'));
    const result = await fetchHeatmapReplay();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetHeatmapReplay
// ─────────────────────────────────────────────────────────────────────────────

describe('resetHeatmapReplay', () => {
  it('returns reset confirmation on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ status: 'reset' }));
    const result = await resetHeatmapReplay();
    expect(result).toBeDefined();
  });

  it('sends POST to /heatmap/replay', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ status: 'reset' }));
    await resetHeatmapReplay();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/heatmap/replay'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// geocodeZone
// ─────────────────────────────────────────────────────────────────────────────

describe('geocodeZone', () => {
  it('returns high confidence result on success', async () => {
    const mockData = { confidence: 'high', lat: 12.9, lng: 77.6, resolved_name: 'Koramangala, Bengaluru' };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockData));
    const result = await geocodeZone('Koramangala');
    expect(result.confidence).toBe('high');
    expect(result.lat).toBe(12.9);
  });

  it('returns ambiguous result with candidates', async () => {
    const mockData = { confidence: 'ambiguous', candidates: [{ name: 'Place A', lat: 12.9, lng: 77.6 }] };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(mockData));
    const result = await geocodeZone('near old airport');
    expect(result.confidence).toBe('ambiguous');
    expect(result.candidates).toBeDefined();
  });

  it('returns failed confidence on network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const result = await geocodeZone('some place');
    expect(result.confidence).toBe('failed');
  });

  it('sends POST to /geocode-zone', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ confidence: 'failed', message: 'test' }));
    await geocodeZone('Koramangala');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/geocode-zone'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('includes zone in request body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ confidence: 'failed', message: 'test' }));
    await geocodeZone('Whitefield');
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.zone).toBe('Whitefield');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// streamActionPlan
// ─────────────────────────────────────────────────────────────────────────────

describe('streamActionPlan', () => {
  it('calls onToken for each SSE data token', async () => {
    const chunks = [
      'data: Officers: 4 deployed\n\n',
      'data: Barricades: 3 set\n\n',
      'data: [DONE]\n\n',
    ];
    (global.fetch as jest.Mock).mockResolvedValue(mockStreamResponse(chunks));

    const tokens: string[] = [];
    const onToken = jest.fn((t: string) => tokens.push(t));
    const onDone = jest.fn();
    const onError = jest.fn();

    await streamActionPlan({}, onToken, onDone, onError);

    expect(onToken).toHaveBeenCalledWith('Officers: 4 deployed');
    expect(onToken).toHaveBeenCalledWith('Barricades: 3 set');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onDone when [DONE] sentinel is received', async () => {
    const chunks = ['data: Some text\n\n', 'data: [DONE]\n\n'];
    (global.fetch as jest.Mock).mockResolvedValue(mockStreamResponse(chunks));

    const onDone = jest.fn();
    await streamActionPlan({}, jest.fn(), onDone, jest.fn());
    expect(onDone).toHaveBeenCalled();
  });

  it('calls onError on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Stream connection failed'));

    const onError = jest.fn();
    await streamActionPlan({}, jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalled();
  });

  it('does not call onError for AbortError', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    const onError = jest.fn();
    await streamActionPlan({}, jest.fn(), jest.fn(), onError);
    expect(onError).not.toHaveBeenCalled();
  });

  it('sends POST with correct headers', async () => {
    const chunks = ['data: [DONE]\n\n'];
    (global.fetch as jest.Mock).mockResolvedValue(mockStreamResponse(chunks));

    await streamActionPlan({ zone: 'Koramangala' }, jest.fn(), jest.fn(), jest.fn());

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/action-plan'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('includes body fields in request', async () => {
    const chunks = ['data: [DONE]\n\n'];
    (global.fetch as jest.Mock).mockResolvedValue(mockStreamResponse(chunks));

    await streamActionPlan({ zone: 'Whitefield', priority: 'High' }, jest.fn(), jest.fn(), jest.fn());

    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.zone).toBe('Whitefield');
    expect(body.priority).toBe('High');
  });

  it('calls onDone when stream ends without [DONE]', async () => {
    // Stream that ends naturally without [DONE]
    const chunks = ['data: Some partial text\n\n'];
    (global.fetch as jest.Mock).mockResolvedValue(mockStreamResponse(chunks));

    const onDone = jest.fn();
    await streamActionPlan({}, jest.fn(), onDone, jest.fn());
    expect(onDone).toHaveBeenCalled();
  });
});
