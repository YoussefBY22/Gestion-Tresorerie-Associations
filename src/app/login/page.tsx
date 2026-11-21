import { signIn } from "@/auth";
import { verifierBase } from "@/lib/db";
import { resoudreTheme } from "@/modules/core/services/theme";
import { SelecteurTheme } from "@/components/layout/selecteur-theme";
import { Button } from "@/components/ui/button";
import { Marque } from "@/components/ui/marque";
import { DecorConnexion } from "./decor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connexion",
  description: "Gestion complète de la trésorerie d'associations et clubs.",
};

/**
 * Écran de connexion.
 *
 * E-mail et mot de passe, et rien d'autre : l'application ne dépend d'aucun
 * fournisseur d'identité externe. Une association doit pouvoir ouvrir ses
 * comptes le soir d'une assemblée générale, sans qu'un service tiers soit
 * sur le chemin.
 *
 * Deux choix de rédaction qui ont leur raison :
 *
 * - **L'avertissement « base injoignable » est affiché avant toute saisie.**
 *   Sans lui, l'authentification échoue sur un « identifiants invalides »
 *   trompeur : le mot de passe est bon, c'est la base qui manque. On ne laisse
 *   personne douter de sa mémoire à cause d'une variable d'environnement.
 * - **Le refus ne distingue jamais** « compte inconnu » de « mot de passe
 *   faux ». Les distinguer dirait à un inconnu quelles adresses existent.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const base = await verifierBase();
  const { theme, verrouille } = await resoudreTheme();

  const champ =
    "flex h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-sm " +
    "placeholder:text-muted-foreground focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <DecorConnexion />

      {!verrouille ? (
        <div className="anim-fondu absolute right-4 top-4 z-10">
          <SelecteurTheme theme={theme} />
        </div>
      ) : null}

      <div className="relative z-10 w-full max-w-md">
        <div className="anim-apparition flex flex-col items-center text-center">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <Marque taille={48} />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Trésorerie
          </h1>
          <p
            className="anim-apparition mt-2 text-balance text-sm text-muted-foreground"
            style={{ animationDelay: "0.12s" }}
          >
            Gestion complète de la trésorerie d&apos;associations et clubs.
          </p>
        </div>

        <div
          className="anim-apparition mt-8 rounded-xl border border-border bg-card p-7 shadow-lg shadow-black/5"
          style={{ animationDelay: "0.2s" }}
        >
          {!base.ok ? (
            <div
              role="alert"
              className="mb-5 rounded-md bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              <p className="font-medium">Base de données injoignable</p>
              <p className="mt-1">
                {base.hote
                  ? `L'application n'arrive pas à joindre MongoDB sur ${base.hote}.`
                  : "MONGODB_URI n'est pas renseigné dans .env.local."}{" "}
                La connexion échouera quel que soit le mot de passe saisi.
              </p>
              <p className="mt-2 text-xs">
                Démarrer la base en local :{" "}
                <code className="rounded bg-danger/10 px-1">
                  npm run base:locale
                </code>{" "}
                · diagnostic :{" "}
                <code className="rounded bg-danger/10 px-1">npm run etat</code>
              </p>
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="mb-5 rounded-md bg-danger/10 px-4 py-3 text-center text-sm text-danger"
            >
              {error === "CredentialsSignin"
                ? "E-mail ou mot de passe incorrect, ou compte désactivé."
                : "Une erreur est survenue pendant la connexion. Réessayez."}
            </p>
          ) : null}

          <form
            className="space-y-4"
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email"),
                motDePasse: formData.get("motDePasse"),
                redirectTo: callbackUrl ?? "/",
              });
            }}
          >
            <label className="block text-sm font-medium">
              Adresse e-mail
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="vous@exemple.org"
                className={champ + " mt-1.5 font-normal"}
              />
            </label>

            <label className="block text-sm font-medium">
              Mot de passe
              <input
                name="motDePasse"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                className={champ + " mt-1.5 font-normal"}
              />
            </label>

            <Button type="submit" size="lg" className="w-full">
              Se connecter
            </Button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
            Mot de passe oublié ? Un administrateur peut vous en redéfinir un
            depuis Administration › Comptes. Il n&apos;existe pas de
            récupération par e-mail : les comptes sont gérés par la structure
            elle-même.
          </p>
        </div>

        <p
          className="anim-fondu mt-6 text-center text-xs text-muted-foreground"
          style={{ animationDelay: "0.5s" }}
        >
          Budget · Encaissements · Factures · Reçus · Registres · Déclarations
        </p>
      </div>
    </main>
  );
}
