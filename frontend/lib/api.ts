const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchHeatmap() {
    try {
        const response = await fetch(`${API_BASE_URL}/heatmap`);
        if (!response.ok) throw new Error('Failed to fetch heatmap data');
        return await response.json();
    } catch (error) {
        console.error(error);
        return [];
    }
}

export async function fetchIncidents(params: { zone?: string, priority?: string, event_type?: string } = {}) {
    try {
        const queryParams = new URLSearchParams();
        if (params.zone) queryParams.append('zone', params.zone);
        if (params.priority) queryParams.append('priority', params.priority);
        if (params.event_type) queryParams.append('event_type', params.event_type);
        
        const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
        const response = await fetch(`${API_BASE_URL}/incidents${queryString}`);
        if (!response.ok) throw new Error('Failed to fetch incidents');
        return await response.json();
    } catch (error) {
        console.error(error);
        return [];
    }
}

export async function fetchAnomalyScores() {
    try {
        const response = await fetch(`${API_BASE_URL}/anomaly`);
        if (!response.ok) throw new Error('Failed to fetch anomaly scores');
        return await response.json();
    } catch (error) {
        console.error(error);
        return [];
    }
}

export async function fetchAnalytics() {
    try {
        const response = await fetch(`${API_BASE_URL}/analytics`);
        if (!response.ok) throw new Error('Failed to fetch analytics');
        return await response.json();
    } catch (error) {
        console.error("Analytics endpoint might not exist, using local mock data.", error);
        return null;
    }
}

export async function parseNLPDescription(description: string) {
    try {
        const response = await fetch(`${API_BASE_URL}/nlp-parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        if (!response.ok) throw new Error('Failed to parse NLP description');
        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
}

export async function predictIncident(features: any) {
    try {
        const response = await fetch(`${API_BASE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(features)
        });
        if (!response.ok) throw new Error('Failed to predict incident');
        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
}

export async function submitFeedback(feedback: { incident_context: any, action_plan: string, rating: 'up' | 'down' }) {
    try {
        const response = await fetch(`${API_BASE_URL}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(feedback)
        });
        if (!response.ok) throw new Error('Failed to submit feedback');
        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
}

export async function resetAnomalyReplay() {
    try {
        const response = await fetch(`${API_BASE_URL}/anomaly/replay`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to reset anomaly replay');
        return await response.json();
    } catch (error) {
        console.error(error);
        return null;
    }
}

/**
 * Streams an LLM action plan from POST /action-plan using fetch + ReadableStream.
 *
 * Why fetch instead of EventSource:
 *   - EventSource is GET-only (HTML spec). Long addresses/NLP summaries silently
 *     truncate at the ~2048-char URL limit.
 *   - fetch supports POST with a JSON body of arbitrary size, custom headers
 *     (auth, correlation IDs), and AbortController for clean React cleanup.
 *
 * The server emits standard SSE lines ("data: <token>\n\n"). We parse them from
 * the raw byte stream and invoke the provided callbacks.
 *
 * @param body      - Full incident + prediction context (ActionPlanRequest shape).
 * @param onToken   - Called for each text token as it arrives.
 * @param onDone    - Called once when the stream ends cleanly ([DONE] sentinel or EOF).
 * @param onError   - Called on network or parse errors (not called on AbortError).
 * @param signal    - Optional AbortSignal; pass AbortController.signal for cleanup.
 */
export async function streamActionPlan(
    body: Record<string, any>,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: Error) => void,
    signal?: AbortSignal,
): Promise<void> {
    try {
        const response = await fetch(`${API_BASE_URL}/action-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok || !response.body) {
            throw new Error(`Action plan request failed: ${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode incrementally; `stream: true` keeps the TextDecoder state
            // across chunks so multi-byte characters are never split mid-codepoint.
            buffer += decoder.decode(value, { stream: true });

            // SSE lines end with \n\n (event boundary). Split on single \n so we
            // can detect the "data: " prefix on each individual line.
            const lines = buffer.split('\n');
            // The last element is either empty (after a complete \n) or an
            // incomplete line — hold it in the buffer until the next chunk.
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;

                const data = trimmed.slice(5).trim(); // strip "data:" prefix
                if (data === '[DONE]') {
                    onDone();
                    return;
                }
                if (data) onToken(data);
            }
        }

        // Stream ended without a [DONE] sentinel — still signal completion.
        onDone();
    } catch (err) {
        // AbortError is normal React cleanup (component unmount / panel close).
        // Suppress it so we don't log spurious errors on every panel close.
        if ((err as Error).name !== 'AbortError') {
            onError(err as Error);
        }
    }
}
