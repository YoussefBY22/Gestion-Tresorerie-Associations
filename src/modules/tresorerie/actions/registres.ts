"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { MandatModel } from "@/modules/core/models";
import {
  ChequeOuDetteModel,
  DonModel,
  FactureFournisseurModel,
  FournisseurModel,
  NATURES_DON,
  ORIGINES_DON,
  PROVENANCES_DON,
  STATUTS_CHEQUE_DETTE,
  TYPES_CHEQUE_DETTE,
} from "@/modules/tresorerie/models";

/**
 * Registres financiers (Fournisseurs, Dons, Chèques et dettes) — les
 * registres qui n'ont pas déjà de modèle ailleurs dans l'application. Le registre
 * Clients, le registre des Créances et le registre des Cotisations sont des
 * VUES : ils se déduisent des projets, factures et cotisations existants
 * (ADR-010) et n'ont pas d'action d'écriture ici.
 *
 * Chaque ligne se corrige et se retire — un registre qu'on ne peut
 * qu'alimenter finit par accumuler les fautes de frappe, et le seul recours
 * était de contourner l'application. Les suppressions passent toutes par la
 * corbeille : trente jours pour se raviser, comme partout ailleurs.
 */

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" }).select("_id");
  if (!mandat) throw new Error("Aucun mandat actif.");
  return mandat;
}

/* ------------------------------------------------------------------ */
/* Fournisseurs                                                        */
/* ------------------------------------------------------------------ */

export async function creerFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      nom: z.string().min(2).max(150),
      adresse: z.string().max(300).optional(),
      matriculeFiscal: z.string().max(50).optional(),
      naturePrestation: z.string().max(200).optional(),
    })
    .parse({
      nom: formData.get("nom"),
      adresse: formData.get("adresse") || undefined,
      matriculeFiscal: formData.get("matriculeFiscal") || undefined,
      naturePrestation: formData.get("naturePrestation") || undefined,
    });

  await connectDb();
  const existant = await FournisseurModel.findOne({ nom: donnees.nom }).select("_id").lean();
  if (existant) throw new Error("Ce fournisseur est déjà enregistré.");

  const fournisseur = await FournisseurModel.create(donnees);
  await journaliser(session, {
    action: "tresorerie.fournisseur.creer",
    entite: "Fournisseur",
    entiteId: fournisseur._id.toString(),
    details: donnees.nom,
  });
  revalidatePath("/tresorerie/registres/fournisseurs");
}

export async function basculerVerificationFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const fournisseurId = z.string().min(1).parse(formData.get("fournisseurId"));

  await connectDb();
  const fournisseur = await FournisseurModel.findById(fournisseurId);
  if (!fournisseur) throw new Error("Fournisseur introuvable.");
  fournisseur.verifie = !fournisseur.verifie;
  await fournisseur.save();

  await journaliser(session, {
    action: "tresorerie.fournisseur.verification",
    entite: "Fournisseur",
    entiteId: fournisseurId,
    details: fournisseur.verifie ? "Vérifié" : "Non vérifié",
  });
  revalidatePath("/tresorerie/registres/fournisseurs");
}

export async function evaluerFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      fournisseurId: z.string().min(1),
      evaluation: z.coerce.number().min(0).max(5),
    })
    .parse({
      fournisseurId: formData.get("fournisseurId"),
      evaluation: formData.get("evaluation"),
    });

  await connectDb();
  const fournisseur = await FournisseurModel.findById(donnees.fournisseurId);
  if (!fournisseur) throw new Error("Fournisseur introuvable.");
  fournisseur.evaluation = donnees.evaluation;
  await fournisseur.save();

  await journaliser(session, {
    action: "tresorerie.fournisseur.evaluer",
    entite: "Fournisseur",
    entiteId: donnees.fournisseurId,
    details: String(donnees.evaluation),
  });
  revalidatePath("/tresorerie/registres/fournisseurs");
}

