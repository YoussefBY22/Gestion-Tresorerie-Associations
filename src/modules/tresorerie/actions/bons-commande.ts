"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel } from "@/modules/core/models";
import {
  BonCommandeModel,
  FournisseurModel,
} from "@/modules/tresorerie/models";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireBonCommande } from "@/modules/documents/services/gabarits/bon-commande";
import {
  peutChangerStatut,
  totauxBonCommande,
  verifierBonCommande,
} from "@/modules/tresorerie/services/bon-commande";

/**
 * Bons de commande — l'engagement d'une dépense avant qu'elle n'arrive.
 *
 * Le module ne voyait la dépense qu'à la réception de la facture, donc une
 * fois due. Entre la commande et cette facture, l'enveloppe paraissait
 * disponible alors qu'elle était promise.
 *
 * Un bon ne se modifie pas après émission : il porte un numéro d'une série
 * continue et il est parti chez le fournisseur. On le réceptionne, ou on
 * l'annule avec un motif, et on en émet un autre — même principe que la
 * facture et son avoir.
 *
 * Tous les refus sont rendus, jamais levés.
 */

const CHEMINS = [
  "/tresorerie/bons-commande",
  "/tresorerie/declaration",
  "/tresorerie",
  "/documents",
];

function revalider() {
  for (const chemin of CHEMINS) revalidatePath(chemin);
}

export type ResultatBonCommande = { ok: boolean; message: string };

const SchemaLigne = z.object({
  designation: z.string().min(2).max(200),
  quantite: z.coerce.number().min(0),
  prixUnitaire: z.coerce.number().min(0),
});

export async function emettreBonCommande(
  formData: FormData
): Promise<ResultatBonCommande> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");

  let donnees;
  try {
    donnees = z
      .object({
        fournisseur: z.string().min(1).max(200),
        objet: z.string().min(3).max(300),
        tauxTVA: z.coerce.number().min(0).max(100),
        sectionBudget: z.string().max(120).optional(),
        livraisonPrevue: z.coerce.date().optional(),
        lignes: z.string().min(2),
      })
      .parse({
        fournisseur: formData.get("fournisseur"),
        objet: formData.get("objet"),
        tauxTVA: formData.get("tauxTVA") || 19,
        sectionBudget: formData.get("sectionBudget") || undefined,
        livraisonPrevue: formData.get("livraisonPrevue") || undefined,
        lignes: formData.get("lignes"),
      });
  } catch {
    return {
      ok: false,
      message:
        "Saisie incomplète : le fournisseur, l'objet et au moins une ligne sont nécessaires.",
    };
  }

  let lignes;
  try {
    lignes = z.array(SchemaLigne).parse(JSON.parse(donnees.lignes));
  } catch {
    return { ok: false, message: "Les lignes de la commande sont illisibles." };
  }

  const controle = verifierBonCommande({
    fournisseur: donnees.fournisseur,
    objet: donnees.objet,
    lignes,
    tauxTVA: donnees.tauxTVA,
  });
  if (!controle.possible) {
    return { ok: false, message: controle.raison ?? "Bon impossible." };
  }

  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" })
    .select("_id annee")
    .lean();
  if (!mandat) return { ok: false, message: "Aucun mandat actif." };

  const fournisseur = await FournisseurModel.findOne({
    nom: donnees.fournisseur,
  })
    .select("matriculeFiscal adresse")
    .lean();

  const emission = new Date();
  const { id: documentId, reference } = await emettreDocument({
    modele: "BON_COMMANDE",
    mandat,
    titre: `Commande ${donnees.fournisseur} — ${donnees.objet}`,
    session,
    donnees: {
      reference: "",
      fournisseur: donnees.fournisseur,
      fournisseurMatriculeFiscal:
        (fournisseur as { matriculeFiscal?: string } | null)?.matriculeFiscal ||
        undefined,
      fournisseurAdresse:
        (fournisseur as { adresse?: string } | null)?.adresse || undefined,
      objet: donnees.objet,
      lignes,
      tauxTVA: donnees.tauxTVA,
      sectionBudget: donnees.sectionBudget,
      dateEmission: emission,
      livraisonPrevue: donnees.livraisonPrevue,
      mandat: mandat.annee,
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (d, ref) => construireBonCommande({ ...d, reference: ref }),
  });

  const totaux = totauxBonCommande(lignes, donnees.tauxTVA);
  const bon = await BonCommandeModel.create({
    mandat: mandat._id,
    numero: reference,
    fournisseur: donnees.fournisseur,
    objet: donnees.objet,
    lignes,
    tauxTVA: donnees.tauxTVA,
    sectionBudget: donnees.sectionBudget,
    emission,
    livraisonPrevue: donnees.livraisonPrevue,
    document: documentId,
    emisParNom: session.user?.name ?? undefined,
  });

  await journaliser(session, {
    action: "tresorerie.bonCommande.emettre",
    entite: "BonCommande",
    entiteId: String(bon._id),
    details: `${reference} — ${donnees.fournisseur}, ${totaux.totalTTC} DT TTC engagés${
      donnees.sectionBudget ? ` (${donnees.sectionBudget})` : ""
    }`,
  });
  revalider();

  return {
    ok: true,
    message: `${reference} émis : ${totaux.totalTTC
      .toFixed(3)
      .replace(".", ",")} DT TTC engagés auprès de ${donnees.fournisseur}. Le montant reste engagé jusqu'à la réception.`,
  };
}

