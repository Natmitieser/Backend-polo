/**
 * Polo Core API — CORS & Security Helpers
 * 
 * Handles Cross-Origin Resource Sharing for the separated frontend.
 * Also adds security headers to all responses.
 */
import { NextResponse } from 'next/server';

/**
 * Get allowed origins from environment.
 */
function getAllowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
    return origins.split(',').map(o => o.trim());
}

/**
 * Check if the request origin is allowed.
 */
function isOriginAllowed(origin: string | null): boolean {
    if (!origin) return false;
    const allowed = getAllowedOrigins();
    return allowed.includes(origin) || allowed.includes('*');
}

/**
 * Add CORS and security headers to a response.
 */
export function withCors(response: NextResponse, request: Request): NextResponse {
    const origin = request.headers.get('Origin');

    if (origin && isOriginAllowed(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400'); // Cache preflight for 24h

    // Security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

/**
 * Handle CORS preflight (OPTIONS) request.
 */
export function handlePreflight(request: Request): NextResponse {
    const response = new NextResponse(null, { status: 204 });
    return withCors(response, request);
}

/**
 * Create a JSON response with CORS headers.
 */
export function jsonResponse(
    data: Record<string, unknown>,
    request: Request,
    status: number = 200
): NextResponse {
    const response = NextResponse.json(data, { status });
    return withCors(response, request);
}

/**
 * Create an error response with CORS headers.
 */
export function errorResponse(
    error: string,
    request: Request,
    status: number = 500
): NextResponse {
    return jsonResponse({ error }, request, status);
}
