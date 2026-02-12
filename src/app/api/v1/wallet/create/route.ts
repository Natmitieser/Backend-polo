/**
 * POST /api/v1/wallet/create
 * 
 * Creates a new Stellar wallet for the authenticated user.
 * If the user already has a wallet, returns the existing one.
 * 
 * Flow:
 * 1. Verify JWT → extract email
 * 2. Check if wallet exists in DB
 * 3. If not: create on Stellar, encrypt secret, save to DB
 * 4. Return public key (NEVER return secret key)
 * 
 * Body: { tenant_id?: string }
 * Returns: { status, wallet, balance?, tx_hash? }
 */
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { findWallet, insertWallet } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { WalletService } from '@/lib/stellar';

export async function POST(request: Request) {
    try {
        // 1. Authenticate
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        const body = await request.json().catch(() => ({}));
        const tenantId = body.tenant_id || 'default';

        // 2. Check if wallet already exists
        const existing = await findWallet(tenantId, auth.email);

        if (existing) {
            console.log(`[Polo API] Wallet exists for ${auth.email} (tenant: ${tenantId})`);
            return jsonResponse(
                {
                    status: 'active',
                    wallet: existing.public_key,
                    message: 'Wallet already exists',
                },
                request
            );
        }

        // 3. Create new wallet on Stellar
        console.log(`[Polo API] Creating wallet for ${auth.email} (tenant: ${tenantId})...`);
        const stellarWallet = await WalletService.createFundedWallet();

        // 4. Encrypt secret key before storage
        const { iv, content } = encrypt(stellarWallet.secretKey);

        // 5. Save to database
        await insertWallet({
            tenant_id: tenantId,
            user_identifier: auth.email,
            public_key: stellarWallet.publicKey,
            encrypted_secret: content,
            iv: iv,
        });

        console.log(`[Polo API] ✅ Wallet created: ${stellarWallet.publicKey.substring(0, 8)}...`);

        return jsonResponse(
            {
                status: 'created',
                wallet: stellarWallet.publicKey,
                balance: '2.0 XLM (0.0 USDC)',
                tx_hash: stellarWallet.hash,
            },
            request,
            201
        );

    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[Polo API] Wallet Create Error:', err.message);
        return errorResponse(
            err.message || 'Internal server error',
            request,
            500
        );
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
