/**
 * Bon de commande — logique pure, testée.
 *
 * Une Junior Entreprise engage peu de dépenses, mais elle les engage
 * **avant** de les payer : on commande des goodies, une impression, une
 * salle, et la facture arrive des semaines plus tard. Jusqu'ici l'application ne
 * voyait que la facture. Entre les deux, l'enveloppe paraissait intacte alors
 * qu'elle était déjà promise — c'est ainsi qu'on la dépense deux fois.
 *
 * Ce service répond à trois questions : **combien engage ce bon**, **peut-on
 * l'émettre**, et **que reste-t-il d'une enveloppe une fois les engagements
 * déduits**.
 *
 * Un parti pris sur le dernier point : le reste disponible retranche les
 * engagements **et** les dépenses réalisées, mais ne compte jamais deux fois
 * un bon déjà réceptionné dont la facture est arrivée. Un bon réceptionné a
 * fait son travail : c'est la dépense réelle qui le remplace.
 */

import { TAUX_TVA_DEFAUT, arrondirMillime, tvaDe } from "./fiscal";

export type LigneBonCommande = {
  designation: string;
  quantite: number;
  prixUnitaire: number;
};

export type TotauxBonCommande = {
  totalHT: number;
  tva: number;
  totalTTC: number;
};

/** Montant d'une ligne, quantité × prix unitaire, à la millime. */
export function montantLigne(ligne: LigneBonCommande): number {
  return arrondirMillime(
    Math.max(0, ligne.quantite) * Math.max(0, ligne.prixUnitaire)
  );
}

/**
 * Totaux d'un bon de commande.
 *
 * Pas de droit de timbre : il est dû par l'émetteur d'une **facture**, et un
 * bon de commande n'en est pas une. L'y faire figurer gonflerait l'engagement
 * d'un dinar qui ne sera jamais payé à ce titre.
 */
export function totauxBonCommande(
  lignes: LigneBonCommande[],
  tauxTVA: number = TAUX_TVA_DEFAUT
): TotauxBonCommande {
  const totalHT = arrondirMillime(
    lignes.reduce((somme, l) => somme + montantLigne(l), 0)
  );
  const tva = tvaDe(totalHT, tauxTVA);
  return { totalHT, tva, totalTTC: arrondirMillime(totalHT + tva) };
}

/**
 * Vérifie qu'un bon peut être émis, et dit pourquoi non.
 *
 * Le fournisseur et l'objet sont exigés : un engagement anonyme ou sans motif
 * ne se justifie pas six mois plus tard, en audit.
 */
export function verifierBonCommande(bon: {
  fournisseur: string;
  objet: string;
  lignes: LigneBonCommande[];
  tauxTVA?: number;
}): { possible: boolean; raison: string | null } {
  if (!bon.fournisseur.trim()) {
    return {
      possible: false,
      raison: "Nommez le fournisseur : un engagement sans destinataire ne se justifie pas.",
    };
  }
  if (bon.objet.trim().length < 3) {
    return {
      possible: false,
      raison:
        "Décrivez l'objet de la commande : c'est ce qui permettra de la retrouver et de la justifier.",
    };
  }
  if (bon.lignes.length === 0) {
    return {
      possible: false,
      raison: "Un bon sans ligne n'engage rien. Ajoutez ce qui est commandé.",
    };
  }
  if ((bon.tauxTVA ?? TAUX_TVA_DEFAUT) < 0) {
    return { possible: false, raison: "Le taux de TVA ne peut pas être négatif." };
  }
  const { totalHT } = totauxBonCommande(bon.lignes, bon.tauxTVA);
  if (totalHT <= 0) {
    return {
      possible: false,
      raison:
        "Le total du bon est nul : vérifiez les quantités et les prix unitaires.",
    };
  }
  return { possible: true, raison: null };
}

/** Un bon ne change d'état qu'une fois, et seulement depuis « émis ». */
export function peutChangerStatut(
  statutActuel: string,
  vers: "RECEPTIONNE" | "ANNULE"
): { possible: boolean; raison: string | null } {
  if (statutActuel === "EMIS") return { possible: true, raison: null };
  const dejaDit =
    statutActuel === "RECEPTIONNE"
      ? "Ce bon est déjà réceptionné"
      : "Ce bon est déjà annulé";
  return {
    possible: false,
    raison:
      vers === "RECEPTIONNE"
        ? `${dejaDit} : il n'engage plus rien.`
        : `${dejaDit} : il ne peut plus être annulé. Émettez-en un nouveau si la commande change.`,
  };
}

export type EngagementSection = {
  section: string;
  /** Total TTC engagé et non encore réceptionné. */
  engage: number;
  nombre: number;
};

/**
 * Ce qui est engagé par section budgétaire, bons réceptionnés exclus.
 *
 * Un bon réceptionné ne pèse plus : sa facture est arrivée, et c'est elle qui
 * porte désormais la dépense. Le compter encore ferait apparaître le double.
 */
export function engagementsParSection(
  bons: {
    sectionBudget?: string | null;
    statut: string;
    lignes: LigneBonCommande[];
    tauxTVA?: number;
  }[]
): EngagementSection[] {
  const parSection = new Map<string, { engage: number; nombre: number }>();
  for (const bon of bons) {
    if (bon.statut !== "EMIS") continue;
    const section = bon.sectionBudget?.trim() || "Sans section";
    const { totalTTC } = totauxBonCommande(bon.lignes, bon.tauxTVA);
    const courant = parSection.get(section) ?? { engage: 0, nombre: 0 };
    parSection.set(section, {
      engage: arrondirMillime(courant.engage + totalTTC),
      nombre: courant.nombre + 1,
    });
  }
  return [...parSection.entries()]
    .map(([section, v]) => ({ section, ...v }))
    .sort((a, b) => b.engage - a.engage);
}

/** Total TTC engagé, toutes sections confondues. */
export function totalEngage(
  bons: { statut: string; lignes: LigneBonCommande[]; tauxTVA?: number }[]
): number {
  return arrondirMillime(
    bons
      .filter((b) => b.statut === "EMIS")
      .reduce((s, b) => s + totauxBonCommande(b.lignes, b.tauxTVA).totalTTC, 0)
  );
}
