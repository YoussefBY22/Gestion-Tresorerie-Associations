import {
  formaterDate,
  formaterMontantDT,
  type BlocDocument,
  type StructureDocument,
} from "../structure";

/**
 * Rapport de synthèse trésorerie sur une période choisie — une ou plusieurs
 * périodes consécutives (« rapport de juillet à octobre »), jusqu'au mandat
 * entier (rapport annuel). Le Trésorier choisit les bornes ; les chiffres et
 * les constats se calculent automatiquement, comme les feuilles
 * « Generateur Rapport Mensuel » et « Generateur Rapport Annuel » du
 * classeur de référence.
 */

export type DonneesRapportSynthese = {
  reference: string;
  intitulePeriode: string;
  mandat: string;
  arreteLe: Date;
  soldeOuverture: number;
  soldeCloture: number;
  totalRecettesReelles: number;
  totalDepensesReelles: number;
  totalRecettesBudget: number;
  totalDepensesBudget: number;
  tauxRealisationRecettes: number | null;
  tauxRealisationDepenses: number | null;
  tauxDeCharges: number | null;
  soldeMinimum: number;
  periodesDeficitaires: number;
  repartitionRecettes: { categorie: string; montant: number }[];
  repartitionDepenses: { categorie: string; montant: number }[];
  pointsForts: string[];
  pointsFaibles: string[];
  comparaisonMandatPrecedent?: {
    annee: string;
    variationRecettes: number | null;
  };
  emetteur?: string;
  filigrane?: string;
};

function formaterTaux(t: number | null): string {
  return t === null ? "—" : `${Math.round(t * 1000) / 10} %`;
}

function tableauRepartition(
  titre: string,
  lignes: { categorie: string; montant: number }[]
): BlocDocument[] {
  if (lignes.length === 0) return [];
  return [
    { type: "section", titre },
    {
      type: "tableau",
      colonnes: [
        { libelle: "Catégorie", largeur: 5 },
        { libelle: "Montant", largeur: 2, alignement: "droite" },
      ],
      lignes: lignes.map((l) => [l.categorie, formaterMontantDT(l.montant)]),
    },
  ];
}

export function construireRapportSynthese(
  d: DonneesRapportSynthese
): StructureDocument {
  const variation = d.comparaisonMandatPrecedent?.variationRecettes ?? null;

  return {
    titre: "Rapport de synthèse trésorerie",
    sousTitre: `${d.intitulePeriode} — mandat ${d.mandat}`,
    reference: d.reference,
    date: formaterDate(d.arreteLe),
    filigrane: d.filigrane,
    mentionPied:
      "Établi à partir du journal des opérations et du budget prévisionnel",
    blocs: [
      {
        type: "champs",
        colonnes: 3,
        items: [
          { label: "Période", valeur: d.intitulePeriode },
          { label: "Solde d'ouverture", valeur: formaterMontantDT(d.soldeOuverture) },
          { label: "Solde de clôture", valeur: formaterMontantDT(d.soldeCloture) },
          {
            label: "Valeur ajoutée",
            valeur: formaterMontantDT(d.totalRecettesReelles - d.totalDepensesReelles),
          },
          { label: "Point bas de trésorerie", valeur: formaterMontantDT(d.soldeMinimum) },
          {
            label: "Périodes déficitaires",
            valeur: String(d.periodesDeficitaires),
          },
        ],
      },

      { type: "section", titre: "Réalisé contre budget" },
      {
        type: "tableau",
        colonnes: [
          { libelle: "", largeur: 3 },
          { libelle: "Réalisé", largeur: 2, alignement: "droite" },
          { libelle: "Budget", largeur: 2, alignement: "droite" },
          { libelle: "Taux de réalisation", largeur: 2, alignement: "droite" },
        ],
        lignes: [
          [
            "Recettes",
            formaterMontantDT(d.totalRecettesReelles),
            formaterMontantDT(d.totalRecettesBudget),
            formaterTaux(d.tauxRealisationRecettes),
          ],
          [
            "Dépenses",
            formaterMontantDT(d.totalDepensesReelles),
            formaterMontantDT(d.totalDepensesBudget),
            formaterTaux(d.tauxRealisationDepenses),
          ],
        ],
      },
      {
        type: "total",
        items: [
          { label: "Taux de charges (dépenses / recettes)", valeur: formaterTaux(d.tauxDeCharges) },
        ],
      },

      ...tableauRepartition("Répartition des recettes réelles", d.repartitionRecettes),
      ...tableauRepartition("Répartition des dépenses réelles", d.repartitionDepenses),

      ...(d.comparaisonMandatPrecedent
        ? ([
            { type: "section" as const, titre: "Comparaison au mandat précédent" },
            {
              type: "paragraphe" as const,
              texte:
                variation === null
                  ? `Le mandat ${d.comparaisonMandatPrecedent.annee} n'a pas de chiffre de recettes enregistré pour comparaison.`
                  : `Variation des recettes réelles par rapport au mandat ${d.comparaisonMandatPrecedent.annee} : ${variation >= 0 ? "+" : ""}${Math.round(variation * 1000) / 10} %.`,
            },
          ] as BlocDocument[])
        : []),

      ...(d.pointsForts.length > 0
        ? ([
            {
              type: "encadre" as const,
              titre: "Points forts",
              texte: d.pointsForts.join("\n"),
            },
          ] as BlocDocument[])
        : []),
      ...(d.pointsFaibles.length > 0
        ? ([
            {
              type: "encadre" as const,
              titre: "Points de vigilance",
              texte: d.pointsFaibles.join("\n"),
            },
          ] as BlocDocument[])
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
