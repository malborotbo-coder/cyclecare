import { type Request, type Response, type NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";

export type ErrorCode = "VALIDATION_ERROR" | "UNAUTHORIZED" | "NOT_FOUND" | "SERVER_ERROR";
export type Language = "ar" | "en";

type FieldError = { field: string; message: string };

const errorMessages: Record<Language, Record<ErrorCode, string>> = {
  en: {
    VALIDATION_ERROR: "Please check the highlighted fields.",
    UNAUTHORIZED: "You are not authorized to perform this action.",
    NOT_FOUND: "The requested resource was not found.",
    SERVER_ERROR: "Something went wrong. Please try again.",
  },
  ar: {
    VALIDATION_ERROR: "الرجاء التحقق من الحقول المحددة.",
    UNAUTHORIZED: "غير مصرح لك بتنفيذ هذا الإجراء.",
    NOT_FOUND: "المورد المطلوب غير موجود.",
    SERVER_ERROR: "حدث خطأ، يرجى المحاولة مرة أخرى.",
  },
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  errors?: FieldError[];

  constructor(params: { code: ErrorCode; status: number; message?: string; errors?: FieldError[] }) {
    super(params.message);
    this.code = params.code;
    this.status = params.status;
    this.errors = params.errors;
  }
}

function resolveLanguage(lang?: string | null): Language {
  if (lang === "en" || lang === "ar") return lang;
  return "ar";
}

export function getRequestLang(req?: Request | null): Language {
  const headerLang =
    (req?.headers?.["x-lang"] as string | undefined) ||
    (req?.headers?.["accept-language"] as string | undefined);
  if (headerLang?.toLowerCase().startsWith("en")) return "en";
  if (headerLang?.toLowerCase().startsWith("ar")) return "ar";
  return "ar";
}

export function formatZodErrors(error: ZodError, lang: Language): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "field",
    message: issue.message || errorMessages[lang].VALIDATION_ERROR,
  }));
}

export function validationErrorFromZod(error: ZodError, lang: Language): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    status: 400,
    message: errorMessages[lang].VALIDATION_ERROR,
    errors: formatZodErrors(error, lang),
  });
}

export function validateSchema<T>(schema: ZodSchema<T>, data: unknown, langSource?: Request | Language): T {
  const lang = langSource && "headers" in (langSource as any)
    ? getRequestLang(langSource as Request)
    : resolveLanguage(langSource as string | undefined);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw validationErrorFromZod(parsed.error, lang);
  }
  return parsed.data;
}

function statusToCode(status: number): ErrorCode {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  return "SERVER_ERROR";
}

export function normalizeErrorBody(
  statusCode: number,
  body: any,
  lang: Language,
): { code: ErrorCode; message: string; errors?: FieldError[] } {
  if (body?.code) return body;
  const code = statusToCode(statusCode);
  const errors: FieldError[] | undefined = Array.isArray(body?.errors)
    ? body.errors.map((e: any) => ({
        field: e.field || e.path || "field",
        message: e.message || errorMessages[lang].VALIDATION_ERROR,
      }))
    : undefined;
  const message =
    errorMessages[lang][code] ||
    (typeof body?.message === "string" && body.message) ||
    errorMessages[lang].SERVER_ERROR;
  return { code, message, ...(errors ? { errors } : {}) };
}

export function handleRouteError(error: any, req: Request, res: Response) {
  const lang = getRequestLang(req);

  if (error instanceof AppError) {
    return res
      .status(error.status)
      .json(normalizeErrorBody(error.status, { code: error.code, message: error.message, errors: error.errors }, lang));
  }

  if (error instanceof ZodError) {
    const validation = validationErrorFromZod(error, lang);
    return res
      .status(validation.status)
      .json(normalizeErrorBody(validation.status, { code: validation.code, errors: validation.errors }, lang));
  }

  return null;
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const lang = getRequestLang(req);

  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json(normalizeErrorBody(err.status, { code: err.code, message: err.message, errors: err.errors }, lang));
  }

  if (err instanceof ZodError) {
    const validation = validationErrorFromZod(err, lang);
    return res
      .status(validation.status)
      .json(normalizeErrorBody(validation.status, { code: validation.code, errors: validation.errors }, lang));
  }

  console.error("[Server] Error:", err?.message || err);
  const status = err?.status || 500;
  const code = statusToCode(status);
  const message = errorMessages[lang][code];
  return res
    .status(status)
    .json(normalizeErrorBody(status, { code, message }, lang));
}
