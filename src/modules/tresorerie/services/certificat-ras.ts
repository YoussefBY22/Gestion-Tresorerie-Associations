/**
 * Certificat de retenue à la source — logique pure, testée.
 *
 * Quand l'association règle un prestataire en retenant une part de sa facture au
 * titre de l'impôt, cette part est versée au Trésor **au nom du
 * prestataire**. Lui ne la voit jamais passer : sans certificat, il ne peut
 * pas la déduire de son propre impôt et la paie donc une seconde fois. Le
 * certificat est la preuve que la retenue a été opérée — il lui est dû.
 *
 * Le calcul existait déjà dans `fiscal.ts` (`tauxRAS`, `estSoumisRAS`,
 * `montantRAS`) : la déclaration mensuelle s'en sert depuis le début. Ce
 * service ne le refait pas. Il dit **si** une facture reçue donne lieu à un
 * certificat, et détaille les quatre montants que la pièce doit porter :
 * l'assiette, le taux, la retenue, le net versé.
 *
 * Une règle de fond, héritée de l'OTMT : **l'assiette est le TTC diminué du
 * timbre fiscal**. Le timbre n'est pas la contrepartie d'un service, il ne
 * supporte pas la retenue. C'est la formule `(TTC − 1) × taux`.
 *
 * ⚠️ Cette formule fige le timbre à 1 DT, même si la facture reçue n'en
 * porte pas. C'est le comportement de `montantRAS`, donc celui de la
 * déclaration mensuelle — et le certificat **doit annoncer le montant
 * réellement retenu et versé**, pas un montant recalculé autrement. Imprimer
 * une assiette qui, multipliée par le taux, ne redonne pas la retenue
 * affichée produirait une pièce qui ne s'additionne pas : exactement ce qu'un
 * contrôle relève. L'assiette ci-dessous est donc celle qu'a employée le
 * calcul, pas une autre.
 */

import {
  TYPES_PRESTATAIRE_PAR_CODE,
  TIMBRE_FISCAL_DT,
  arrondirMillime,
  estSoumisRAS,
  montantRAS,
  tauxRAS,
} from "./fiscal";

/** Ce qu'il faut savoir de la facture reçue pour établir le certificat. */
export type FacturePourCertificat = {
  montantTTC: number;
  typePrestataire?: string | null;
};

export type DetailRetenue = {
  /** Base de calcul : TTC diminué du timbre. */
  assiette: number;
  /** Taux appliqué, en pourcentage (3 pour 3 %). */
  tauxPourcent: number;
  /** Montant retenu et versé au Trésor au nom du prestataire. */
  retenue: number;
  /** Ce que le prestataire a effectivement encaissé. */
  netVerse: number;
  /** Libellé du régime, tel qu'il doit figurer sur la pièce. */
  regime: string;
};

/**
 * Dit si un certificat peut être établi, et pourquoi non.
 *
 * Les messages nomment la correction à faire sur la facture reçue : c'est le
 * Trésorier qui les lit, devant l'écran de la déclaration.
 */
export function verifierCertificat(facture: FacturePourCertificat): {
  possible: boolean;
  raison: string | null;
} {
  if (!(facture.montantTTC > 0)) {
    return {
      possible: false,
      raison: "Cette facture ne porte aucun montant : rien n'a pu être retenu.",
    };
  }
  if (!facture.typePrestataire) {
    return {
      possible: false,
      raison:
        "Le type de prestataire n'est pas renseigné sur cette facture : sans lui, aucun taux de retenue ne s'applique. Complétez-le d'abord.",
    };
  }
  if (!TYPES_PRESTATAIRE_PAR_CODE[facture.typePrestataire]) {
    return {
      possible: false,
      raison: `Le type de prestataire « ${facture.typePrestataire} » ne figure pas dans la table des taux. Corrigez la facture.`,
    };
  }
  if (!estSoumisRAS(facture)) {
    return {
      possible: false,
      raison:
        "Cette facture n'est pas soumise à retenue à la source : il n'y a rien à certifier.",
    };
  }
  if (montantRAS(facture) <= 0) {
    const type = TYPES_PRESTATAIRE_PAR_CODE[facture.typePrestataire];
    return {
      possible: false,
      raison: `Aucune retenue n'est due : « ${type.libelle} » ne s'applique qu'au-delà de ${type.seuil
        .toFixed(3)
        .replace(".", ",")} DT TTC, et cette facture est en dessous.`,
    };
  }
  return { possible: true, raison: null };
}

/**
 * Les quatre montants du certificat.
 *
 * Appeler ce détail sur une facture non soumise à retenue rend des zéros
 * plutôt que de lever : la page qui affiche un registre ne doit pas tomber
 * sur une ligne incomplète.
 */
export function detailRetenue(facture: FacturePourCertificat): DetailRetenue {
  // Le même timbre que celui du calcul de la retenue : voir l'en-tête.
  const assiette = arrondirMillime(
    Math.max(0, facture.montantTTC - TIMBRE_FISCAL_DT)
  );
  const retenue = montantRAS(facture);
  const type = facture.typePrestataire
    ? TYPES_PRESTATAIRE_PAR_CODE[facture.typePrestataire]
    : undefined;

  return {
    assiette,
    tauxPourcent: arrondirMillime(
      tauxRAS(facture.typePrestataire, facture.montantTTC) * 100
    ),
    retenue,
    netVerse: arrondirMillime(facture.montantTTC - retenue),
    regime: type?.libelle ?? "Régime non renseigné",
  };
}