/** Corrige la fiche d'un fournisseur — matricule mal recopiée, adresse. */
export async function modifierFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      fournisseurId: z.string().min(1),
      nom: z.string().min(2).max(150),
      adresse: z.string().max(300).optional(),
      matriculeFiscal: z.string().max(50).optional(),
      naturePrestation: z.string().max(200).optional(),
    })
    .parse({
      fournisseurId: formData.get("fournisseurId"),
      nom: formData.get("nom"),
      adresse: formData.get("adresse") || undefined,
      matriculeFiscal: formData.get("matriculeFiscal") || undefined,
      naturePrestation: formData.get("naturePrestation") || undefined,
    });

  await connectDb();
  const fournisseur = await FournisseurModel.findById(donnees.fournisseurId);
  if (!fournisseur) throw new Error("Fournisseur introuvable.");

  const homonyme = await FournisseurModel.findOne({
    nom: donnees.nom,
    _id: { $ne: fournisseur._id },
  })
    .select("_id")
    .lean();
  if (homonyme) throw new Error("Un autre fournisseur porte déjà ce nom.");

  const avant = `${fournisseur.nom}${fournisseur.matriculeFiscal ? ` (${fournisseur.matriculeFiscal})` : ""}`;
  fournisseur.set({
    nom: donnees.nom,
    adresse: donnees.adresse,
    matriculeFiscal: donnees.matriculeFiscal,
    naturePrestation: donnees.naturePrestation,
  });
  await fournisseur.save();

  await journaliser(session, {
    action: "tresorerie.fournisseur.modifier",
    entite: "Fournisseur",
    entiteId: donnees.fournisseurId,
    details: `${avant} → ${donnees.nom}${donnees.matriculeFiscal ? ` (${donnees.matriculeFiscal})` : ""}`,
  });
  revalidatePath("/tresorerie/registres/fournisseurs");
}

