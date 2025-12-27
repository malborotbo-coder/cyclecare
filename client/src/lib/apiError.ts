import { type Language } from "@/lib/i18n";

export type FieldError = { field: string; message: string };
export type ApiErrorResponse = {
  code?: string;
  message?: string;
  errors?: FieldError[];
};

const defaultMessages: Record<Language, Record<string, string>> = {
  en: {
    VALIDATION_ERROR: "Please check the highlighted fields.",
    UNAUTHORIZED: "You are not authorized to perform this action.",
    NOT_FOUND: "The requested item was not found.",
    SERVER_ERROR: "Something went wrong. Please try again.",
  },
  ar: {
    VALIDATION_ERROR: "يرجى التحقق من الحقول المحددة.",
    UNAUTHORIZED: "غير مصرح لك بتنفيذ هذا الإجراء.",
    NOT_FOUND: "العنصر المطلوب غير موجود.",
    SERVER_ERROR: "حدث خطأ، يرجى المحاولة مرة أخرى.",
  },
};

export class ApiError extends Error {
  code: string;
  status?: number;
  errors?: FieldError[];
  raw?: any;
  fieldErrorsMap?: Record<string, string>;

  constructor(params: {
    code: string;
    status?: number;
    message?: string;
    errors?: FieldError[];
    raw?: any;
    lang: Language;
  }) {
    const fallback = getDefaultMessage(params.code, params.lang);
    const baseMessage = params.message || fallback;
    super(`${baseMessage} (${params.code})`);
    this.code = params.code;
    this.status = params.status;
    this.errors = params.errors;
    this.raw = params.raw;
    this.fieldErrorsMap = fieldErrorsToMap(params.errors);
  }
}

function mapStatusToCode(status?: number): string {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  return "SERVER_ERROR";
}

export function getDefaultMessage(code: string, lang: Language): string {
  return defaultMessages[lang][code] || defaultMessages[lang].SERVER_ERROR;
}

export function fieldErrorsToMap(errors?: FieldError[]): Record<string, string> {
  if (!errors?.length) return {};
  return errors.reduce<Record<string, string>>((acc, curr) => {
    if (curr.field) acc[curr.field] = curr.message;
    return acc;
  }, {});
}

function normalizeFieldErrors(errors: any[], lang: Language): FieldError[] | undefined {
  if (!Array.isArray(errors)) return undefined;
  return errors.map((e) => ({
    field: e?.field || e?.path || "field",
    message: e?.message || defaultMessages[lang].VALIDATION_ERROR,
  }));
}

export function buildApiError(payload: ApiErrorResponse | null, status: number | undefined, lang: Language): ApiError {
  const code = payload?.code || mapStatusToCode(status);
  const errors = normalizeFieldErrors(payload?.errors || [], lang);
  return new ApiError({
    code,
    status,
    errors,
    raw: payload,
    lang,
    message: payload?.message,
  });
}

export function ensureApiError(error: any, lang: Language): ApiError {
  if (error instanceof ApiError) return error;
  if (error?.code) {
    return new ApiError({
      code: error.code,
      status: error.status,
      errors: error.errors,
      raw: error,
      lang,
      message: error.message,
    });
  }
  return new ApiError({
    code: "SERVER_ERROR",
    status: error?.status,
    raw: error,
    lang,
    message: error?.message,
  });
}
