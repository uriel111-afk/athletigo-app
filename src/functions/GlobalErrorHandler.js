/**
 * safeFetch — awaits a promise and returns its value.
 * On error, logs the context and returns the provided fallback instead of throwing.
 *
 * Usage:
 *   const data = await safeFetch(someAsyncCall(), { fallback: [], context: 'MyComponent' });
 */
export async function safeFetch(promise, { fallback = null, context = '' } = {}) {
  try {
    return await promise;
  } catch (err) {
    console.error(`[safeFetch]${context ? ` [${context}]` : ''} error:`, err);
    return fallback;
  }
}
