/**
 * Caisse et banque — logique pure, testée.
 *
 * Le drive tenait un classeur « Journal » avec quatre feuilles : le PV de
 * caisse (2 755 lignes), le livre chronologique des recettes et le registre
 * des achats, les soldes mensuels, et le suivi des retraits / versements.
 *
 * L'ERP ne connaissait qu'un solde **global**. Or une association tunisienne
 * doit pouvoir présenter son PV de caisse : la caisse et le compte bancaire
 * sont deux avoirs distincts, et les mouvements de l'un vers l'autre ne sont
 * ni une recette ni une dépense. C'est cette distinction qui manquait.
 */

export const COMPTES = ["CAISSE", "BANQUE"] as const;
export type Compte = (typeof COMPTES)[number];

export const LIBELLES_COMPTE: Record<Compte, string> = {
  CAISSE: "Caisse",
  BANQUE: "Compte bancaire",
};

/** Sens d'un mouvement interne, vu depuis la banque. */
export const SENS_MOUVEMENT = ["RETRAIT", "VERSEMENT"] as const;
export type SensMouvement = (typeof SENS_MOUVEMENT)[number];

export const LIBELLES_SENS: Record<SensMouvement, string> = {
  RETRAIT: "Retrait (banque → caisse)",
  VERSEMENT: "Versement (caisse → banque)",
};

export type FluxPourCaisse = {
  type: "ENCAISSEMENT" | "DECAISSEMENT";
  compte: Compte;
  montant: number;
  date: Date;
  tiers: string;
  categorie: string;
  justificatifRef?: string | null;
};

export type MouvementInterne = {
  sens: SensMouvement;
  montant: number;
  date: Date;
  reference?: string | null;
};

function arrondir(montant: number): number {
  return Math.round(montant * 1000) / 1000;
}

/**
 * Déduit le compte d'un mode de paiement quand il n'est pas renseigné.
 * Les espèces passent par la caisse, tout le reste par la banque — c'est la
 * convention du journal du drive, et elle est vraie dans 99 % des cas.
 */
export function comptePourMode(modePaiement: string | null | undefined): Compte {
  return modePaiement === "ESPECES" ? "CAISSE" : "BANQUE";
}

/* ------------------------------------------------------------------ */
/* Soldes                                                              */
/* ------------------------------------------------------------------ */

export type SoldesComptes = { caisse: number; banque: number; total: number };

/**
 * Soldes par compte à une date donnée.
 *
 * Un mouvement interne déplace de l'argent sans en créer : il modifie les
 * deux soldes en sens opposé et laisse le total inchangé. C'est l'invariant
 * qui permet de rapprocher ce calcul du solde global existant.
 */
export function soldesParCompte(
  initiaux: { caisse: number; banque: number },
  flux: FluxPourCaisse[],
  mouvements: MouvementInterne[] = [],
  jusqua?: Date
): SoldesComptes {
  let caisse = initiaux.caisse;
  let banque = initiaux.banque;

  for (const f of flux) {
    if (jusqua && f.date > jusqua) continue;
    const signe = f.type === "ENCAISSEMENT" ? 1 : -1;
    if (f.compte === "CAISSE") caisse += signe * f.montant;
    else banque += signe * f.montant;
  }

  for (const m of mouvements) {
    if (jusqua && m.date > jusqua) continue;
    if (m.sens === "RETRAIT") {
      banque -= m.montant;
      caisse += m.montant;
    } else {
      caisse -= m.montant;
      banque += m.montant;
    }
  }

  return {
    caisse: arrondir(caisse),
    banque: arrondir(banque),
    total: arrondir(caisse + banque),
  };
}

/* ------------------------------------------------------------------ */
/* Rapprochement bancaire                                              */
/* ------------------------------------------------------------------ */

export type SoldeBancaire = {
  /** Montant à afficher comme solde du compte. */
  valeur: number;
  /** D'où il vient : du relevé de la banque, ou du calcul faute de relevé. */
  source: "RELEVE" | "CALCULE";
  /**
   * Relevé moins calcul. `null` sans relevé — on ne compare pas un chiffre
   * à lui-même. Un écart positif : de l'argent est arrivé sans être saisi.
   * Négatif : une opération est saisie mais pas encore créditée.
   */
  ecart: number | null;
};

/**
 * Quel solde bancaire fait foi.
 *
 * Le relevé l'emporte toujours dès qu'il y en a un : c'est le seul chiffre
 * que la banque confirme. Le calcul ne sert plus alors qu'à mesurer l'écart,
 * qui est l'information utile — pas le calcul lui-même.
 */
export function soldeBancaireRetenu(
  theorique: number,
  releve: { solde: number } | null | undefined
): SoldeBancaire {
  if (!releve) return { valeur: arrondir(theorique), source: "CALCULE", ecart: null };
  return {
    valeur: arrondir(releve.solde),
    source: "RELEVE",
    ecart: arrondir(releve.solde - theorique),
  };
}

/* ------------------------------------------------------------------ */
/* Feuille de caisse                                                   */
/* ------------------------------------------------------------------ */

