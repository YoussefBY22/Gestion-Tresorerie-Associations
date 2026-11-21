"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel } from "@/modules/core/models";
import {
  BienInventaireModel,
  CATEGORIES_BIEN,
  ETATS_BIEN,
  MOTIFS_MOUVEMENT,
  LIBELLES_MOTIF,
} from "@/modules/tresorerie/models";
import { stockCourant } from "@/modules/tresorerie/services/amortissement";

/**
 * Inventaire physique — exigence CTJE et §7.2 de l'audit financier final.
 */

const SchemaBien = z.object({
  reference: z.string().min(1).max(60),
  designation: z.string().min(2).max(200),
  categorie: z.enum(CATEGORIES_BIEN),
  etat: z.enum(ETATS_BIEN),
  quantiteInitiale: z.coerce.number().min(0),
  valeurUnitaire: z.coerce.number().min(0),
  dateAcquisition: z.coerce.date(),
  dureeAmortissementAnnees: z.coerce.number().min(0).max(50),
  localisation: z.string().max(200).optional(),
});

export async function creerBien(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = SchemaBien.parse({
    reference: formData.get("reference"),
    designation: formData.get("designation"),
    categorie: formData.get("categorie"),
    etat: formData.get("etat"),
    quantiteInitiale: formData.get("quantiteInitiale"),
    valeurUnitaire: formData.get("valeurUnitaire"),
    dateAcquisition: formData.get("dateAcquisition"),
    dureeAmortissementAnnees: formData.get("dureeAmortissementAnnees") || 0,
    localisation: formData.get("localisation") || undefined,
  });

  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" });
  if (!mandat) throw new Error("Aucun mandat actif.");

  const existant = await BienInventaireModel.findOne({
    reference: donnees.reference,
  });
  if (existant) {
    throw new Error(
      `La référence « ${donnees.reference} » existe déjà dans l'inventaire.`
    );
  }

  const bien = await BienInventaireModel.create({
    mandat: mandat._id,
    ...donnees,
  });

  await journaliser(session, {
    action: "inventaire.bien.creer",
    entite: "BienInventaire",
    entiteId: bien._id.toString(),
    details: `${donnees.reference} — ${donnees.designation} (${donnees.quantiteInitiale} u.)`,
  });
  revalidatePath("/tresorerie/inventaire");
}

const SchemaMouvement = z.object({
  motif: z.enum(MOTIFS_MOUVEMENT),
  quantite: z.coerce.number().int(),
  beneficiaire: z.string().max(120).optional(),
  reference: z.string().max(200).optional(),
  commentaire: z.string().max(1000).optional(),
});

/**
 * Fiche de prélèvement (§7.2). Le signe de la quantité est imposé par le
 * motif : on ne peut pas enregistrer une « perte » positive, ni une entrée
 * négative. Le stock ne peut pas non plus devenir négatif.
 */
export async function enregistrerMouvement(id: string, formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = SchemaMouvement.parse({
    motif: formData.get("motif"),
    quantite: formData.get("quantite"),
    beneficiaire: formData.get("beneficiaire") || undefined,
    reference: formData.get("reference") || undefined,
    commentaire: formData.get("commentaire") || undefined,
  });

  if (donnees.quantite === 0) {
    throw new Error("La quantité d'un mouvement ne peut pas être nulle.");
  }

  const estEntree = donnees.motif === "ENTREE";
  const estRegularisation = donnees.motif === "REGULARISATION";
  const amplitude = Math.abs(donnees.quantite);
  const quantiteSignee = estRegularisation
    ? donnees.quantite
    : estEntree
      ? amplitude
      : -amplitude;

  await connectDb();
  const bien = await BienInventaireModel.findById(id);
  if (!bien) throw new Error("Bien introuvable.");

  const stockApres = stockCourant(bien) + quantiteSignee;
  if (stockApres < 0) {
    throw new Error(
      `Stock insuffisant : ${stockCourant(bien)} unité(s) disponible(s) pour « ${bien.designation} ».`
    );
  }

  bien.mouvements.push({
    date: new Date(),
    motif: donnees.motif,
    quantite: quantiteSignee,
    beneficiaire: donnees.beneficiaire,
    reference: donnees.reference,
    commentaire: donnees.commentaire,
    enregistrePar: session.user.id
      ? new (await import("mongoose")).default.Types.ObjectId(session.user.id)
      : undefined,
  });
  await bien.save();

  await journaliser(session, {
    action: "inventaire.mouvement",
    entite: "BienInventaire",
    entiteId: id,
    details: `${bien.reference} — ${LIBELLES_MOTIF[donnees.motif]} ${quantiteSignee > 0 ? "+" : ""}${quantiteSignee} → stock ${stockApres}`,
  });
  revalidatePath("/tresorerie/inventaire");
}

export async function majEtatBien(id: string, formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const etat = z.enum(ETATS_BIEN).parse(formData.get("etat"));

  await connectDb();
  const bien = await BienInventaireModel.findByIdAndUpdate(
    id,
    { etat },
    { new: true }
  );
  if (!bien) throw new Error("Bien introuvable.");

  await journaliser(session, {
    action: "inventaire.bien.etat",
    entite: "BienInventaire",
    entiteId: id,
    details: `${bien.reference} → ${etat}`,
  });
  revalidatePath("/tresorerie/inventaire");
}
