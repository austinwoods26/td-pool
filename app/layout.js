import "./globals.css";
import Nav from "../components/Nav";

export const metadata = {
  title: "TD Pool",
  description: "The Family TD Pool - NFL Pick'em",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