export async function supprimerFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const fournisseurId = z.string().min(1).parse(formData.get("fournisseurId"));

  await connectDb();
  const fournisseur = await FournisseurModel.findById(fournisseurId).lean();
  if (!fournisseur) throw new Error("Fournisseur introuvable.");

  // Les factures reçues citent le fournisseur par son nom : le retirer du
  // registre alors qu'il a déjà engagé la JE effacerait la trace de la
  // vérification de matricule que l'audit demande précisément de garder.
  const factures = await FactureFournisseurModel.countDocuments({
    fournisseur: fournisseur.nom,
  });
  if (factures > 0) {
    throw new Error(
      `${fournisseur.nom} porte ${factures} facture(s) reçue(s) : le registre doit en garder la trace. Corrigez la fiche plutôt que de la supprimer.`
    );
  }

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "FOURNISSEUR",
    titre: fournisseur.nom,
    description: fournisseur.matriculeFiscal
      ? `Matricule fiscal ${fournisseur.matriculeFiscal}`
      : "Sans matricule fiscal",
    donnees: fournisseur,
    session,
  });
  await FournisseurModel.deleteOne({ _id: fournisseur._id });

  await journaliser(session, {
    action: "tresorerie.fournisseur.supprimer",
    entite: "Fournisseur",
    entiteId: fournisseurId,
    details: `${fournisseur.nom} — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/registres/fournisseurs");
  revalidatePath("/corbeille");
}

/* ------------------------------------------------------------------ */
/* Dons                                                                 */
/* ------------------------------------------------------------------ */

/** Mêmes champs à la création et à la correction : un don se relit en entier. */
const SchemaDon = z.object({
  donateur: z.string().min(2).max(200),
  cin: z.string().max(20).optional(),
  nature: z.enum(NATURES_DON),
  montant: z.coerce.number().min(0).optional(),
  descriptionNature: z.string().max(500).optional(),
  origine: z.enum(ORIGINES_DON),
  provenance: z.enum(PROVENANCES_DON),
  date: z.coerce.date(),
  objet: z.string().max(300).optional(),
});

function lireDon(formData: FormData) {
  const donnees = SchemaDon.parse({
    donateur: formData.get("donateur"),
    cin: formData.get("cin") || undefined,
    nature: formData.get("nature") || "NUMERAIRE",
    montant: formData.get("montant") || undefined,
    descriptionNature: formData.get("descriptionNature") || undefined,
    origine: formData.get("origine") || "PRIVEE",
    provenance: formData.get("provenance") || "NATIONALE",
    date: formData.get("date") || new Date(),
    objet: formData.get("objet") || undefined,
  });
  if (donnees.nature === "NATURE" && !donnees.descriptionNature?.trim()) {
    throw new Error("Décrivez le bien pour un don en nature.");
  }
  return donnees;
}

export async function enregistrerDon(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = lireDon(formData);

  await connectDb();
  const mandat = await mandatActifRequis();
  const don = await DonModel.create({ mandat: mandat._id, ...donnees });

  await journaliser(session, {
    action: "tresorerie.don.enregistrer",
    entite: "Don",
    entiteId: don._id.toString(),
    details: `${donnees.donateur} — ${donnees.nature}`,
  });
  revalidatePath("/tresorerie/registres/dons");
}

export async function modifierDon(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donId = z.string().min(1).parse(formData.get("donId"));
  const donnees = lireDon(formData);

  await connectDb();
  const don = await DonModel.findById(donId);
  if (!don) throw new Error("Don introuvable.");

  const avant = `${don.donateur} — ${don.nature}`;
  don.set({
    ...donnees,
    // Un don passé en nature n'a plus de montant, et l'inverse n'a plus de
    // description : laisser l'ancien champ derrière ferait une ligne qui se
    // contredit elle-même au registre.
    montant: donnees.nature === "NUMERAIRE" ? donnees.montant : undefined,
    descriptionNature:
      donnees.nature === "NATURE" ? donnees.descriptionNature : undefined,
  });
  await don.save();

  await journaliser(session, {
    action: "tresorerie.don.modifier",
    entite: "Don",
    entiteId: donId,
    details: `${avant} → ${donnees.donateur} — ${donnees.nature}`,
  });
  revalidatePath("/tresorerie/registres/dons");
}

export async function supprimerDon(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donId = z.string().min(1).parse(formData.get("donId"));

  await connectDb();
  const don = await DonModel.findById(donId).lean();
  if (!don) throw new Error("Don introuvable.");

  const objet =
    don.nature === "NUMERAIRE"
      ? `${don.montant ?? 0} DT`
      : (don.descriptionNature ?? "don en nature");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "DON",
    titre: `${don.donateur} — ${objet}`,
    description: `Reçu le ${new Date(don.date).toLocaleDateString("fr-FR")}`,
    donnees: don,
    session,
  });
  await DonModel.deleteOne({ _id: don._id });

  await journaliser(session, {
    action: "tresorerie.don.supprimer",
    entite: "Don",
    entiteId: donId,
    details: `${don.donateur} — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/registres/dons");
  revalidatePath("/corbeille");
}

/* ------------------------------------------------------------------ */
/* Chèques et dettes                                                   */
/* ------------------------------------------------------------------ */

export async function enregistrerChequeOuDette(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      type: z.enum(TYPES_CHEQUE_DETTE),
      tiers: z.string().min(2).max(200),
      montant: z.coerce.number().min(0.01),
      dateEmission: z.coerce.date(),
      dateEcheance: z.coerce.date().optional(),
      reference: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    })
    .parse({
      type: formData.get("type"),
      tiers: formData.get("tiers"),
      montant: formData.get("montant"),
      dateEmission: formData.get("dateEmission") || new Date(),
      dateEcheance: formData.get("dateEcheance") || undefined,
      reference: formData.get("reference") || undefined,
      notes: formData.get("notes") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const ligne = await ChequeOuDetteModel.create({ mandat: mandat._id, ...donnees });

  await journaliser(session, {
    action: "tresorerie.chequeOuDette.enregistrer",
    entite: "ChequeOuDette",
    entiteId: ligne._id.toString(),
    details: `${donnees.type} — ${donnees.tiers} — ${donnees.montant} DT`,
  });
  revalidatePath("/tresorerie/registres/cheques-dettes");
}

export async function majStatutChequeOuDette(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      ligneId: z.string().min(1),
      statut: z.enum(STATUTS_CHEQUE_DETTE),
    })
    .parse({
      ligneId: formData.get("ligneId"),
      statut: formData.get("statut"),
    });

  await connectDb();
  const ligne = await ChequeOuDetteModel.findById(donnees.ligneId);
  if (!ligne) throw new Error("Ligne introuvable.");
  ligne.statut = donnees.statut;
  await ligne.save();

  await journaliser(session, {
    action: "tresorerie.chequeOuDette.statut",
    entite: "ChequeOuDette",
    entiteId: donnees.ligneId,
    details: donnees.statut,
  });
  revalidatePath("/tresorerie/registres/cheques-dettes");
}

