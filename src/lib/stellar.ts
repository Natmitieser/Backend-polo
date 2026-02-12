/**
 * Polo Core API — Stellar Blockchain Services
 * 
 * Handles all interaction with the Stellar network:
 * - Sponsor account management
 * - Wallet creation with automatic USDC trustline
 * - Payment execution (XLM + USDC)
 * - Transaction history via Horizon
 * 
 * Network is configurable via STELLAR_NETWORK env var.
 */
import {
    Horizon,
    Keypair,
    TransactionBuilder,
    Operation,
    Asset,
    Account,
    Networks,
} from '@stellar/stellar-sdk';

// ─────────────────────────────────────────────
// Network Configuration
// ─────────────────────────────────────────────

function getNetworkConfig() {
    const network = process.env.STELLAR_NETWORK || 'testnet';

    if (network === 'mainnet' || network === 'public') {
        return {
            horizonUrl: 'https://horizon.stellar.org',
            networkPassphrase: Networks.PUBLIC,
            usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Centre USDC on mainnet
        };
    }

    return {
        horizonUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase: Networks.TESTNET,
        usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // Testnet USDC
    };
}

// ─────────────────────────────────────────────
// 1. Signer Service (Sponsor Logic)
// ─────────────────────────────────────────────

class SignerService {
    private static sponsorKeypair: Keypair | null = null;

    static initialize(): void {
        const secret = process.env.SPONSOR_SECRET_KEY;
        if (!secret) {
            throw new Error('[Polo Stellar] SPONSOR_SECRET_KEY is not defined in .env');
        }
        this.sponsorKeypair = Keypair.fromSecret(secret);
        console.log(`[Polo Stellar] Sponsor initialized: ${this.sponsorKeypair.publicKey().substring(0, 8)}...`);
    }

    static getKeypair(): Keypair {
        if (!this.sponsorKeypair) this.initialize();
        return this.sponsorKeypair!;
    }

    static signWithSponsor(tx: ReturnType<typeof TransactionBuilder.prototype.build>): void {
        this.getKeypair(); // ensure initialized
        tx.sign(this.sponsorKeypair!);
    }

    static getSponsorPublicKey(): string {
        return this.getKeypair().publicKey();
    }
}

// ─────────────────────────────────────────────
// 2. Horizon Service (Network Interaction)
// ─────────────────────────────────────────────

export class HorizonService {
    private static server: Horizon.Server | null = null;

    private static getServer(): Horizon.Server {
        if (!this.server) {
            const { horizonUrl } = getNetworkConfig();
            this.server = new Horizon.Server(horizonUrl);
        }
        return this.server;
    }

    static async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
        return await this.getServer().loadAccount(publicKey);
    }

    static async submitTransaction(tx: ReturnType<typeof TransactionBuilder.prototype.build>) {
        try {
            const result = await this.getServer().submitTransaction(tx);
            return { success: true as const, hash: result.hash };
        } catch (e: unknown) {
            const err = e as { response?: { data?: { extras?: { result_codes?: unknown } } }; message?: string };
            const errorDetail = err.response?.data?.extras?.result_codes || err.message || 'Unknown error';
            console.error('[Polo Stellar] Submission Error:', errorDetail);
            return { success: false as const, error: errorDetail };
        }
    }

    static async getPaymentsHistory(publicKey: string, limit: number = 10) {
        try {
            const response = await this.getServer()
                .payments()
                .forAccount(publicKey)
                .limit(limit)
                .order('desc')
                .call();

            return { success: true as const, records: response.records };
        } catch (e: unknown) {
            const err = e as { message?: string };
            console.error('[Polo Stellar] History Fetch Error:', err.message);
            return { success: false as const, records: [] };
        }
    }

    static async getAccountBalances(publicKey: string) {
        try {
            const account = await this.loadAccount(publicKey);
            const balances: Record<string, string> = {};

            for (const balance of account.balances) {
                if (balance.asset_type === 'native') {
                    balances['XLM'] = balance.balance;
                } else if ('asset_code' in balance) {
                    balances[balance.asset_code] = balance.balance;
                }
            }

            return { success: true as const, balances };
        } catch (e: unknown) {
            const err = e as { message?: string };
            console.error('[Polo Stellar] Balance Fetch Error:', err.message);
            return { success: false as const, balances: {} };
        }
    }
}

