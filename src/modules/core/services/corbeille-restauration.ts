import { connectDb } from "@/lib/db";
import { DocumentModel } from "@/modules/documents/models";
import { CharteDocumentModel } from "@/modules/documents/models/CharteDocument";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import { AssembleeGeneraleModel } from "@/modules/base/models";
import {
  BudgetPrevisionnelModel,
  ChequeOuDetteModel,
  DonModel,
  FactureModel,
  FicheClientModel,
  FluxTresorerieModel,
  FournisseurModel,
  MouvementInterneModel,
  TypeRecuModel,
} from "@/modules/tresorerie/models";
import {
  CotisationModel,
} from "@/modules/base/models";
import { budgetVerrouille } from "@/modules/tresorerie/services/budget-previsionnel";
import type { TypeElementCorbeille } from "../models/ElementCorbeille";

/**
 * Restauration d'un élément de la corbeille.
 *
 * La corbeille stocke une photo neutre ; savoir la remettre à sa place est
 * propre à chaque type, d'où cet aiguillage. Une restauration n'est pas un
 * passe-droit : elle repasse par les mêmes règles que l'écriture normale
 * (un budget verrouillé le reste), et échoue franchement plutôt que de
 * recréer une donnée dans un état incohérent.
 */

export type DonneesLigneBudget = {
  budgetId: string;
  ligne: Record<string, unknown> & { _id?: unknown; libelle?: string };
};

async function restaurerLigneBudget(donnees: DonneesLigneBudget): Promise<void> {
  const budget = await BudgetPrevisionnelModel.findById(donnees.budgetId);
  if (!budget) {
    throw new Error("Le budget d'origine n'existe plus : restauration impossible.");
  }
  const ouverte = Boolean(
    await AssembleeGeneraleModel.exists({
      mandat: budget.mandat,
      role: "OUVERTURE",
      statut: "TENUE",
    })
  );
  if (budgetVerrouille(ouverte, Boolean(budget.demandeActive))) {
    throw new Error(
      "Le budget est verrouillé depuis l'AG d'ouverture : demandez une modification exceptionnelle avant de restaurer ce poste."
    );
  }
  const deja =
    donnees.ligne._id && budget.lignes.id(String(donnees.ligne._id));
  if (deja) return;

  budget.lignes.push(donnees.ligne as unknown as (typeof budget.lignes)[number]);
  await budget.save();
}

export type DonneesJustificatifBudget = {
  budgetId: string;
  ligneId: string;
  justificatif: Record<string, unknown>;
};

async function restaurerJustificatifBudget(
  donnees: DonneesJustificatifBudget
): Promise<void> {
  const budget = await BudgetPrevisionnelModel.findById(donnees.budgetId);
  const ligne = budget?.lignes.id(donnees.ligneId);
  if (!budget || !ligne) {
    throw new Error(
      "Le poste budgétaire d'origine n'existe plus : restaurez-le d'abord, son justificatif suivra."
    );
  }
  if (ligne.justificatif?.fichierId) {
    throw new Error(
      "Ce poste porte déjà un justificatif : retirez-le avant de restaurer l'ancien."
    );
  }
  ligne.justificatif = donnees.justificatif as (typeof ligne)["justificatif"];
  await budget.save();
}

/**
 * Une opération du journal se restaure telle quelle, identifiant compris :
 * les pièces qui la citent (facture encaissée, reçu émis) la retrouvent.
 */
async function restaurerFlux(donnees: Record<string, unknown>): Promise<void> {
  if (await FluxTresorerieModel.exists({ _id: donnees._id as string })) return;
  await FluxTresorerieModel.create(donnees);
}

async function restaurerMouvementInterne(
  donnees: Record<string, unknown>
): Promise<void> {
  if (await MouvementInterneModel.exists({ _id: donnees._id as string })) return;
  await MouvementInterneModel.create(donnees);
}

