import { NextResponse } from "next/server";
import type { ApiError } from "@meeting-capture/shared";

/**
 * Build the uniform `{ error: { code, message } }` envelope (spec/api.md).
 * Every failing endpoint returns this shape with an appropriate HTTP status.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message } }, { status });
}
