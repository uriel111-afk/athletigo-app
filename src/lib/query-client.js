import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
			staleTime: 1000 * 60, // 60 seconds — data fresh for 1 min
			gcTime: 1000 * 60 * 10, // 10 min garbage collection
			retry: 1,
		},
	},
});