import type { Types } from "mongoose";
import { rendrePdf } from "./rendu";
import { chartePourModele } from "./charte-depot";
import { enregistrerFichier, supprimerFichier } from "./stockage";
import type { StructureDocument } from "./structure";
import { construireRecuCotisation } from "./gabarits/recu-cotisation";
import {
  construireRecuEncaissement,
  type NatureRecu,
} from "./gabarits/recu-encaissement";

/**
 * Réédition du PDF d'un document déjà en base.
 *
 * L'émission passe un gabarit en paramètre : celui qui émet sait quoi
 * construire. Rééditer, c'est l'inverse — on part d'un document trouvé en
 * base et il faut retrouver son gabarit à partir de son seul code de modèle.
 * D'où cet aiguillage, volontairement limité aux reçus : ce sont les seules
 * pièces que l'application renumérote, et un aiguillage complet sur les ~110 modèles
 * du catalogue serait une liste à tenir à jour pour rien.
 *
 * L'instantané (`donnees`) n'est pas retouché : rééditer ne réécrit pas ce
 * que la pièce atteste, seulement le numéro qu'elle porte.
 */

/** Gabarits capables de reconstruire une pièce depuis son instantané. */
const GABARITS_REEDITABLES: Record<
  string,
  (donnees: Record<string, unknown>, reference: string) => StructureDocument
> = {
  RECU_COTISATION: (donnees, reference) =>
    construireRecuCotisation({
      ...(donnees as unknown as Parameters<typeof construireRecuCotisation>[0]),
      reference,
    }),
  ...Object.fromEntries(
    (
      [
        "RECU_DON",
        "RECU_PRODUIT",
        "RECU_JOB",
        "RECU_INTEGRATION",
        "RECU_DIVERS",
      ] satisfies NatureRecu[]
    ).map((code) => [
      code,
      (donnees: Record<string, unknown>, reference: string) =>
        construireRecuEncaissement({
          ...(donnees as unknown as Parameters<
            typeof construireRecuEncaissement
          >[0]),
          reference,
        }),
    ])
  ),
};

export function estReeditable(modele: string): boolean {
  return modele in GABARITS_REEDITABLES;
}

export type DocumentAReediter = {
  modele: string;
  donnees: unknown;
  fichierId?: Types.ObjectId | null;
};

/**
 * Refabrique le PDF et remplace le fichier stocké. L'ancien est détruit : il
 * porte un numéro qui n'a plus cours, le garder ne ferait qu'offrir deux
 * pièces contradictoires au même endroit.
 *
 * Sans `nouvelleReference`, la pièce est refabriquée sous la sienne — c'est
 * le cas d'un brouillon corrigé, qui garde son numéro.
 */
export async function reediterPdf(
  document: DocumentAReediter,
  nouvelleReference?: string
): Promise<{ fichierId: Types.ObjectId; tailleOctets: number }> {
  const gabarit = GABARITS_REEDITABLES[document.modele];
  if (!gabarit) {
    throw new Error(
      `Le modèle « ${document.modele} » ne sait pas se rééditer : sa numérotation ne peut pas changer.`
    );
  }

  const donnees = (document.donnees ?? {}) as Record<string, unknown>;
  const reference = nouvelleReference ?? String(donnees.reference ?? "");
  const structure = gabarit(donnees, reference);
  // Même charte qu'à l'émission : rééditer ne doit pas changer l'allure.
  const pdf = await rendrePdf(structure, await chartePourModele(document.modele));
  const enregistre = await enregistrerFichier(`${reference}.pdf`, pdf, {
    modele: document.modele,
    reference,
  });

  if (document.fichierId) await supprimerFichier(document.fichierId);
  return enregistre;
}
