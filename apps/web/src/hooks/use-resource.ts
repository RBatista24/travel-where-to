'use client';

import * as React from 'react';

export type ResourceState<T> =
    | { status: 'loading'; data?: undefined; error?: undefined }
    | { status: 'success'; data: T; error?: undefined }
    | { status: 'error'; data?: undefined; error: unknown };

/** Loads data for a key and reloads when the key changes. Pass `null` to skip. */
export function useResource<T>(
    key: string | null,
    load: () => Promise<T>,
): ResourceState<T> & { reload: () => void } {
    const [state, setState] = React.useState<ResourceState<T>>({ status: 'loading' });
    const [nonce, setNonce] = React.useState(0);
    const loadRef = React.useRef(load);
    loadRef.current = load;

    React.useEffect(() => {
        if (key === null) return;
        let cancelled = false;
        setState({ status: 'loading' });
        loadRef.current().then(
            (data) => !cancelled && setState({ status: 'success', data }),
            (error: unknown) => !cancelled && setState({ status: 'error', error }),
        );
        return () => {
            cancelled = true;
        };
    }, [key, nonce]);

    return { ...state, reload: () => setNonce((n) => n + 1) };
}

/** Runs a user-triggered action (submit, interpret) and tracks its state. */
export function useAction<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
    const [state, setState] = React.useState<{
        status: 'idle' | 'running' | 'success' | 'error';
        data?: T;
        error?: unknown;
    }>({ status: 'idle' });
    const run = React.useCallback(
        async (...args: A): Promise<T | undefined> => {
            setState({ status: 'running' });
            try {
                const data = await fn(...args);
                setState({ status: 'success', data });
                return data;
            } catch (error) {
                setState({ status: 'error', error });
                return undefined;
            }
        },
        [fn],
    );
    const reset = React.useCallback(() => setState({ status: 'idle' }), []);
    return { ...state, run, reset };
}
