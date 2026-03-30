/**
 * AthletiGo Configuration Manager
 * Single source of truth - uses window.__ATH_CONFIG__ for runtime values
 * All functions use NAMED PARAMETERS for Base44 compatibility
 */

// Initialize global config ONCE at bootstrap
if (typeof window !== "undefined" && !window.__ATH_CONFIG__) {
  window.__ATH_CONFIG__ = (function initConfig(globals) {
    const DEFAULTS = {
      Theme: "light",
      RTL: true,
      Colors: {
        Background: "#FFFFFF",
        Text: "#000000",
        Accent: "#FF6F20",
        AccentLight: "#FFF8F3",
        AccentDark: "#E65E10",
        Gray: "#7D7D7D",
        GrayLight: "#F7F7F7",
        GrayDark: "#4A4A4A",
        Border: "#E0E0E0",
        Success: "#00C851",
        SuccessLight: "#F0F9F0",
        Error: "#D32F2F",
        ErrorLight: "#FFEBEE",
        Warning: "#FF9800",
        WarningLight: "#FFF3E0",
        Info: "#2196F3",
        InfoLight: "#E3F2FD"
      },
      Fonts: {
        Body: "'Heebo', 'Assistant', sans-serif",
        Heading: "'Montserrat', 'Heebo', 'Assistant', sans-serif"
      },
      RealTimeSync: true,
      RealTimeSyncInterval: 3000,
      NotificationsEnabled: true,
      SafeMode: false,
      Debug: false,
      ActiveUserMode: "A",
      FallbackMode: "Moderate",
      SessionTimeout: 3600000,
      CancellationWindow: 24,
      DiscountWindowDays: 3,
      CacheTTLms: 60000,
      PageSize: 25,
      MaxUploadSizeMB: 10,
      QueryRetries: 2,
      RetryDelayMs: 300,
      // CRITICAL: Always null to prevent crashes
      Preprocessors: null,
      DataTransforms: null,
      CustomValidators: null,
      Features: {
        WhatsAppIntegration: false,
        AdvancedMetrics: true,
        GoalTracking: true,
        FinancialReporting: true,
        SectionTemplates: true,
        ComboExercises: true
      },
      UI: {
        AnimationsEnabled: true,
        CompactMode: false,
        ShowTips: true,
        DefaultView: "grid"
      }
    };

    const src = (globals && typeof globals === "object") ? globals : {};
    
    // Shallow merge
    const merged = { ...DEFAULTS, ...src };
    
    // Deep merge nested objects
    merged.Colors = { ...DEFAULTS.Colors, ...(src.Colors || {}) };
    merged.Fonts = { ...DEFAULTS.Fonts, ...(src.Fonts || {}) };
    merged.Features = { ...DEFAULTS.Features, ...(src.Features || {}) };
    merged.UI = { ...DEFAULTS.UI, ...(src.UI || {}) };
    
    // CRITICAL: Ensure no preprocessors from globals
    merged.Preprocessors = null;
    merged.DataTransforms = null;
    merged.CustomValidators = null;
    
    return merged;
  })(typeof window !== "undefined" ? window.globals : {});
}

/**
 * Get configuration value by path with optional fallback
 * @param {Object} params - Named parameters
 * @param {String} params.path - Dot-separated path (e.g., "Colors.Accent")
 * @param {Any} params.fallback - Fallback value if path not found
 * @returns {Any} - Configuration value or fallback
 */
export function Config_get({ path, fallback } = {}) {
  try {
    if (!path) return fallback ?? null;
    
    const parts = String(path).split(".");
    let current = (typeof window !== "undefined" && window.__ATH_CONFIG__) || {};
    
    for (const part of parts) {
      if (current && Object.prototype.hasOwnProperty.call(current, part)) {
        current = current[part];
      } else {
        return fallback !== undefined ? fallback : null;
      }
    }
    
    return current ?? (fallback !== undefined ? fallback : null);
    
  } catch (error) {
    console.error("[Config_get] Error accessing path:", path, error);
    return fallback !== undefined ? fallback : null;
  }
}

/**
 * Safe preprocessor wrapper - NEVER CRASHES
 * @param {Object} params - Named parameters
 * @param {Function} params.fn - Preprocessing function (can be null/undefined)
 * @param {Any} params.value - Value to preprocess
 * @param {Object} params.context - Optional context
 * @returns {Any} - Preprocessed value or original value
 */
export function safePreprocess({ fn, value, context = {} } = {}) {
  try {
    if (typeof fn === "function") {
      return fn(value, context);
    }
    return value; // pass-through if not a function
  } catch (error) {
    console.error("[safePreprocess] Error in preprocessor:", error);
    return value; // fail-soft: return original value
  }
}

/**
 * Get a specific color value
 * @param {Object} params - Named parameters
 * @param {String} params.colorName - Color name (e.g., "Accent")
 * @returns {String} - Color hex value
 */
export function Config_getColor({ colorName }) {
  const defaultColors = {
    Background: "#FFFFFF",
    Text: "#000000",
    Accent: "#FF6F20",
    AccentLight: "#FFF8F3",
    AccentDark: "#E65E10",
    Gray: "#7D7D7D",
    GrayLight: "#F7F7F7",
    Border: "#E0E0E0",
    Success: "#00C851",
    Error: "#D32F2F",
    Warning: "#FF9800",
    Info: "#2196F3"
  };
  
  return Config_get({ 
    path: `Colors.${colorName}`, 
    fallback: defaultColors[colorName] || "#000000" 
  });
}

/**
 * Get all colors as an object
 * @returns {Object} - Colors object
 */
export function Config_getColors() {
  return Config_get({ 
    path: "Colors", 
    fallback: {
      Background: "#FFFFFF",
      Text: "#000000",
      Accent: "#FF6F20",
      AccentLight: "#FFF8F3",
      Gray: "#7D7D7D",
      Border: "#E0E0E0"
    }
  });
}

/**
 * Check if a feature is enabled
 * @param {Object} params - Named parameters
 * @param {String} params.featureName - Feature name
 * @returns {Boolean}
 */
export function Config_isFeatureEnabled({ featureName }) {
  return Config_get({ path: `Features.${featureName}`, fallback: false }) === true;
}

/**
 * Validate and sanitize input
 * @param {Object} params - Named parameters
 * @param {Any} params.value - Input value
 * @param {String} params.type - Expected type
 * @param {Any} params.defaultValue - Default if invalid
 * @returns {Any} - Validated value
 */
export function Config_safeValue({ value, type = "string", defaultValue = null } = {}) {
  try {
    switch (type) {
      case "string":
        return value != null ? String(value).trim() : (defaultValue || "");
      case "number":
        const num = Number(value);
        return !isNaN(num) && isFinite(num) ? num : (defaultValue || 0);
      case "boolean":
        return value != null ? Boolean(value) : (defaultValue || false);
      case "array":
        return Array.isArray(value) ? value : (defaultValue || []);
      case "object":
        return value && typeof value === "object" && !Array.isArray(value) ? value : (defaultValue || {});
      default:
        return value ?? defaultValue;
    }
  } catch {
    return defaultValue;
  }
}

/**
 * Export runtime config for inspection
 */
export function Config_inspect() {
  return typeof window !== "undefined" && window.__ATH_CONFIG__ 
    ? { ...window.__ATH_CONFIG__ } 
    : {};
}

/**
 * Reset config (for testing)
 */
export function Config_reset() {
  if (typeof window !== "undefined") {
    delete window.__ATH_CONFIG__;
    // Re-initialize will happen automatically
  }
}