export type LigneJournal = {
  date: Date;
  libelle: string;
  reference: string;
  /** Entrée d'argent sur le compte considéré. */
  credit: number;
  /** Sortie d'argent du compte considéré. */
  debit: number;
  soldeCourant: number;
  sansJustificatif: boolean;
};

/**
 * Feuille chronologique d'un compte, avec solde courant après chaque
 * opération — le « PV de caisse » attendu par l'auditeur.
 *
 * Le tri est stable à date égale : deux opérations du même jour gardent
 * l'ordre dans lequel elles ont été fournies, sinon le solde courant
 * changerait d'un affichage à l'autre.
 */
export function feuilleDeCompte(
  compte: Compte,
  soldeInitial: number,
  flux: FluxPourCaisse[],
  mouvements: MouvementInterne[] = []
): { lignes: LigneJournal[]; soldeFinal: number } {
  type Brut = {
    date: Date;
    libelle: string;
    reference: string;
    credit: number;
    debit: number;
    sansJustificatif: boolean;
    ordre: number;
  };

  const bruts: Brut[] = [];
  let ordre = 0;

  for (const f of flux) {
    if (f.compte !== compte) continue;
    const entree = f.type === "ENCAISSEMENT";
    bruts.push({
      date: f.date,
      libelle: `${f.tiers} — ${f.categorie}`,
      reference: f.justificatifRef?.trim() || "",
      credit: entree ? f.montant : 0,
      debit: entree ? 0 : f.montant,
      sansJustificatif: !f.justificatifRef?.trim(),
      ordre: ordre++,
    });
  }

  for (const m of mouvements) {
    // Un retrait alimente la caisse et débite la banque ; un versement fait
    // l'inverse. Le mouvement apparaît donc dans les deux feuilles, en sens
    // opposé.
    const entree =
      (compte === "CAISSE" && m.sens === "RETRAIT") ||
      (compte === "BANQUE" && m.sens === "VERSEMENT");
    bruts.push({
      date: m.date,
      libelle: LIBELLES_SENS[m.sens],
      reference: m.reference?.trim() || "",
      credit: entree ? m.montant : 0,
      debit: entree ? 0 : m.montant,
      // Un virement interne n'appelle pas de justificatif externe.
      sansJustificatif: false,
      ordre: ordre++,
    });
  }

  bruts.sort((a, b) => a.date.getTime() - b.date.getTime() || a.ordre - b.ordre);

  let solde = soldeInitial;
  const lignes: LigneJournal[] = bruts.map((b) => {
    solde = arrondir(solde + b.credit - b.debit);
    return {
      date: b.date,
      libelle: b.libelle,
      reference: b.reference,
      credit: b.credit,
      debit: b.debit,
      soldeCourant: solde,
      sansJustificatif: b.sansJustificatif,
    };
  });

  return { lignes, soldeFinal: arrondir(solde) };
}

/* ------------------------------------------------------------------ */
/* Soldes mensuels                                                     */
/* ------------------------------------------------------------------ */

export type SoldeMensuel = {
  mois: string;
  entrees: number;
  sorties: number;
  caisse: number;
  banque: number;
  total: number;
};

function moisDe(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Tableau des soldes de fin de mois, du premier au dernier mois mouvementé.
 *
 * Les mois sans aucune opération sont **conservés** : un trou dans la série
 * ferait croire à un oubli de saisie, alors qu'il signifie seulement qu'il ne
 * s'est rien passé — et l'auditeur veut voir la continuité.
 */
export function soldesMensuels(
  initiaux: { caisse: number; banque: number },
  flux: FluxPourCaisse[],
  mouvements: MouvementInterne[] = []
): SoldeMensuel[] {
  const dates = [...flux.map((f) => f.date), ...mouvements.map((m) => m.date)];
  if (dates.length === 0) return [];

  const debut = new Date(Math.min(...dates.map((d) => d.getTime())));
  const fin = new Date(Math.max(...dates.map((d) => d.getTime())));

  const resultats: SoldeMensuel[] = [];
  const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);

  while (
    curseur.getFullYear() < fin.getFullYear() ||
    (curseur.getFullYear() === fin.getFullYear() &&
      curseur.getMonth() <= fin.getMonth())
  ) {
    const mois = moisDe(curseur);
    // Dernier instant du mois : le solde de clôture inclut le 31 à 23h59.
    const finDuMois = new Date(
      curseur.getFullYear(),
      curseur.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const duMois = flux.filter((f) => moisDe(f.date) === mois);
    const soldes = soldesParCompte(initiaux, flux, mouvements, finDuMois);

    resultats.push({
      mois,
      entrees: arrondir(
        duMois
          .filter((f) => f.type === "ENCAISSEMENT")
          .reduce((s, f) => s + f.montant, 0)
      ),
      sorties: arrondir(
        duMois
          .filter((f) => f.type === "DECAISSEMENT")
          .reduce((s, f) => s + f.montant, 0)
      ),
      ...soldes,
    });

    curseur.setMonth(curseur.getMonth() + 1);
  }

  return resultats;
}
