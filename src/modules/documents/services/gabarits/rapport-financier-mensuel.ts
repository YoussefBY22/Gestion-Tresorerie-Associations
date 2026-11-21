import {
  formaterDate,
  formaterMontantDT,
  type StructureDocument,
} from "../structure";

/**
 * Rapport financier mensuel — le classeur `S2-RAPM-xx` du drive (transactions,
 * suivi budgétaire, récapitulatif), rendu imprimable et archivable.
 *
 * Il répond à trois questions dans cet ordre : où en est la trésorerie, d'où
 * vient et où va l'argent du mois, et tient-on le budget.
 */

export type LigneCategorie = {
  categorie: string;
  prevu: number;
  realise: number;
  ecart: number;
  depassement: boolean;
};

export type DonneesRapportMensuel = {
  reference: string;
  libelleMois: string;
  mandat: string;
  arreteLe: Date;
  soldes: {
    caisseDebut: number;
    banqueDebut: number;
    caisseFin: number;
    banqueFin: number;
  };
  entrees: number;
  sorties: number;
  /** Opérations dont la pièce justificative manque encore. */
  sansJustificatif: number;
  produits: LigneCategorie[];
  charges: LigneCategorie[];
  emetteur?: string;
  filigrane?: string;
};

function totalRealise(lignes: LigneCategorie[]): number {
  return lignes.reduce((s, l) => s + l.realise, 0);
}

export function construireRapportFinancierMensuel(
  d: DonneesRapportMensuel
): StructureDocument {
  const debut = d.soldes.caisseDebut + d.soldes.banqueDebut;
  const fin = d.soldes.caisseFin + d.soldes.banqueFin;

  const tableauCategories = (titre: string, lignes: LigneCategorie[]) =>
    lignes.length === 0
      ? []
      : ([
          { type: "section" as const, titre },
          {
            type: "tableau" as const,
            colonnes: [
              { libelle: "Catégorie", largeur: 4 },
              { libelle: "Prévu", largeur: 2, alignement: "droite" as const },
              { libelle: "Réalisé", largeur: 2, alignement: "droite" as const },
              { libelle: "Écart", largeur: 2, alignement: "droite" as const },
            ],
            lignes: lignes.map((l) => [
              // Le dépassement est signalé dans la ligne : un tableau imprimé
              // n'a pas de couleur pour le dire.
              l.depassement ? `${l.categorie}  (dépassement)` : l.categorie,
              formaterMontantDT(l.prevu),
              formaterMontantDT(l.realise),
              formaterMontantDT(l.ecart),
            ]),
          },
        ]);

  return {
    titre: "Rapport financier mensuel",
    sousTitre: `${d.libelleMois} — mandat ${d.mandat}`,
    reference: d.reference,
    date: formaterDate(d.arreteLe),
    filigrane: d.filigrane,
    mentionPied: "Établi à partir du journal des opérations",
    blocs: [
      { type: "section", titre: "Trésorerie" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "Avoir", largeur: 3 },
          { libelle: "Début de mois", largeur: 2, alignement: "droite" },
          { libelle: "Fin de mois", largeur: 2, alignement: "droite" },
        ],
        lignes: [
          [
            "Caisse",
            formaterMontantDT(d.soldes.caisseDebut),
            formaterMontantDT(d.soldes.caisseFin),
          ],
          [
            "Compte bancaire",
            formaterMontantDT(d.soldes.banqueDebut),
            formaterMontantDT(d.soldes.banqueFin),
          ],
          ["Total", formaterMontantDT(debut), formaterMontantDT(fin)],
        ],
      },
      {
        type: "total",
        items: [
          { label: "Encaissements du mois", valeur: formaterMontantDT(d.entrees) },
          { label: "Décaissements du mois", valeur: formaterMontantDT(d.sorties) },
          {
            label: "Variation de trésorerie",
            valeur: formaterMontantDT(fin - debut),
            fort: true,
          },
        ],
      },

      ...tableauCategories("Produits", d.produits),
      ...tableauCategories("Charges", d.charges),

      ...(d.sansJustificatif > 0
        ? ([
            {
              type: "encadre" as const,
              titre: "Pièces manquantes",
              texte: `${d.sansJustificatif} opération(s) du mandat n'ont pas encore de justificatif rattaché. La clôture ne peut être considérée comme définitive tant qu'elles ne sont pas régularisées.`,
            },
          ])
        : []),

      {
        type: "signatures",
        cases: [
          { role: "Le Trésorier", nom: d.emetteur },
          { role: "Le Président" },
        ],
      },
    ],
  };
}

/** Totaux exposés pour l'écran, afin de ne pas les recalculer différemment. */
export function totauxRapport(d: {
  produits: LigneCategorie[];
  charges: LigneCategorie[];
}) {
  return {
    produits: totalRealise(d.produits),
    charges: totalRealise(d.charges),
  };
}
