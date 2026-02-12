/**
 * GET /api/v1/health
 * 
 * Public endpoint — no auth required.
 * Used for uptime monitoring and deployment verification.
 */
import { jsonResponse, handlePreflight } from '@/lib/cors';

export async function GET(request: Request) {
    return jsonResponse(
        {
            status: 'ok',
            service: 'polo-core-api',
            version: '1.0.0',
            network: process.env.STELLAR_NETWORK || 'testnet',
            timestamp: new Date().toISOString(),
        },
        request
    );
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
