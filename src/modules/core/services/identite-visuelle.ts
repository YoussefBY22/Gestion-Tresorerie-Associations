import { getParametre } from "@/modules/core/services/parametrage";
import {
  COULEUR_PRIMAIRE_DEFAUT,
  couleurValide,
} from "@/modules/core/apparence";

/**
 * Nom et couleur de la structure, tels que les porte ce qui sort de
 * l'application : e-mails, en-têtes, documents.
 *
 * Un seul endroit qui lit les deux paramètres, pour que l'e-mail de rappel
 * et le reçu joint au même envoi ne soient jamais de deux couleurs
 * différentes.
 *
 * Ne lève jamais : une base injoignable ne doit pas empêcher un envoi, elle
 * le rend simplement aux couleurs par défaut.
 */
export type IdentiteVisuelle = { structure: string; couleur: string };

export async function identiteVisuelle(): Promise<IdentiteVisuelle> {
  try {
    const [nom, couleur] = await Promise.all([
      getParametre<string>("general.nomStructure"),
      getParametre<string>("apparence.couleurPrimaire"),
    ]);
    return {
      structure: nom?.trim() || "Trésorerie",
      couleur: couleurValide(couleur) ?? COULEUR_PRIMAIRE_DEFAUT,
    };
  } catch {
    return { structure: "Trésorerie", couleur: COULEUR_PRIMAIRE_DEFAUT };
  }
}
