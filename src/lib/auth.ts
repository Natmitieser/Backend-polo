/**
 * Polo Core API — Authentication Middleware
 * 
 * Verifies Supabase JWT tokens sent by the frontend.
 * Extracts user identity (email) from the verified token.
 * 
 * How it works:
 * 1. Frontend logs in via Supabase Auth → gets access_token
 * 2. Frontend sends: Authorization: Bearer <access_token>
 * 3. This middleware verifies the token with Supabase
 * 4. Extracts user email for tenant/user identification
 */
import { createClient } from '@supabase/supabase-js';

export interface AuthResult {
    authenticated: true;
    userId: string;
    email: string;
    appId?: string; // If authenticated via API Key
}

export interface AuthError {
    authenticated: false;
    error: string;
    status: number;
}

/**
 * Verify the Authorization header and extract user info.
 */
import { getAppByPublishableKey } from './db';

/**
 * Verify the Authorization header OR x-publishable-key.
 */
export async function verifyAuth(request: Request): Promise<AuthResult | AuthError> {
    const authHeader = request.headers.get('Authorization');
    const apiKey = request.headers.get('x-publishable-key');

    // ─────────────────────────────────────────────
    // 1. API Key Auth (SDK / End-User)
    // ─────────────────────────────────────────────
    if (apiKey) {
        if (!apiKey.startsWith('pk_')) {
            return {
                authenticated: false,
                error: 'Invalid API Key format. Must start with pk_',
                status: 401,
            };
        }

        const app = await getAppByPublishableKey(apiKey);

        if (!app) {
            return {
                authenticated: false,
                error: 'Invalid API Key. Project not found.',
                status: 401,
            };
        }

        // If BOTH API key AND JWT are present, verify JWT to get user identity
        // This is the normal SDK flow: user has a token from auth/verify + the app's publishable key
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const supabase = createClient(
                    process.env.SUPABASE_URL!,
                    process.env.SUPABASE_ANON_KEY!,
                    {
                        global: {
                            headers: { Authorization: `Bearer ${token}` },
                        },
                        auth: {
                            autoRefreshToken: false,
                            persistSession: false,
                        },
                    }
                );

                const { data: { user }, error } = await supabase.auth.getUser(token);

                if (!error && user?.email) {
                    // Combined auth: JWT user identity + API key app context
                    return {
                        authenticated: true,
                        userId: user.id,
                        email: user.email,
                        appId: app.id,
                    };
                }
            } catch {
                // JWT verification failed, fall through to API-key-only auth
            }
        }

        // API key only (used during auth/challenge and auth/verify flows)
        return {
            authenticated: true,
            userId: app.owner_id,
            email: `app:${app.id}`,
            appId: app.id,
        };
    }

    // ─────────────────────────────────────────────
    // 2. JWT Auth (Console / Developer)
    // ─────────────────────────────────────────────
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            authenticated: false,
            error: 'Missing authentication. Provide Bearer token or x-publishable-key.',
            status: 401,
        };
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token || token.length < 10) {
        return {
            authenticated: false,
            error: 'Invalid token format',
            status: 401,
        };
    }

    try {
        const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_ANON_KEY!,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                },
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.warn('[Polo Auth] Token verification failed:', error?.message);
            return {
                authenticated: false,
                error: 'Invalid or expired token',
                status: 401,
            };
        }

        if (!user.email) {
            return {
                authenticated: false,
                error: 'User has no email associated',
                status: 403,
            };
        }

        return {
            authenticated: true,
            userId: user.id,
            email: user.email,
            // appId is undefined for Console users (they are global admins of their own account)
        };
    } catch (err: unknown) {
        const error = err as { message?: string };
        console.error('[Polo Auth] Unexpected error:', error.message);
        return {
            authenticated: false,
            error: 'Authentication service unavailable',
            status: 503,
        };
    }
}

