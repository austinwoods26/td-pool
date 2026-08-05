import "./globals.css";
import Nav from "../components/Nav";
import ProfileButton from "../components/ProfileButton";

export const metadata = {
  title: "TD Pool",
  description: "The Family TD Pool - NFL Pick'em",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <ProfileButton />
        {children}
      </body>
    </html>
  );
}
