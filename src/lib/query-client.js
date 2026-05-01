import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5,  // 5 minutes — data fresh, no refetch on remount
			gcTime: 1000 * 60 * 10,    // 10 min garbage collection
			retry: 1,
		},
	},
});