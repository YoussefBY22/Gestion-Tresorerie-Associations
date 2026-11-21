/**
 * Documentation financière — logique pure.
 *
 * Le Trésorier produit des pièces toute l'année (reçus, factures, rapports
 * mensuels, budget) et n'avait aucun endroit pour voir *ce qui manque*. La
 * bibliothèque documentaire montre ce qui existe ; c'est le contraire qui
 * pose problème à l'audit.
 */

export type DocumentEmis = { modele: string; categorie: string; emisLe: Date };

/** Nombre de pièces émises par catégorie du catalogue. */
export function compterParCategorie(
  documents: DocumentEmis[]
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const d of documents) total[d.categorie] = (total[d.categorie] ?? 0) + 1;
  return total;
}

export type RapportsDuMois = { mois: string; libelle: string; total: number };

/**
 * Rapports produits mois par mois sur toute la période du mandat.
 *
 * Les mois sans rapport sont **conservés** et à zéro : c'est précisément le
 * trou qu'on cherche à voir. Une série qui saute les mois vides donne
 * l'illusion d'une production régulière.
 */
export function rapportsParMois(
  documents: DocumentEmis[],
  periodes: { cle: string; libelle: string }[]
): RapportsDuMois[] {
  const compte = new Map<string, number>();
  for (const d of documents) {
    const cle = `${d.emisLe.getFullYear()}-${String(d.emisLe.getMonth() + 1).padStart(2, "0")}`;
    compte.set(cle, (compte.get(cle) ?? 0) + 1);
  }
  return periodes.map((p) => ({
    mois: p.cle,
    libelle: p.libelle,
    total: compte.get(p.cle) ?? 0,
  }));
}

export type ModeleAttendu = { code: string; libelle: string };

/**
 * Modèles du catalogue qu'aucune pièce n'a encore utilisés sur ce mandat.
 *
 * Un modèle jamais émis n'est pas forcément un oubli — on ne fait pas de don
 * tous les ans. C'est une liste à regarder, pas une liste de fautes ; d'où le
 * mot « manquant » et non « en retard ».
 */
export function modelesJamaisEmis(
  catalogue: ModeleAttendu[],
  documents: DocumentEmis[]
): ModeleAttendu[] {
  const emis = new Set(documents.map((d) => d.modele));
  return catalogue.filter((m) => !emis.has(m.code));
}
