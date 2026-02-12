import { redirect } from 'next/navigation';

/**
 * Root page redirects to the health endpoint.
 * This is an API-only project — no frontend UI.
 */
export default function Home() {
    redirect('/api/v1/health');
}
