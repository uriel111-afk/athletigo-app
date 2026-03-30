/**
 * AthletiGo Network Helpers
 * Graceful error handling for all API calls
 */

import { toast } from "sonner";

/**
 * Safe fetch wrapper with automatic error handling and retries
 * @param {Promise} promise - Axios promise to wrap
 * @param {Object} options - Configuration options
 * @param {Any} options.fallback - Fallback value on error
 * @param {Boolean} options.toastOnError - Show toast notification on error
 * @param {Number} options.retries - Number of retries on 500 errors
 * @param {Number} options.retryDelay - Delay between retries in ms
 * @returns {Promise<Any>} - Response data or fallback
 */
export async function safeFetch(
  promise, 
  { 
    fallback = null, 
    toastOnError = true, 
    retries = 1, 
    retryDelay = 400 
  } = {}
) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await promise;
      return res?.data ?? fallback;
    } catch (error) {
      lastError = error;
      
      const status = error?.response?.status;
      const isServerError = status >= 500 && status < 600;
      
      // Retry only on server errors (500-599)
      if (isServerError && attempt < retries) {
        console.warn(`[safeFetch] Server error (${status}), retrying (${attempt + 1}/${retries})...`);
        await sleep(retryDelay);
        continue;
      }
      
      // All retries exhausted or non-retriable error
      break;
    }
  }
  
  // Handle final error
  const status = lastError?.response?.status;
  const message = lastError?.message || "Unknown error";
  
  console.error("[safeFetch] Request failed:", {
    status,
    message,
    url: lastError?.config?.url
  });
  
  if (toastOnError) {
    if (status >= 500) {
      toast.error("תקלה בשרת. מציג נתונים אחרונים זמינים.", {
        duration: 4000
      });
    } else if (status === 404) {
      toast.error("המשאב לא נמצא", { duration: 3000 });
    } else if (status === 403) {
      toast.error("אין הרשאה לגשת למשאב זה", { duration: 3000 });
    } else if (status === 401) {
      toast.error("נדרשת התחברות מחדש", { duration: 3000 });
    } else {
      toast.error("שגיאת רשת. נסה שוב מאוחר יותר.", { duration: 3000 });
    }
  }
  
  return fallback;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe query wrapper for React Query with error boundaries
 * @param {Function} queryFn - Query function
 * @param {Any} fallback - Fallback value
 * @returns {Function} - Wrapped query function
 */
export function safeQueryFn(queryFn, fallback = null) {
  return async () => {
    try {
      const result = await queryFn();
      return result ?? fallback;
    } catch (error) {
      console.error("[safeQueryFn] Query failed:", error);
      return fallback;
    }
  };
}

/**
 * Create a safe mutation handler
 * @param {Function} mutationFn - Mutation function
 * @param {Object} options - Options
 * @returns {Function} - Wrapped mutation function
 */
export function safeMutationFn(mutationFn, { onError = null } = {}) {
  return async (variables) => {
    try {
      return await mutationFn(variables);
    } catch (error) {
      console.error("[safeMutationFn] Mutation failed:", error);
      
      if (onError) {
        onError(error);
      } else {
        toast.error("הפעולה נכשלה. נסה שוב.", { duration: 3000 });
      }
      
      throw error; // Re-throw for React Query to handle
    }
  };
}

/**
 * Check if online/offline
 */
export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Wait for online status
 */
export function waitForOnline(timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (isOnline()) {
      resolve(true);
      return;
    }
    
    const timeoutId = setTimeout(() => {
      window.removeEventListener("online", onlineHandler);
      reject(new Error("Timeout waiting for network"));
    }, timeout);
    
    const onlineHandler = () => {
      clearTimeout(timeoutId);
      window.removeEventListener("online", onlineHandler);
      resolve(true);
    };
    
    window.addEventListener("online", onlineHandler);
  });
}