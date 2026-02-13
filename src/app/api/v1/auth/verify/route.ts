
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { verifyOtpCode, upsertSdkUser } from '@/lib/db';
import { WalletManager } from '@/lib/wallet-service';
import { createClient } from '@supabase/supabase-js';

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
        const walletResult = await WalletManager.getOrCreateWallet(auth.appId, email);

        // 6. Generate a real Supabase JWT for the SDK user
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // Find or create Supabase Auth user for this SDK user
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        let supabaseUser = userList?.users?.find((u: { email?: string }) => u.email === email);

        if (!supabaseUser) {
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                email_confirm: true,
            });
            if (createError) {
                console.error('[SDK Auth] Failed to create Supabase user:', createError);
                return errorResponse('Failed to create user session', request, 500);
            }
            supabaseUser = newUser.user;
        }

        const userId = supabaseUser?.id;
        if (!userId) {
            return errorResponse('Failed to resolve user', request, 500);
        }

        // Generate session via temp password sign-in
        const tempPassword = `polo_sdk_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

        await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: tempPassword,
        });

        const anonClient = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_ANON_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        const { data: signIn, error: signErr } = await anonClient.auth.signInWithPassword({
            email: email,
            password: tempPassword,
        });

        if (signErr || !signIn.session) {
            console.error('[SDK Auth] Sign-in failed:', signErr);
            return errorResponse('Failed to create session', request, 500);
        }

        return jsonResponse(
            {
                status: 'success',
                message: 'Authenticated successfully',
                token: signIn.session.access_token,
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
