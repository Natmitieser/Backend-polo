/**
 * POST /api/v1/console/auth/challenge
 * 
 * Developer Console Login — Step 1
 * Sends a 6-digit OTP code to the developer's email via Resend.
 * 
 * This is a PUBLIC endpoint (no auth required).
 * Body: { "email": "dev@example.com" }
 */
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { createDeveloperOtp } from '@/lib/db';
import { sendOtpEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));

        if (!body.email || !body.email.includes('@')) {
            return errorResponse('Valid email is required', request, 400);
        }

        // Generate 6-digit OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Store in DB
        await createDeveloperOtp(body.email, code);

        // Send email via Resend
        await sendOtpEmail(body.email, code, 'Polo Console');

        return jsonResponse(
            {
                status: 'success',
                message: 'Verification code sent to email',
            },
            request
        );
    } catch (error: any) {
        console.error('[Console Auth Challenge] Error:', error);
        return errorResponse(error.message || 'Internal server error', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
