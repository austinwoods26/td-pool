import "./globals.css";

export const metadata = {
  title: "TD Pool",
  description: "The Family TD Pool - NFL Pick'em",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
