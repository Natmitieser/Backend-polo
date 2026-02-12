
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { verifyOtpCode, upsertSdkUser } from '@/lib/db';
import { WalletManager } from '@/lib/wallet-service';

export async function POST(request: Request) {
    try {
        // 1. Verify API Key (App Authentication)
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        // 2. Validate Body
        const body = await request.json().catch(() => ({}));
        if (!body.email || !body.code) {
            return errorResponse('Email and code are required', request, 400);
        }

        const { email, code } = body;

        // 3. Verify OTP code within the App Context
        if (!auth.appId) {
            return errorResponse('Invalid context: missing App ID', request, 400);
        }

        const isValid = await verifyOtpCode(auth.appId, email, code);
        if (!isValid) {
            return errorResponse('Invalid or expired code', request, 401);
        }

        // 4. Ensure SDK User exists in our DB
        await upsertSdkUser(auth.appId, email);

        // 5. Get or Create Wallet (using the helper service)
        // Note: The tenantId is the auth.appId, ensuring isolation per App.
        const walletResult = await WalletManager.getOrCreateWallet(auth.appId, email);

        return jsonResponse(
            {
                status: 'success',
                message: 'Authenticated successfully',
                token: 'session_token_placeholder', // Ready for future JWT implementation
                wallet: {
                    address: walletResult.wallet,
                    status: walletResult.isNew ? 'active' : 'ready',
                    balance: walletResult.balance,
                },
            },
            request
        );

    } catch (error: any) {
        console.error('[Auth Verify] Error:', error);
        return errorResponse(error.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
