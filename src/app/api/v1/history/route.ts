/**
 * GET /api/v1/history?tenant_id=xxx&limit=10
 * 
 * Fetches payment history from Stellar Horizon.
 * Auth-gated — returns only the authenticated user's transactions.
 * 
 * Returns: { status, history: [...] }
 */
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { getPublicKey } from '@/lib/db';
import { HorizonService } from '@/lib/stellar';

export async function GET(request: Request) {
    try {
        // 1. Authenticate
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        const { searchParams } = new URL(request.url);
        // Use App ID from auth if available (SDK mode), otherwise check params or default
        const tenantId = auth.appId || searchParams.get('tenant_id') || 'default';
        const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

        // 2. Get public key from DB
        const publicKey = await getPublicKey(tenantId, auth.email);

        if (!publicKey) {
            return errorResponse(
                'Wallet not found. User must authenticate via POST /api/v1/auth/verify first.',
                request,
                404
            );
        }

        // 3. Fetch history from Stellar Horizon
        const result = await HorizonService.getPaymentsHistory(publicKey, limit);

        return jsonResponse(
            {
                status: 'success',
                wallet: publicKey,
                history: result.records,
            },
            request
        );

    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[Polo API] History Error:', err.message);
        return errorResponse(err.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