// ─────────────────────────────────────────────
// 3. Transaction Service (Building Logic)
// ─────────────────────────────────────────────

class TransactionService {
    static buildOnboardingTx(sponsorAccount: Account, newAccountPublicKey: string) {
        const config = getNetworkConfig();
        const usdcAsset = new Asset('USDC', config.usdcIssuer);

        const txBuilder = new TransactionBuilder(sponsorAccount, {
            fee: '100',
            networkPassphrase: config.networkPassphrase,
            timebounds: { minTime: 0, maxTime: 0 },
        });

        // Create the account with minimum XLM for base reserve + trustline
        txBuilder.addOperation(
            Operation.createAccount({
                destination: newAccountPublicKey,
                startingBalance: '2.0',
                source: sponsorAccount.accountId(),
            })
        );

        // Add USDC trustline so user can receive stablecoins immediately
        txBuilder.addOperation(
            Operation.changeTrust({
                asset: usdcAsset,
                source: newAccountPublicKey,
            })
        );

        return txBuilder.build();
    }

    static buildPaymentTx(
        sourcePublicKey: string,
        destinationPublicKey: string,
        amount: string,
        sequence: string,
        assetCode: 'XLM' | 'USDC' = 'XLM'
    ) {
        const config = getNetworkConfig();

        const asset = assetCode === 'USDC'
            ? new Asset('USDC', config.usdcIssuer)
            : Asset.native();

        const account = new Account(sourcePublicKey, sequence);

        const txBuilder = new TransactionBuilder(account, {
            fee: '100',
            networkPassphrase: config.networkPassphrase,
            timebounds: { minTime: 0, maxTime: 0 },
        });

        txBuilder.addOperation(
            Operation.payment({
                destination: destinationPublicKey,
                asset: asset,
                amount: amount,
            })
        );

        return txBuilder.build();
    }
}

// ─────────────────────────────────────────────
// 4. Wallet Service (Public API)
// ─────────────────────────────────────────────

export class WalletService {
    /**
     * Creates a new Stellar account funded by the sponsor.
     * Returns the keypair (public + secret) and transaction hash.
     */
    static async createFundedWallet() {
        const userKeypair = Keypair.random();
        const userPublicKey = userKeypair.publicKey();

        const sponsorPublicKey = SignerService.getSponsorPublicKey();
        const sponsorAccount = await HorizonService.loadAccount(sponsorPublicKey);

        const tx = TransactionService.buildOnboardingTx(sponsorAccount, userPublicKey);

        // Sign with both sponsor (pays fees + creates account) and user (authorizes trustline)
        SignerService.signWithSponsor(tx);
        tx.sign(userKeypair);

        const result = await HorizonService.submitTransaction(tx);

        if (result.success) {
            return {
                publicKey: userPublicKey,
                secretKey: userKeypair.secret(),
                hash: result.hash,
            };
        }

        throw new Error(`[Polo Stellar] Account creation failed: ${JSON.stringify(result.error)}`);
    }
}

// ─────────────────────────────────────────────
// 5. Payment Service (Public API)
// ─────────────────────────────────────────────

export class PaymentService {
    /**
     * Execute a payment from a custodied wallet.
     * The sender's secret key is decrypted in-memory, used once, then discarded.
     */
    static async sendPayment(
        senderSecret: string,
        destinationPublicKey: string,
        amount: string,
        assetCode: 'XLM' | 'USDC' = 'XLM'
    ) {
        const senderKeypair = Keypair.fromSecret(senderSecret);
        const senderPublicKey = senderKeypair.publicKey();

        const senderAccount = await HorizonService.loadAccount(senderPublicKey);

        const tx = TransactionService.buildPaymentTx(
            senderPublicKey,
            destinationPublicKey,
            amount,
            senderAccount.sequence,
            assetCode
        );

        tx.sign(senderKeypair);

        const result = await HorizonService.submitTransaction(tx);

        if (result.success) {
            return { hash: result.hash };
        }

        throw new Error(`[Polo Stellar] Payment failed: ${JSON.stringify(result.error)}`);
    }
}
