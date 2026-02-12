import { verifyAuth } from '@/lib/auth';
import { jsonResponse, errorResponse, handlePreflight } from '@/lib/cors';
import { createApp, getUserApps } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        const apps = await getUserApps(auth.userId);

        return jsonResponse({ status: 'success', apps }, request);
    } catch (error: any) {
        return errorResponse(error.message || 'Failed to list apps', request, 500);
    }
}

export async function POST(request: Request) {
    try {
        const auth = await verifyAuth(request);
        if (!auth.authenticated) {
            return errorResponse(auth.error, request, auth.status);
        }

        const body = await request.json();
        if (!body.name) {
            return errorResponse('Project name is required', request, 400);
        }

        const app = await createApp(auth.userId, body.name);

        return jsonResponse(
            {
                status: 'created',
                app: app,
            },
            request,
            201
        );
    } catch (error: any) {
        return errorResponse(error.message || 'Failed to create app', request, 500);
    }
}

export async function OPTIONS(request: Request) {
    return handlePreflight(request);
}
