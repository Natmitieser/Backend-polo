
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, code: string, appName: string = 'Polo App') {
    if (!process.env.RESEND_API_KEY) {
        console.error('[Resend] Missing RESEND_API_KEY');
        // Fallback for development if no key
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEV EMAIL] To: ${email} | Code: ${code}`);
            return true;
        }
        throw new Error('Email service not configured');
    }

    try {
        const { data, error } = await resend.emails.send({
            from: 'Polo Auth <noreply@aleregex.com>',
            to: [email],
            subject: `${code} is your verification code for ${appName}`,
            html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Login Verification</h2>
                <p>Hello,</p>
                <p>Your verification code for <strong>${appName}</strong> is:</p>
                <div style="background: #f4f4f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #18181b;">${code}</span>
                </div>
                <p>This code will expire in 10 minutes.</p>
                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;">
                <p style="font-size: 12px; color: #71717a;">If you didn't request this, please ignore this email.</p>
            </div>
            `,
        });

        if (error) {
            console.error('[Resend] Error sending email:', error);
            // In development, we might fallback to log if sending fails (e.g. unverified domain)
            if (process.env.NODE_ENV === 'development') {
                console.log(`[DEV EMAIL FALLBACK] To: ${email} | Code: ${code}`);
                return true;
            }
            throw new Error('Failed to send email');
        }

        console.log('[Resend] Email sent successfully:', data?.id);
        return true;
    } catch (err) {
        console.error('[Resend] Exception:', err);
        throw err;
    }
}
