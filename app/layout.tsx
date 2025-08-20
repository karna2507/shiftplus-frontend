// app/layout.tsx
export const metadata = { title: "Shift+", description: "Your news. 60 Secs." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
