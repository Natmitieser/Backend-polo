/**
 * Polo Core API — Supabase Database Client
 * 
 * Uses SERVICE_ROLE_KEY for admin-level access.
 * This bypasses RLS — only to be used server-side.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _adminClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase admin client (service role).
 * This client bypasses Row Level Security — use carefully.
 */
export function getAdminClient(): SupabaseClient {
    if (_adminClient) return _adminClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error(
            '[Polo DB] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env'
        );
    }

    _adminClient = createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    return _adminClient;
}

// ─────────────────────────────────────────────
// Database Types
// ─────────────────────────────────────────────

export interface CustodyWallet {
    id: string;
    tenant_id: string;
    user_identifier: string;
    public_key: string;
    encrypted_secret: string;
    iv: string;
    created_at: string;
}

// ─────────────────────────────────────────────
// Database Operations
// ─────────────────────────────────────────────

/**
 * Find an existing custody wallet by tenant + user identifier.
 */
export async function findWallet(
    tenantId: string,
    userIdentifier: string
): Promise<CustodyWallet | null> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('custody_wallets')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('user_identifier', userIdentifier)
        .single();

    if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found (not a real error)
        throw new Error(`[Polo DB] Query error: ${error.message}`);
    }

    return data as CustodyWallet | null;
}

/**
 * Insert a new custody wallet into the database.
 */
export async function insertWallet(wallet: {
    tenant_id: string;
    user_identifier: string;
    public_key: string;
    encrypted_secret: string;
    iv: string;
}): Promise<CustodyWallet> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('custody_wallets')
        .insert(wallet)
        .select()
        .single();

    if (error) {
        throw new Error(`[Polo DB] Insert error: ${error.message}`);
    }

    return data as CustodyWallet;
}

/**
 * Get the public key for a user (no secret exposed).
 */
export async function getPublicKey(
    tenantId: string,
    userIdentifier: string
): Promise<string | null> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('custody_wallets')
        .select('public_key')
        .eq('tenant_id', tenantId)
        .eq('user_identifier', userIdentifier)
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`[Polo DB] Query error: ${error.message}`);
    }

    return data?.public_key ?? null;
}

/**
 * Get the encrypted secret + IV for a user (for server-side decryption only).
 */
export async function getEncryptedSecret(
    tenantId: string,
    userIdentifier: string
): Promise<{ encrypted_secret: string; iv: string } | null> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('custody_wallets')
        .select('encrypted_secret, iv')
        .eq('tenant_id', tenantId)
        .eq('user_identifier', userIdentifier)
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`[Polo DB] Query error: ${error.message}`);
    }

    return data as { encrypted_secret: string; iv: string } | null;
}

// ─────────────────────────────────────────────
// App / Project Management
// ─────────────────────────────────────────────

export interface App {
    id: string;
    owner_id: string;
    name: string;
    api_key: string;
    publishable_key: string;
    allowed_domains: string[];
    created_at: string;
}

/**
 * Validates a Publishable Key (used by Frontend SDK) and returns the App ID.
 */
export async function getAppByPublishableKey(publishableKey: string): Promise<App | null> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('apps')
        .select('*')
        .eq('publishable_key', publishableKey)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('[Polo DB] Key validation error:', error.message);
        return null; // Fail safe
    }

    return data as App | null;
}

/**
 * Creates a new App for a developer.
 */
export async function createApp(ownerId: string, name: string): Promise<App> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('apps')
        .insert({
            owner_id: ownerId,
            name: name,
        })
        .select()
        .single();

    if (error) {
        throw new Error(`[Polo DB] Create App error: ${error.message}`);
    }

    return data as App;
}

/**
 * Lists all apps for a specific developer.
 */
export async function getUserApps(ownerId: string): Promise<App[]> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('apps')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

    if (error) {
        throw new Error(`[Polo DB] List Apps error: ${error.message}`);
    }

    return data as App[];
}

// ─────────────────────────────────────────────
// SDK Authentication (End-Users)
// ─────────────────────────────────────────────

/**
 * Creates or retrieves an SDK User.
 */
export async function upsertSdkUser(appId: string, email: string): Promise<any> {
    const db = getAdminClient();

    // Check if user exists
    const { data: existing } = await db
        .from('sdk_users')
        .select('*')
        .eq('app_id', appId)
        .eq('email', email)
        .single();

    if (existing) return existing;

    // Create new user
    const { data, error } = await db
        .from('sdk_users')
        .insert({
            app_id: appId,
            email: email,
        })
        .select()
        .single();

    if (error) {
        throw new Error(`[Polo DB] Create SDK User error: ${error.message}`);
    }

    return data;
}

/**
 * Stores an OTP code for verification.
 */
export async function createOtpCode(appId: string, email: string, code: string): Promise<void> {
    const db = getAdminClient();

    // Invalidate previous codes
    await db
        .from('otp_codes')
        .update({ used: true })
        .eq('app_id', appId)
        .eq('email', email);

    const { error } = await db.from('otp_codes').insert({
        app_id: appId,
        email: email,
        code: code,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    });

    if (error) {
        throw new Error(`[Polo DB] Create OTP error: ${error.message}`);
    }
}

/**
 * Verifies an OTP code.
 */
export async function verifyOtpCode(appId: string, email: string, code: string): Promise<boolean> {
    const db = getAdminClient();

    const { data, error } = await db
        .from('otp_codes')
        .select('*')
        .eq('app_id', appId)
        .eq('email', email)
        .eq('code', code)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

    if (error || !data) {
        return false;
    }

    // Mark as used
    await db
        .from('otp_codes')
        .update({ used: true })
        .eq('id', data.id);

    return true;
}
