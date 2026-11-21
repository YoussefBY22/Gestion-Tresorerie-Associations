import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (ex-middleware, renommé en Next 16) : redirection rapide vers /login
 * si le cookie de session Auth.js est absent. C'est un contrôle de confort —
 * la vraie vérification d'authentification (et bientôt RBAC, story 01.3) se
 * fait côté serveur dans le layout protégé et les routes API via `auth()`.
 */
export default function proxy(request: NextRequest) {
  const aSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!aSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Tout protéger sauf :
     *  - /login et /api/auth (flux de connexion)
     *  - /api/health (sonde de statut)
     *  - /api/cron (protégé par CRON_SECRET — Vercel Cron n'a pas de session)
     *  - /api/webhooks (protégé par secret partagé — WordPress n'a pas de session)
     *  - /f/… (formulaires publics : un client, un candidat ou un partenaire
     *          n'a pas de compte ; l'autorisation est portée par le jeton
     *          aléatoire de l'URL, et la page ne lit rien d'autre)
     *  - assets Next et fichiers publics
     */
    "/((?!login|f/|api/auth|api/health|api/cron|api/webhooks|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico)).*)",
  ],
};
