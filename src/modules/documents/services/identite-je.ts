import { getParametre } from "@/modules/core/services/parametrage";

/**
 * L'identité de la Junior Entreprise, telle qu'elle figure sur ses pièces.
 *
 * Ces jetons — `{{emetteurJE}}`, `{{adresseJE}}`, `{{matriculeFiscal}}`… —
 * étaient employés par les modèles livrés et **remplis nulle part**. Ils
 * n'existaient que dans le jeu d'exemple : l'aperçu montrait un en-tête
 * complet, et la pièce réellement émise sortait avec un en-tête vide. C'est
 * la pire forme de panne, celle qui ne se voit qu'après l'envoi au client.
 *
 * Ils viennent maintenant du paramétrage (Administration → Paramétrage,
 * catégorie « Général »), donc d'un seul endroit, modifiable sans toucher au
 * code et valable pour toutes les familles de documents.
 *
 * Le rendu en flux n'en a pas besoin : il dessine son en-tête depuis la
 * charte. Seul le rendu par canevas remplit des jetons, et c'est lui qu'on
 * sert ici.
 */

export type IdentiteJE = {
  emetteurJE: string;
  sigleJE: string;
  adresseJE: string;
  matriculeFiscal: string;
  telephoneJE: string;
  emailJE: string;
  siteJE: string;
};

/**
 * Sigle déduit du nom : le premier mot, en capitales.
 *
 * « Amicale des anciens » donne « AMICALE ». Un paramètre de plus à
 * tenir pour une valeur que personne ne saisirait autrement serait un
 * paramètre vide dans six mois.
 */
export function sigleDe(nom: string): string {
  const premier = nom.trim().split(/\s+/)[0] ?? "";
  return premier.toUpperCase();
}

export async function identiteJE(): Promise<IdentiteJE> {
  const [nom, adresse, matricule, telephone, email, site] = await Promise.all([
    getParametre<string>("general.nomStructure"),
    getParametre<string>("general.adresseStructure"),
    getParametre<string>("general.matriculeFiscal"),
    getParametre<string>("general.telephoneContact"),
    getParametre<string>("general.emailContact"),
    getParametre<string>("general.urlPublique"),
  ]);

  const emetteurJE = (nom ?? "").trim();
  return {
    emetteurJE,
    sigleJE: sigleDe(emetteurJE),
    adresseJE: (adresse ?? "").trim(),
    matriculeFiscal: (matricule ?? "").trim(),
    telephoneJE: (telephone ?? "").trim(),
    emailJE: (email ?? "").trim(),
    siteJE: (site ?? "").trim(),
  };
}
