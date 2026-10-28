// GitHub Pages shares this origin across repositories. Room authorization still
// requires the administrator's Bearer token; CORS is not an authorization check.
const PAGES_ORIGIN = 'https://jusiety.github.io';
const ALLOWED_METHODS = ['GET', 'POST', 'PUT'];
const ALLOWED_HEADERS = ['content-type', 'authorization'];

export function isAllowedRequestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin || origin === PAGES_ORIGIN;
}

function responseHeaders(request: Request, existing?: HeadersInit) {
  const headers = new Headers(existing);
  const vary = headers.get('Vary');
  if (!vary?.split(',').some(value => value.trim().toLowerCase() === 'origin')) {
    headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  }
  const origin = request.headers.get('origin');
  if (origin && isAllowedRequestOrigin(request)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

export async function withApiCors(request: Request, handle: () => Response | Promise<Response>) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return handle();

  if (!isAllowedRequestOrigin(request)) {
    return Response.json({ error: '허용된 사이트에서 요청해 주세요.' }, {
      status: 403,
      headers: responseHeaders(request, { 'Cache-Control': 'no-store' }),
    });
  }

  if (request.method === 'OPTIONS') {
    const method = request.headers.get('access-control-request-method');
    const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
      .split(',').map(header => header.trim().toLowerCase()).filter(Boolean);
    const permitted = request.headers.has('origin') && !!method && ALLOWED_METHODS.includes(method)
      && requestedHeaders.every(header => ALLOWED_HEADERS.includes(header));
    const headers = responseHeaders(request, { 'Cache-Control': 'no-store' });
    if (!permitted) return new Response(null, { status: 403, headers });
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return new Response(null, { status: 204, headers });
  }

  const response = await handle();
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(request, response.headers),
  });
}
