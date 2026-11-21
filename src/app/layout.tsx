import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { resoudreTheme } from "@/modules/core/services/theme";
import {
  COULEUR_PRIMAIRE_DEFAUT,
  couleurValide,
} from "@/modules/core/apparence";
import { getParametre } from "@/modules/core/services/parametrage";

/*
 * Montserrat, la police de la charte — servie depuis le dépôt, pas depuis
 * Google. Deux raisons : l'application ne dépend d'aucun service tiers pour
 * s'afficher (elle fonctionne hors ligne, sans requête vers un CDN), et une
 * police qu'on héberge soi-même ne peut pas disparaître du jour au lendemain.
 * C'est la même police que celle embarquée dans les PDF
 * (`modules/documents/services/polices.ts`) : l'écran et le papier disent
 * enfin la même chose.
 *
 * Fichier à axe variable : une seule ressource couvre les graisses 100 à 900,
 * là où les fichiers statiques en auraient demandé neuf.
 */
const montserrat = localFont({
  variable: "--font-montserrat",
  display: "swap",
  src: [
    {
      path: "./polices/Montserrat-VariableFont_wght.ttf",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "./polices/Montserrat-Italic-VariableFont_wght.ttf",
      weight: "100 900",
      style: "italic",
    },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Trésorerie",
    template: "%s · Trésorerie",
  },
  description:
    "Gestion complète de la trésorerie d'associations et clubs : budget, encaissements, factures, reçus, registres et déclarations.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Résolu côté serveur : l'attribut est présent dès le premier octet de HTML,
  // donc pas de flash clair → sombre au chargement.
  const { theme } = await resoudreTheme();

  /*
   * La couleur de la structure, posée sur <html> comme variable CSS.
   *
   * Une seule variable est injectée — `--primary-base`. Les deux thèmes en
   * dérivent le survol, l'état actif de la barre latérale et la version
   * éclaircie du mode sombre (voir `globals.css`). Injecter la couleur
   * finale à la place empêcherait le mode sombre de l'éclaircir, puisqu'un
   * style en ligne l'emporte sur toute règle de feuille.
   *
   * Une saisie illisible est ignorée plutôt qu'appliquée : une variable CSS
   * invalide ne casse pas la page, elle la rend sans couleur de marque — et
   * personne ne devine d'où ça vient.
   */
  const couleur =
    couleurValide(await getParametre("apparence.couleurPrimaire")) ??
    COULEUR_PRIMAIRE_DEFAUT;

  return (
    <html
      lang="fr"
      // "systeme" = pas d'attribut → la media query prefers-color-scheme décide.
      data-theme={theme === "systeme" ? undefined : theme}
      style={{ "--primary-base": couleur } as React.CSSProperties}
      className={`${montserrat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
