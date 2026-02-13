/**
 * GET /api/v1/wallet/balance?tenant_id=xxx
 * 
 * Fetches real-time balances from Stellar Horizon.
 * Requires JWT auth — returns only the authenticated user's balances.
 * 
 * Returns: { status, wallet, balances: { XLM, USDC, ... } }
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

        // 2. Get public key from DB
        const publicKey = await getPublicKey(tenantId, auth.email);

        if (!publicKey) {
            return errorResponse(
                'Wallet not found. User must authenticate via POST /api/v1/auth/verify first.',
                request,
                404
            );
        }

        // 3. Fetch balances from Stellar Horizon (live data)
        const result = await HorizonService.getAccountBalances(publicKey);

        if (!result.success) {
            return errorResponse('Failed to fetch balances from Stellar', request, 502);
        }

        return jsonResponse(
            {
                status: 'success',
                wallet: publicKey,
                balances: result.balances,
            },
            request
        );

    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[Polo API] Balance Error:', err.message);
        return errorResponse(err.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
