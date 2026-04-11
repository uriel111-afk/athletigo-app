import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
			staleTime: 1000 * 30, // 30 seconds — data considered fresh for 30s
			retry: 1,
		},
	},
});