import { CATALOGUE_DOCUMENTS } from "@/modules/documents/catalogue";

/**
 * Les familles de documents que la trésorerie émet, dans l'ordre où le
 * Trésorier les rencontre : ce qu'il remet à un tiers d'abord, ce qu'il
 * produit pour l'interne ensuite.
 *
 * Lue depuis le catalogue plutôt que recopiée : une famille ajoutée au
 * catalogue apparaît d'elle-même dans l'écran des modèles, avec ou sans
 * gabarit encore écrit.
 */

/** Ordre d'affichage : les pièces qui sortent de la JE en premier. */
const ORDRE: Record<string, number> = {
  RECU: 0,
  FACTURE: 1,
  ATTESTATION: 2,
  RAPPORT: 3,
};

export type ModeleTresorerie = {
  code: string;
  libelle: string;
  categorie: string;
  description?: string;
  /** Faux tant que le gabarit n'est pas écrit : la charte l'attend déjà. */
  disponible: boolean;
};

export const MODELES_TRESORERIE: ModeleTresorerie[] = CATALOGUE_DOCUMENTS.filter(
  (m) => m.module === "tresorerie"
)
  .map((m) => ({
    code: m.code,
    libelle: m.libelle,
    categorie: m.categorie,
    description: m.description,
    disponible: m.disponible,
  }))
  .sort((a, b) => {
    const rang = (ORDRE[a.categorie] ?? 9) - (ORDRE[b.categorie] ?? 9);
    return rang !== 0 ? rang : a.libelle.localeCompare(b.libelle, "fr");
  });

/** Regroupement par catégorie, pour présenter les cases à cocher en paquets. */
export function modelesParCategorie(): {
  categorie: string;
  libelle: string;
  modeles: ModeleTresorerie[];
}[] {
  const libelles: Record<string, string> = {
    RECU: "Reçus",
    FACTURE: "Facturation et achats",
    ATTESTATION: "Attestations fiscales",
    RAPPORT: "Rapports",
  };
  const paquets = new Map<string, ModeleTresorerie[]>();
  for (const modele of MODELES_TRESORERIE) {
    const liste = paquets.get(modele.categorie) ?? [];
    liste.push(modele);
    paquets.set(modele.categorie, liste);
  }
  return [...paquets.entries()].map(([categorie, modeles]) => ({
    categorie,
    libelle: libelles[categorie] ?? categorie,
    modeles,
  }));
}
