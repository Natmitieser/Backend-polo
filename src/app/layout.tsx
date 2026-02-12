export const metadata = {
    title: 'Polo Core API',
    description: 'Custodial Stellar wallet infrastructure API',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
