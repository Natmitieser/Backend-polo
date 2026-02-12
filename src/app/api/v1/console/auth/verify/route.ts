/**
 * POST /api/v1/console/auth/verify
 * 
 * Developer Console Login — Step 2
 * Verifies OTP code, creates/retrieves developer profile,
 * and generates a Supabase session token (JWT).
 * 
 * Body: { "email": "dev@example.com", "code": "123456" }
 * Returns: { "token": "eyJ...", "user": { "id": "...", "email": "..." } }
 */
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { verifyDeveloperOtp, upsertDeveloper } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));

        if (!body.email || !body.code) {
            return errorResponse('Email and code are required', request, 400);
        }

        const { email, code } = body;

        // 1. Verify OTP
        const isValid = await verifyDeveloperOtp(email, code);
        if (!isValid) {
            return errorResponse('Invalid or expired code', request, 401);
        }

        // 2. Create/get developer profile in our DB
        const developer = await upsertDeveloper(email);

        // 3. Get or create Supabase Auth user and generate a session JWT
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

        // Find existing Supabase user by email
        const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
        let supabaseUser = userList?.users?.find((u: { email?: string }) => u.email === email);

        if (!supabaseUser) {
            // Create user in Supabase Auth
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email: email,
                email_confirm: true,
            });
            if (createError) {
                console.error('[Console Auth] Failed to create Supabase user:', createError);
                return errorResponse('Failed to create user session', request, 500);
            }
            supabaseUser = newUser.user;
        }

        const userId = supabaseUser?.id;

        if (!userId) {
            return errorResponse('Failed to resolve user', request, 500);
        }

        // Generate a session by setting a temporary password and signing in
        const tempPassword = `polo_temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

        // Set temp password on the Supabase user
        await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: tempPassword,
        });

        // Sign in with the temp password to get a real JWT
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
            console.error('[Console Auth] Sign-in failed:', signErr);
            return errorResponse('Failed to create session', request, 500);
        }

        return jsonResponse(
            {
                status: 'success',
                message: 'Authenticated successfully',
                token: signIn.session.access_token,
                refresh_token: signIn.session.refresh_token,
                expires_at: signIn.session.expires_at,
                user: {
                    id: developer.id,
                    supabase_id: userId,
                    email: developer.email,
                },
            },
            request
        );
    } catch (error: any) {
        console.error('[Console Auth Verify] Error:', error);
        return errorResponse(error.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