async function restaurerFacture(donnees: Record<string, unknown>): Promise<void> {
  if (await FactureModel.exists({ numero: donnees.numero as string })) return;
  await FactureModel.create(donnees);
}

async function restaurerFicheClient(donnees: Record<string, unknown>): Promise<void> {
  if (await FicheClientModel.exists({ projet: donnees.projet as string })) return;
  await FicheClientModel.create(donnees);
}

/** Une pièce se raccroche à sa fiche ; sans fiche, il n'y a nulle part où la remettre. */
async function restaurerPieceClient(donnees: {
  projetId: string;
  piece: Record<string, unknown>;
}): Promise<void> {
  const fiche = await FicheClientModel.findOne({ projet: donnees.projetId });
  if (!fiche) {
    throw new Error(
      "La fiche client d'origine n'existe plus : restaurez-la d'abord, ses pièces suivront."
    );
  }
  fiche.justificatifs.push(donnees.piece as never);
  await fiche.save();
}

/**
 * Une cotisation se remet en place telle quelle. Le cotisant, lui, n'a
 * jamais quitté le registre des adhérents : supprimer une cotisation retire
 * un paiement, pas une personne.
 */
async function restaurerCotisation(donnees: Record<string, unknown>): Promise<void> {
  if (await CotisationModel.exists({ _id: donnees._id as string })) return;
  const doublon = await CotisationModel.exists({
    mandat: donnees.mandat as string,
    membre: donnees.membre as string,
  });
  if (doublon) {
    throw new Error(
      "Ce membre a déjà une cotisation sur ce mandat : elle a été ressaisie depuis la suppression."
    );
  }
  await CotisationModel.create(donnees);
}

async function restaurerDon(donnees: Record<string, unknown>): Promise<void> {
  if (await DonModel.exists({ _id: donnees._id as string })) return;
  await DonModel.create(donnees);
}

async function restaurerFournisseur(donnees: Record<string, unknown>): Promise<void> {
  if (await FournisseurModel.exists({ nom: donnees.nom as string })) return;
  await FournisseurModel.create(donnees);
}

async function restaurerChequeOuDette(
  donnees: Record<string, unknown>
): Promise<void> {
  if (await ChequeOuDetteModel.exists({ _id: donnees._id as string })) return;
  await ChequeOuDetteModel.create(donnees);
}

/**
 * Une famille de reçus revient telle qu'elle était, et redevient proposée.
 *
 * Deux cas sous la même donnée : une famille de la JE avait vu sa ligne
 * supprimée, on la recrée ; une famille du catalogue vit en code et n'a pu
 * qu'être marquée inactive, on la réactive. Dans les deux cas elle reparaît
 * dans la liste — c'est ce qu'on attend d'une restauration.
 */
async function restaurerFamilleRecu(
  donnees: Record<string, unknown>
): Promise<void> {
  const existante = donnees.modele
    ? await TypeRecuModel.findOne({ modele: donnees.modele as string })
    : await TypeRecuModel.findOne({ code: donnees.code as string });

  if (existante) {
    existante.actif = true;
    await existante.save();
    return;
  }
  await TypeRecuModel.create({ ...donnees, actif: true });
}

/** Un modèle de document revient tel quel, logo compris. */
async function restaurerCharteDocument(
  donnees: Record<string, unknown>
): Promise<void> {
  if (await CharteDocumentModel.exists({ _id: donnees._id as string })) return;
  await CharteDocumentModel.create(donnees);
}

/** Un modèle de mise en page revient tel quel, ses images comprises. */
async function restaurerModeleDocument(
  donnees: Record<string, unknown>
): Promise<void> {
  if (await ModeleDocumentModel.exists({ _id: donnees._id as string })) return;
  await ModeleDocumentModel.create(donnees);
}