/** Corrige une ligne du registre des chèques et dettes. */
export async function modifierChequeOuDette(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      ligneId: z.string().min(1),
      type: z.enum(TYPES_CHEQUE_DETTE),
      tiers: z.string().min(2).max(200),
      montant: z.coerce.number().min(0.01),
      dateEmission: z.coerce.date(),
      dateEcheance: z.coerce.date().optional(),
      statut: z.enum(STATUTS_CHEQUE_DETTE),
      reference: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    })
    .parse({
      ligneId: formData.get("ligneId"),
      type: formData.get("type"),
      tiers: formData.get("tiers"),
      montant: formData.get("montant"),
      dateEmission: formData.get("dateEmission") || new Date(),
      dateEcheance: formData.get("dateEcheance") || undefined,
      statut: formData.get("statut"),
      reference: formData.get("reference") || undefined,
      notes: formData.get("notes") || undefined,
    });

  await connectDb();
  const ligne = await ChequeOuDetteModel.findById(donnees.ligneId);
  if (!ligne) throw new Error("Ligne introuvable.");

  const avant = `${ligne.type} — ${ligne.tiers} — ${ligne.montant} DT (${ligne.statut})`;
  ligne.set({
    type: donnees.type,
    tiers: donnees.tiers,
    montant: donnees.montant,
    dateEmission: donnees.dateEmission,
    dateEcheance: donnees.dateEcheance,
    statut: donnees.statut,
    reference: donnees.reference,
    notes: donnees.notes,
  });
  await ligne.save();

  await journaliser(session, {
    action: "tresorerie.chequeOuDette.modifier",
    entite: "ChequeOuDette",
    entiteId: donnees.ligneId,
    details: `${avant} → ${donnees.type} — ${donnees.tiers} — ${donnees.montant} DT (${donnees.statut})`,
  });
  revalidatePath("/tresorerie/registres/cheques-dettes");
}

export async function supprimerChequeOuDette(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const ligneId = z.string().min(1).parse(formData.get("ligneId"));

  await connectDb();
  const ligne = await ChequeOuDetteModel.findById(ligneId).lean();
  if (!ligne) throw new Error("Ligne introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "CHEQUE_DETTE",
    titre: `${ligne.tiers} — ${ligne.montant} DT`,
    description: `${ligne.type} du ${new Date(ligne.dateEmission).toLocaleDateString("fr-FR")}${ligne.reference ? ` · ${ligne.reference}` : ""}`,
    donnees: ligne,
    session,
  });
  await ChequeOuDetteModel.deleteOne({ _id: ligne._id });

  await journaliser(session, {
    action: "tresorerie.chequeOuDette.supprimer",
    entite: "ChequeOuDette",
    entiteId: ligneId,
    details: `${ligne.type} — ${ligne.tiers} — ${ligne.montant} DT — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/registres/cheques-dettes");
  revalidatePath("/corbeille");
}
