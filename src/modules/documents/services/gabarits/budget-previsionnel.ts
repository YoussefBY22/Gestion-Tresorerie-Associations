import {
  formaterDate,
  type BlocDocument,
  type StructureDocument,
} from "../structure";
import {
  bilanMensuel,
  soldeCumule,
  sousTotalSection,
  totalParSens,
  type SectionBudgetCalc,
} from "@/modules/tresorerie/services/budget-previsionnel";

/**
 * Budget prévisionnel du mandat — reprend `Budget Previsionnel.pdf`
 * de référence : un poste par ligne, une colonne par mois, des sous-totaux,
 * un bilan mensuel et un solde de trésorerie budgétaire cumulé.
 *
 * En paysage : au-delà de 6-7 colonnes le portrait A4 ne laisse plus assez
 * de place pour des montants lisibles, et un budget annuel en compte
 * facilement onze ou douze.
 */

export type LigneBudgetGabarit = {
  libelle: string;
  valeursMensuelles: number[];
  aJustificatif: boolean;
};

export type SectionBudgetGabarit = {
  libelle: string;
  sens: "DEPENSE" | "RECETTE";
  lignes: LigneBudgetGabarit[];
};

export type DonneesBudgetPrevisionnel = {
  reference: string;
  mandat: string;
  periodes: { cle: string; libelle: string }[];
  sections: SectionBudgetGabarit[];
  soldeInitial: number;
  version: number;
  verrouille: boolean;
  etabliLe: Date;
  emetteur?: string;
  filigrane?: string;
};

/** « Août 2025 » → « Août 25 » : la place manque pour l'année complète. */
function libelleCourt(libelle: string): string {
  return libelle.replace(/\b(\d{4})$/, (a) => a.slice(2));
}

/**
 * Regroupement par milliers avec un espace ASCII normal — `toLocaleString`
 * insère une espace insécable ou fine selon l'ICU du runtime, deux
 * caractères hors WinAnsi que `assainir()` supprimerait silencieusement à
 * l'impression (« 1 100 » deviendrait « 1100 » sans même prévenir).
 */
function formaterCompact(montant: number): string {
  const entier = Math.round(montant);
  const signe = entier < 0 ? "-" : "";
  const chiffres = Math.abs(entier).toString();
  const groupes = chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${signe}${groupes}`;
}

export function construireBudgetPrevisionnel(
  d: DonneesBudgetPrevisionnel
): StructureDocument {
  const nbMois = d.periodes.length;
  const colonnes = [
    { libelle: "Poste", largeur: 5 },
    ...d.periodes.map((p) => ({
      libelle: libelleCourt(p.libelle),
      largeur: 2,
      alignement: "droite" as const,
    })),
    { libelle: "Justif.", largeur: 1.4 },
  ];

  const sectionsCalc: SectionBudgetCalc[] = d.sections.map((s) => ({
    sens: s.sens,
    lignes: s.lignes,
  }));

  function tableauSection(section: SectionBudgetGabarit): BlocDocument[] {
    const sousTotal = sousTotalSection(
      { sens: section.sens, lignes: section.lignes },
      nbMois
    );
    return [
      { type: "section", titre: section.libelle },
      {
        type: "tableau",
        colonnes,
        lignes: [
          ...section.lignes.map((l) => [
            l.libelle,
            ...l.valeursMensuelles.map(formaterCompact),
            l.aJustificatif ? "Oui" : "—",
          ]),
          [
            `Sous-total ${section.libelle.toLowerCase()}`,
            ...sousTotal.map(formaterCompact),
            "",
          ],
        ],
      },
    ];
  }

  const sectionsDepenses = d.sections.filter((s) => s.sens === "DEPENSE");
  const sectionsRecettes = d.sections.filter((s) => s.sens === "RECETTE");
  const totalDepenses = totalParSens(sectionsCalc, "DEPENSE", nbMois);
  const totalRecettes = totalParSens(sectionsCalc, "RECETTE", nbMois);
  const bilan = bilanMensuel(totalRecettes, totalDepenses);
  const solde = soldeCumule(d.soldeInitial, bilan);

  return {
    titre: "Budget prévisionnel du mandat",
    sousTitre: `${d.mandat} — version ${d.version}${d.verrouille ? " (verrouillé)" : " (modifiable)"}`,
    reference: d.reference,
    date: formaterDate(d.etabliLe),
    orientation: "paysage",
    filigrane: d.filigrane ?? (d.verrouille ? undefined : "BROUILLON"),
    mentionPied: `Mandat ${d.mandat}`,
    blocs: [
      {
        type: "champs",
        colonnes: 3,
        items: [
          { label: "Mandat", valeur: d.mandat },
          { label: "Établi le", valeur: formaterDate(d.etabliLe) },
          {
            label: "Statut",
            valeur: d.verrouille
              ? "Verrouillé depuis l'AG d'ouverture"
              : "Modifiable — non encore voté",
          },
          {
            label: "Solde de trésorerie à l'ouverture",
            valeur: `${formaterCompact(d.soldeInitial)} DT`,
          },
          { label: "Version", valeur: String(d.version) },
        ],
      },

      ...sectionsDepenses.flatMap(tableauSection),

      { type: "section", titre: "Total dépenses" },
      {
        type: "tableau",
        colonnes,
        lignes: [
          ["TOTAL DÉPENSES BUDGET", ...totalDepenses.map(formaterCompact), ""],
        ],
      },

      ...sectionsRecettes.flatMap(tableauSection),

      { type: "section", titre: "Total recettes" },
      {
        type: "tableau",
        colonnes,
        lignes: [
          ["TOTAL RECETTES BUDGET", ...totalRecettes.map(formaterCompact), ""],
        ],
      },

      { type: "section", titre: "Bilan mensuel" },
      {
        type: "tableau",
        colonnes,
        lignes: [
          [
            "Bilan mensuel (Recettes − Dépenses)",
            ...bilan.map(formaterCompact),
            "",
          ],
          [
            "Solde de trésorerie budgétaire",
            ...solde.map(formaterCompact),
            "",
          ],
        ],
      },

      {
        type: "paragraphe",
        italique: true,
        texte:
          "Montants exprimés en dinars tunisiens, arrondis à l'unité. Les justificatifs marqués « Oui » sont consultables depuis la fiche du budget dans l'application.",
      },

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