export async function receptionnerBonCommande(
  formData: FormData
): Promise<ResultatBonCommande> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const { bonId } = z
    .object({ bonId: z.string().min(1) })
    .parse({ bonId: formData.get("bonId") });

  await connectDb();
  const bon = await BonCommandeModel.findById(bonId);
  if (!bon) return { ok: false, message: "Bon de commande introuvable." };

  const controle = peutChangerStatut(bon.statut, "RECEPTIONNE");
  if (!controle.possible) {
    return { ok: false, message: controle.raison ?? "Changement impossible." };
  }

  bon.statut = "RECEPTIONNE";
  bon.receptionLe = new Date();
  await bon.save();

  await journaliser(session, {
    action: "tresorerie.bonCommande.receptionner",
    entite: "BonCommande",
    entiteId: String(bon._id),
    details: `${bon.numero} — ${bon.fournisseur}`,
  });
  revalider();

  return {
    ok: true,
    message: `${bon.numero} réceptionné : le montant n'est plus engagé, c'est la facture reçue qui porte désormais la dépense.`,
  };
}

export async function annulerBonCommande(
  formData: FormData
): Promise<ResultatBonCommande> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ bonId: z.string().min(1), motif: z.string().min(5).max(500) })
    .safeParse({
      bonId: formData.get("bonId"),
      motif: formData.get("motif"),
    });
  if (!donnees.success) {
    return {
      ok: false,
      message:
        "Donnez le motif de l'annulation (au moins cinq caractères) : sans lui, le bon annulé est inexplicable à la relecture.",
    };
  }

  await connectDb();
  const bon = await BonCommandeModel.findById(donnees.data.bonId);
  if (!bon) return { ok: false, message: "Bon de commande introuvable." };

  const controle = peutChangerStatut(bon.statut, "ANNULE");
  if (!controle.possible) {
    return { ok: false, message: controle.raison ?? "Annulation impossible." };
  }

  bon.statut = "ANNULE";
  bon.annuleLe = new Date();
  bon.motifAnnulation = donnees.data.motif;
  await bon.save();

  await journaliser(session, {
    action: "tresorerie.bonCommande.annuler",
    entite: "BonCommande",
    entiteId: String(bon._id),
    details: `${bon.numero} — ${donnees.data.motif}`,
  });
  revalider();

  return {
    ok: true,
    message: `${bon.numero} annulé : son montant n'est plus engagé. La pièce reste au registre, avec son motif.`,
  };
}
