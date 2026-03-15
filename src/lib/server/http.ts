export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

export function badRequest(message: string, issues: string[] = []): Response {
  return json(
    {
      ok: false,
      message,
      issues
    },
    { status: 400 }
  );
}

export function created(data: unknown): Response {
  return json(data, { status: 201 });
}
