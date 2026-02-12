
import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { createOtpCode } from '@/lib/db';
import { sendOtpEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        // 1. Verify API Key (App Authentication)
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        // 2. Validate Body
        const body = await request.json().catch(() => ({}));
        if (!body.email || !body.email.includes('@')) {
            return errorResponse('Valid email is required', request, 400);
        }

        // 3. Generate 8-digit OTP
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();

        // 4. Store in DB
        // auth.appId is guaranteed if authenticated via API Key (checked in verifyAuth)
        if (!auth.appId) {
            return errorResponse('Invalid context: missing App ID', request, 400);
        }

        await createOtpCode(auth.appId, body.email, code);

        // 5. Send Email
        await sendOtpEmail(body.email, code);

        return jsonResponse(
            {
                status: 'success',
                message: 'Code sent to email',
            },
            request
        );

    } catch (error: any) {
        console.error('[Auth Challenge] Error:', error);
        return errorResponse(error.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
