"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { MandatModel } from "@/modules/core/models";
import { FicheClientModel } from "@/modules/tresorerie/models";
import { ProjetModel } from "@/modules/base/models";
import { enregistrerFichier } from "@/modules/documents/services/stockage";

/**
 * Registre des clients — la part que le Trésorier tient lui-même.
 *
 * Le nom du projet, le client et le chiffre d'affaires signé ne se modifient
 * pas ici : ils appartiennent au CRM et aux Projets, et deux copies
 * finiraient par se contredire. Tout le reste se saisit et se corrige sur
 * place.
 */

const TAILLE_MAX = 10 * 1024 * 1024;

function rafraichir() {
  revalidatePath("/tresorerie/registres/clients");
  revalidatePath("/tresorerie/registres");
}

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" });
  if (!mandat) throw new Error("Aucun mandat actif.");
  return mandat;
}

export async function majFicheClient(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      projetId: z.string().min(1),
      contact: z.string().max(160).optional(),
      email: z.string().max(160).optional(),
      telephone: z.string().max(40).optional(),
      adresse: z.string().max(300).optional(),
      matriculeFiscal: z.string().max(50).optional(),
      tranche1: z.coerce.number().min(0).optional(),
      tranche2: z.coerce.number().min(0).optional(),
      notes: z.string().max(1000).optional(),
    })
    .parse({
      projetId: formData.get("projetId"),
      contact: formData.get("contact") || undefined,
      email: formData.get("email") || undefined,
      telephone: formData.get("telephone") || undefined,
      adresse: formData.get("adresse") || undefined,
      matriculeFiscal: formData.get("matriculeFiscal") || undefined,
      tranche1: formData.get("tranche1") || undefined,
      tranche2: formData.get("tranche2") || undefined,
      notes: formData.get("notes") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const projet = await ProjetModel.findOne({
    _id: donnees.projetId,
    mandat: mandat._id,
  })
    .select("nom")
    .lean();
  if (!projet) throw new Error("Projet introuvable sur ce mandat.");

  const { projetId, ...champs } = donnees;
  await FicheClientModel.findOneAndUpdate(
    { projet: projetId },
    { $set: champs, $setOnInsert: { mandat: mandat._id, projet: projetId } },
    { upsert: true }
  );

  await journaliser(session, {
    action: "tresorerie.registre.client.maj",
    entite: "FicheClient",
    entiteId: projetId,
    details: projet.nom,
  });
  rafraichir();
}

/**
 * Vide la fiche d'un projet sans toucher au projet lui-même.
 *
 * « Supprimer la ligne » ne peut pas vouloir dire supprimer le projet : le
 * registre des clients n'est pas l'endroit d'où l'on décide qu'un projet
 * n'existe plus. Ce qui part à la corbeille, c'est la fiche — les colonnes du
 * Trésorier et ses pièces.
 */
export async function supprimerFicheClient(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const projetId = z.string().min(1).parse(formData.get("projetId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const fiche = await FicheClientModel.findOne({
    projet: projetId,
    mandat: mandat._id,
  }).lean();
  if (!fiche) throw new Error("Aucune fiche à supprimer pour ce projet.");

  const projet = await ProjetModel.findById(projetId).select("nom").lean();

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "FICHE_CLIENT",
    titre: `Fiche client — ${projet?.nom ?? "projet"}`,
    description: [fiche.contact, fiche.email].filter(Boolean).join(" · "),
    donnees: fiche,
    fichiers: (fiche.justificatifs ?? []).map((j) => j.fichierId),
    session,
  });
  await FicheClientModel.deleteOne({ _id: fiche._id });

  await journaliser(session, {
    action: "tresorerie.registre.client.supprimer",
    entite: "FicheClient",
    entiteId: projetId,
    details: `${projet?.nom ?? projetId} — mise à la corbeille`,
  });
  rafraichir();
  revalidatePath("/corbeille");
}

export async function deposerPieceClient(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const projetId = z.string().min(1).parse(formData.get("projetId"));
  const libelle = z.string().max(160).optional().parse(
    formData.get("libelle") || undefined
  );

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Le fichier est requis.");
  }
  if (fichier.type !== "application/pdf") {
    throw new Error("La pièce doit être un fichier PDF.");
  }
  if (fichier.size > TAILLE_MAX) {
    throw new Error(
      `Fichier trop volumineux (${Math.round(fichier.size / 1024)} Ko pour ${TAILLE_MAX / 1024 / 1024} Mo maximum).`
    );
  }

  await connectDb();
  const mandat = await mandatActifRequis();
  const contenu = new Uint8Array(await fichier.arrayBuffer());
  const { fichierId, tailleOctets } = await enregistrerFichier(
    fichier.name || "piece-paiement.pdf",
    contenu,
    { contentType: "application/pdf", projet: projetId }
  );

  await FicheClientModel.findOneAndUpdate(
    { projet: projetId },
    {
      $setOnInsert: { mandat: mandat._id, projet: projetId },
      $push: {
        justificatifs: {
          fichierId,
          nomFichier: fichier.name,
          libelle,
          tailleOctets,
          deposeLe: new Date(),
        },
      },
    },
    { upsert: true }
  );

  await journaliser(session, {
    action: "tresorerie.registre.client.piece",
    entite: "FicheClient",
    entiteId: projetId,
    details: fichier.name,
  });
  rafraichir();
}

export async function supprimerPieceClient(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({ projetId: z.string().min(1), pieceId: z.string().min(1) })
    .parse({
      projetId: formData.get("projetId"),
      pieceId: formData.get("pieceId"),
    });

  await connectDb();
  const fiche = await FicheClientModel.findOne({ projet: donnees.projetId });
  const piece = fiche?.justificatifs?.find(
    (j) => String(j._id) === donnees.pieceId
  );
  if (!fiche || !piece) throw new Error("Pièce introuvable.");

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "PIECE_CLIENT",
    titre: piece.nomFichier || "Pièce de paiement",
    description: piece.libelle ?? undefined,
    donnees: { projetId: donnees.projetId, piece },
    fichiers: [piece.fichierId],
    session,
  });

  fiche.justificatifs = fiche.justificatifs.filter(
    (j) => String(j._id) !== donnees.pieceId
  ) as typeof fiche.justificatifs;
  await fiche.save();

  await journaliser(session, {
    action: "tresorerie.registre.client.piece.supprimer",
    entite: "FicheClient",
    entiteId: donnees.projetId,
    details: piece.nomFichier ?? donnees.pieceId,
  });
  rafraichir();
  revalidatePath("/corbeille");
}