async function restaurerDocument(donnees: Record<string, unknown>): Promise<void> {
  const reference = donnees.reference;
  if (typeof reference !== "string") {
    throw new Error("Document illisible dans la corbeille : référence absente.");
  }
  if (await DocumentModel.exists({ reference })) return;
  await DocumentModel.create(donnees);

  // Un reçu restauré redevient le justificatif de son flux, comme avant sa
  // suppression — sans quoi l'opération resterait « en attente de pièce »
  // alors que la pièce est de retour.
  if (donnees.objetType === "FluxTresorerie" && donnees.objetId) {
    await FluxTresorerieModel.updateOne(
      { _id: donnees.objetId as string, justificatifRef: { $in: [null, ""] } },
      { $set: { justificatifRef: reference } }
    );
  }
}

export async function restaurerElement(
  type: TypeElementCorbeille,
  donnees: unknown
): Promise<void> {
  await connectDb();
  switch (type) {
    case "LIGNE_BUDGET":
      return restaurerLigneBudget(donnees as DonneesLigneBudget);
    case "JUSTIFICATIF_BUDGET":
      return restaurerJustificatifBudget(donnees as DonneesJustificatifBudget);
    case "FLUX":
      return restaurerFlux(donnees as Record<string, unknown>);
    case "MOUVEMENT_INTERNE":
      return restaurerMouvementInterne(donnees as Record<string, unknown>);
    case "FACTURE":
      return restaurerFacture(donnees as Record<string, unknown>);
    case "FICHE_CLIENT":
      return restaurerFicheClient(donnees as Record<string, unknown>);
    case "PIECE_CLIENT":
      return restaurerPieceClient(
        donnees as { projetId: string; piece: Record<string, unknown> }
      );
    case "COTISATION":
      return restaurerCotisation(donnees as Record<string, unknown>);
    case "DON":
      return restaurerDon(donnees as Record<string, unknown>);
    case "FOURNISSEUR":
      return restaurerFournisseur(donnees as Record<string, unknown>);
    case "CHEQUE_DETTE":
      return restaurerChequeOuDette(donnees as Record<string, unknown>);
    case "FAMILLE_RECU":
      return restaurerFamilleRecu(donnees as Record<string, unknown>);
    case "CHARTE_DOCUMENT":
      return restaurerCharteDocument(donnees as Record<string, unknown>);
    case "MODELE_DOCUMENT":
      return restaurerModeleDocument(donnees as Record<string, unknown>);
    case "DOCUMENT":
      return restaurerDocument(donnees as Record<string, unknown>);
  }
}

/** Chemin de retour proposé après restauration, par type. */
export function cheminApresRestauration(type: TypeElementCorbeille): string[] {
  switch (type) {
    case "LIGNE_BUDGET":
      return ["/tresorerie/budget", "/tresorerie"];
    case "JUSTIFICATIF_BUDGET":
      return ["/tresorerie/budget"];
    case "FLUX":
      return ["/tresorerie/flux", "/tresorerie/caisse", "/tresorerie/recus", "/tresorerie"];
    case "MOUVEMENT_INTERNE":
      return ["/tresorerie/caisse", "/tresorerie"];
    case "FACTURE":
      return ["/tresorerie/factures", "/tresorerie"];
    case "FICHE_CLIENT":
    case "PIECE_CLIENT":
      return ["/tresorerie/registres/clients", "/tresorerie/registres"];
    case "COTISATION":
      return [
        "/tresorerie/registres/cotisations",
        "/tresorerie/recus",
        "/tresorerie/registres",
      ];
    case "DON":
      return ["/tresorerie/registres/dons", "/tresorerie/registres"];
    case "FOURNISSEUR":
      return ["/tresorerie/registres/fournisseurs", "/tresorerie/registres"];
    case "CHEQUE_DETTE":
      return ["/tresorerie/registres/cheques-dettes", "/tresorerie/registres"];
    case "FAMILLE_RECU":
      return ["/tresorerie/recus"];
    case "CHARTE_DOCUMENT":
    case "MODELE_DOCUMENT":
      return ["/tresorerie/documentation/modeles", "/documents"];
    case "DOCUMENT":
      return ["/documents", "/tresorerie/budget"];
  }
}
