"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission, exigerPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel, MembreModel } from "@/modules/core/models";
import { CotisationModel } from "@/modules/base/models";
import { FluxTresorerieModel, TypeRecuModel } from "@/modules/tresorerie/models";
import { modeleRequis } from "../catalogue";
import { DocumentModel } from "../models";
import { emettreDocument } from "../services/emission";
import { supprimerFichier } from "../services/stockage";
import { construireRecuCotisation } from "../services/gabarits/recu-cotisation";
import { construireRecuEncaissement } from "../services/gabarits/recu-encaissement";

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" }).lean();
  if (!mandat) throw new Error("Aucun mandat actif.");
  return { _id: mandat._id, annee: mandat.annee };
}

/* ------------------------------------------------------------------ */
/* Reçu de cotisation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Émet le reçu d'une cotisation payée.
 *
 * C'est le premier modèle branché sur le moteur : sur le drive, cette
 * opération signifiait dupliquer un PPTX, changer le nom, changer le numéro à
 * la main, exporter en PDF — environ 70 fois par mandat.
 */
export async function genererRecuCotisation(formData: FormData) {
  const modele = modeleRequis("RECU_COTISATION");
  const session = await exigerModuleEtPermission(modele.module, "ecrire");

  const { cotisationId, modePaiement } = z
    .object({
      cotisationId: z.string().min(1),
      modePaiement: z.string().max(60).optional(),
    })
    .parse({
      cotisationId: formData.get("cotisationId"),
      modePaiement: formData.get("modePaiement") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();

  const cotisation = await CotisationModel.findById(cotisationId).lean();
  if (!cotisation) throw new Error("Cotisation introuvable.");
  if (!cotisation.payee) {
    // Un reçu atteste d'un encaissement : pas de reçu sans paiement.
    throw new Error(
      "Cette cotisation n'est pas marquée payée : le reçu ne peut pas être émis."
    );
  }

  // Le membre porte lui-meme son identite : il n'y a plus de compte lie.
  const membre = await MembreModel.findById(cotisation.membre).lean();

  /*
   * Ni poste ni département ici : l'application de trésorerie ne tient pas
   * l'organigramme. Le reçu nomme le cotisant, ce que le décret-loi exige ;
   * sa fonction dans l'association n'y figure pas.
   */
  await emettreDocument({
    modele: modele.code,
    mandat,
    objetType: "Cotisation",
    objetId: cotisation._id,
    titre: `Reçu de cotisation — ${membre?.nom ?? "membre"}`,
    session,
    donnees: {
      reference: "",
      membre: membre?.nom ?? "Membre",
      cin: membre?.cin ?? undefined,
      email: membre?.email ?? undefined,
      qualite: "Membre",
      montant: cotisation.montant ?? 0,
      modePaiement: modePaiement ?? "Espèces",
      datePaiement: cotisation.datePaiement ?? new Date(),
      mandat: mandat.annee,
      emetteur: session.user?.name ?? undefined,
    },
    // La référence n'est connue qu'après réservation du numéro : le gabarit
    // la reçoit en second paramètre.
    gabarit: (donnees, ref) => construireRecuCotisation({ ...donnees, reference: ref }),
  });

  revalidatePath("/tresorerie/recus");
  revalidatePath("/documents");
}

/* ------------------------------------------------------------------ */
/* Reçu d'encaissement (dons, produits, jobs, intégrations, divers)    */
/* ------------------------------------------------------------------ */

/** Libellés lisibles des modes de paiement stockés en majuscules. */
const LIBELLE_MODE: Record<string, string> = {
  VIREMENT: "Virement",
  CHEQUE: "Chèque",
  ESPECES: "Espèces",
  CARTE: "Carte bancaire",
  AUTRE: "Autre",
};

/**
 * Émet le reçu d'un encaissement enregistré au journal des flux.
 *
 * Effet de bord voulu : le reçu **devient le justificatif** du flux. Sur le
 * drive, les deux vivaient séparément (un PPTX d'un côté, une référence
 * recopiée à la main de l'autre) et c'est précisément ce qui produisait des
 * flux « en attente de justificatif » bloquant la clôture mensuelle.
 */
/** Familles du catalogue proposées pour un encaissement du journal. */
const NATURES_CATALOGUE = [
  "RECU_COTISATION",
  "RECU_DON",
  "RECU_PRODUIT",
  "RECU_JOB",
  "RECU_INTEGRATION",
  "RECU_DIVERS",
] as const;

export async function genererRecuEncaissement(formData: FormData) {
  const { fluxId, nature } = z
    .object({
      fluxId: z.string().min(1),
      // « perso:<id> » désigne une famille déclarée par la JE ; elle emprunte
      // le gabarit du reçu divers mais garde sa propre numérotation.
      nature: z.union([
        z.enum(NATURES_CATALOGUE),
        z.string().regex(/^perso:[0-9a-f]{24}$/),
      ]),
    })
    .parse({ fluxId: formData.get("fluxId"), nature: formData.get("nature") });

  await connectDb();
  const personnalise = nature.startsWith("perso:")
    ? await TypeRecuModel.findOne({
        _id: nature.slice("perso:".length),
        actif: true,
      }).lean()
    : null;
  if (nature.startsWith("perso:") && !personnalise) {
    throw new Error("Type de reçu introuvable ou désactivé.");
  }

  const modele = modeleRequis(personnalise ? "RECU_DIVERS" : nature);
  const session = await exigerModuleEtPermission(modele.module, "ecrire");

  const mandat = await mandatActifRequis();

  const flux = await FluxTresorerieModel.findById(fluxId).lean();
  if (!flux) throw new Error("Flux introuvable.");
  if (flux.type !== "ENCAISSEMENT") {
    // Un reçu atteste d'une somme *reçue* : un décaissement n'en produit pas.
    throw new Error(
      "Un reçu ne peut être émis que pour un encaissement, pas pour un décaissement."
    );
  }

  const libelleFamille = personnalise?.libelle ?? modele.libelle;
  const { reference } = await emettreDocument({
    modele: modele.code,
    mandat,
    objetType: "FluxTresorerie",
    objetId: flux._id,
    titre: `${libelleFamille} — ${flux.tiers}`,
    session,
    variante: personnalise
      ? {
          code: personnalise.code,
          formatReference: `RC{seq:3}-${personnalise.code}-{mandat}`,
        }
      : undefined,
    donnees: {
      reference: "",
      nature: modele.code as "RECU_DIVERS",
      titrePersonnalise: personnalise
        ? `Reçu — ${personnalise.libelle}`
        : undefined,
      tiers: flux.tiers,
      montant: flux.montant,
      date: flux.date ?? new Date(),
      objet: flux.categorie,
      modePaiement: LIBELLE_MODE[flux.modePaiement ?? "ESPECES"] ?? "Espèces",
      notes: flux.notes ?? undefined,
      mandat: mandat.annee,
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (donnees, ref) =>
      construireRecuEncaissement({ ...donnees, reference: ref }),
  });

  // Le reçu vaut justificatif : on ne laisse pas le flux « en attente ».
  await FluxTresorerieModel.updateOne(
    { _id: flux._id },
    { justificatifRef: reference }
  );

  revalidatePath("/tresorerie/recus");
  revalidatePath("/tresorerie/flux");
  revalidatePath("/documents");
}

/* ------------------------------------------------------------------ */
/* Cycle de vie                                                        */
/* ------------------------------------------------------------------ */

const SchemaId = z.object({ id: z.string().min(1) });

/** Marque un document comme validé (circuit auteur → validateur). */
export async function validerDocument(formData: FormData) {
  const { id } = SchemaId.parse({ id: formData.get("id") });
  await connectDb();
  const document = await DocumentModel.findById(id).lean();
  if (!document) throw new Error("Document introuvable.");

  const modele = modeleRequis(document.modele);
  const session = await exigerPermission(modele.module, "valider");

  await DocumentModel.updateOne(
    { _id: new Types.ObjectId(id) },
    {
      statut: "SIGNE",
      validePar: session.user?.id,
      valideParNom: session.user?.name ?? session.user?.email,
      valideLe: new Date(),
    }
  );
  await journaliser(session, {
    action: "VALIDER_DOCUMENT",
    entite: "Document",
    entiteId: id,
    details: document.reference,
  });
  revalidatePath(`/documents/${id}`);
  revalidatePath("/documents");
}

/**
 * Annule un document. On ne supprime jamais : la référence reste consommée et
 * le document reste consultable, marqué « Annulé » — c'est ce qu'exige une
 * piste d'audit sur des pièces justificatives numérotées.
 */
export async function annulerDocument(formData: FormData) {
  const { id, motif } = z
    .object({ id: z.string().min(1), motif: z.string().min(3).max(300) })
    .parse({ id: formData.get("id"), motif: formData.get("motif") });

  await connectDb();
  const document = await DocumentModel.findById(id).lean();
  if (!document) throw new Error("Document introuvable.");

  const modele = modeleRequis(document.modele);
  const session = await exigerPermission(modele.module, "valider");

  await DocumentModel.updateOne(
    { _id: new Types.ObjectId(id) },
    { statut: "ANNULE", motifAnnulation: motif }
  );
  await journaliser(session, {
    action: "ANNULER_DOCUMENT",
    entite: "Document",
    entiteId: id,
    details: `${document.reference} — ${motif}`,
  });
  revalidatePath(`/documents/${id}`);
  revalidatePath("/documents");
  revalidatePath("/tresorerie/recus");
}

/**
 * Supprime définitivement un document annulé (purge de données de test).
 * Réservé à l'administration ; le journal en garde la trace.
 */
export async function purgerDocument(formData: FormData) {
  const { id } = SchemaId.parse({ id: formData.get("id") });
  const session = await exigerPermission("administration", "valider");

  await connectDb();
  const document = await DocumentModel.findById(id).lean();
  if (!document) throw new Error("Document introuvable.");
  if (document.statut !== "ANNULE") {
    throw new Error("Seul un document annulé peut être purgé.");
  }

  if (document.fichierId) await supprimerFichier(document.fichierId);
  await DocumentModel.deleteOne({ _id: new Types.ObjectId(id) });
  await journaliser(session, {
    action: "PURGER_DOCUMENT",
    entite: "Document",
    entiteId: id,
    details: document.reference,
  });
  revalidatePath("/documents");
}
