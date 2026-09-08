export const GEMINI_MODEL_OPTIONS = [
  { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-flash-latest", label: "Gemini Flash (mais recente)" },
] as const;

export const GEMINI_TEXT_MODELS = GEMINI_MODEL_OPTIONS.map((model) => model.value);
