
import { findWallet, insertWallet } from './db';
import { WalletService as StellarService } from './stellar';
import { encrypt } from './encryption';

export class WalletManager {
    /**
     * Retrieves an existing wallet or creates a new one on the Stellar network.
     * Handles encryption and database storage.
     */
    static async getOrCreateWallet(tenantId: string, userIdentifier: string) {
        // 1. Check if wallet already exists
        const existing = await findWallet(tenantId, userIdentifier);

        if (existing) {
            console.log(`[WalletManager] Wallet exists for ${userIdentifier} (tenant: ${tenantId})`);
            return {
                status: 'active',
                wallet: existing.public_key,
                isNew: false,
            };
        }

        // 2. Create new wallet on Stellar
        console.log(`[WalletManager] Creating wallet for ${userIdentifier} (tenant: ${tenantId})...`);
        const stellarWallet = await StellarService.createFundedWallet();

        // 3. Encrypt secret key before storage
        const { iv, content } = encrypt(stellarWallet.secretKey);

        // 4. Save to database
        await insertWallet({
            tenant_id: tenantId,
            user_identifier: userIdentifier,
            public_key: stellarWallet.publicKey,
            encrypted_secret: content,
            iv: iv,
        });

        console.log(`[WalletManager] ✅ Wallet created: ${stellarWallet.publicKey.substring(0, 8)}...`);

        return {
            status: 'created',
            wallet: stellarWallet.publicKey,
            balance: '2.0 XLM (0.0 USDC)',
            tx_hash: stellarWallet.hash,
            isNew: true,
        };
    }
}
