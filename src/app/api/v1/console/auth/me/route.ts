/**
 * GET /api/v1/console/auth/me
 * 
 * Returns the authenticated developer's profile information.
 * Requires: Authorization: Bearer <JWT>
 */
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';

export async function GET(request: Request) {
    try {
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        return jsonResponse(
            {
                status: 'success',
                user: {
                    id: auth.userId,
                    email: auth.email,
                },
            },
            request
        );
    } catch (error: any) {
        console.error('[Console Auth Me] Error:', error);
        return errorResponse(error.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
