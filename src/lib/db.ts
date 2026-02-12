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
