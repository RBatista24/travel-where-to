'use client';

import { api } from '@/lib/api';
import { useAction, useResource } from './use-resource';

export const useSearchResult = (searchId: string | null) =>
    useResource(searchId ? `search:${searchId}` : null, () => api.getSearch(searchId ?? ''));
export const useRecentSearches = () => useResource('recent-searches', api.recentSearches);
export const useDestinations = () => useResource('destinations', api.destinations);
export const useRunSearch = () => useAction(api.search);
export const useInterpret = () => useAction(api.interpret);
