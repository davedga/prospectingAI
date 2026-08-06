import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
      },
      // No password, no DB lookup — any email typed in gets a session.
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        if (!email) return null;
        return { id: email, email };
      },
    }),
  ],
});
