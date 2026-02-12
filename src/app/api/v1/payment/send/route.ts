/**
 * POST /api/v1/payment/send
 * 
 * Sends a payment from the authenticated user's custodied wallet.
 * 
 * Flow:
 * 1. Verify JWT → extract email
 * 2. Retrieve encrypted secret from DB
 * 3. Decrypt secret key IN MEMORY (never written to disk/logs)
 * 4. Sign and submit transaction to Stellar
 * 5. Return transaction hash
 * 
 * Body: { destination, amount, asset?: 'XLM' | 'USDC', tenant_id?: string }
 * Returns: { status, tx_hash, amount, asset }
 */
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { getEncryptedSecret } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { PaymentService } from '@/lib/stellar';

export async function POST(request: Request) {
    try {
        // 1. Authenticate
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        const body = await request.json();
        const { destination, amount, asset, tenant_id } = body;
        const tenantId = tenant_id || 'default';

        // 2. Validate inputs
        if (!destination || !amount) {
            return errorResponse(
                'Missing required fields: destination, amount',
                request,
                400
            );
        }

        // Validate Stellar address format
        if (!destination.startsWith('G') || destination.length !== 56) {
            return errorResponse(
                'Invalid Stellar address. Must start with G and be 56 characters.',
                request,
                400
            );
        }

        // Validate amount
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return errorResponse('Amount must be a positive number', request, 400);
        }

        const assetCode: 'XLM' | 'USDC' = asset === 'USDC' ? 'USDC' : 'XLM';

        // 3. Retrieve encrypted secret from DB
        const walletSecret = await getEncryptedSecret(tenantId, auth.email);

        if (!walletSecret) {
            return errorResponse(
                'Wallet not found. Call POST /api/v1/wallet/create first.',
                request,
                404
            );
        }

        // 4. Decrypt secret key (in-memory only)
        const secretKey = decrypt(walletSecret.encrypted_secret, walletSecret.iv);

        // 5. Execute payment on Stellar
        console.log(`[Polo API] Payment: ${auth.email} → ${amount} ${assetCode} → ${destination.substring(0, 8)}...`);
        const result = await PaymentService.sendPayment(
            secretKey,
            destination,
            amount,
            assetCode
        );

        console.log(`[Polo API] ✅ Payment sent: ${result.hash}`);

        return jsonResponse(
            {
                status: 'success',
                tx_hash: result.hash,
                amount: amount,
                asset: assetCode,
            },
            request
        );

    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[Polo API] Payment Error:', err.message);
        return errorResponse(err.message || 'Payment failed', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
