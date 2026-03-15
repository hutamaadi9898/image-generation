export type PrimitivePayload = Record<string, FormDataEntryValue | string | string[] | number | null>;

export async function readRequestPayload(request: Request): Promise<PrimitivePayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as PrimitivePayload;
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  return {};
}

export function asString(value: PrimitivePayload[string], fallback = ""): string {
  if (Array.isArray(value)) {
    return String(value[0] ?? fallback);
  }

  return String(value ?? fallback).trim();
}

export function asInteger(value: PrimitivePayload[string], fallback = 0): number {
  const parsed = Number.parseInt(asString(value, String(fallback)), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asNumber(value: PrimitivePayload[string], fallback = 0): number {
  const parsed = Number.parseFloat(asString(value, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asSeeds(value: PrimitivePayload[string], fallbackCount: number): number[] {
  const raw = asString(value);
  if (!raw) {
    return Array.from({ length: fallbackCount }, () => Math.floor(Math.random() * 1_000_000));
  }

  return raw
    .split(/[,\s]+/)
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item));
}
