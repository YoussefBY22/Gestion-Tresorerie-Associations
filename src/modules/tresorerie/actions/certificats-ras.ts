"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel } from "@/modules/core/models";
import {
  FactureFournisseurModel,
  FournisseurModel,
} from "@/modules/tresorerie/models";
import { DocumentModel } from "@/modules/documents/models";
import {
  DocumentDejaEmis,
  emettreDocument,
} from "@/modules/documents/services/emission";
import { chartePourModele } from "@/modules/documents/services/charte-depot";
import { construireCertificatRAS } from "@/modules/documents/services/gabarits/certificat-ras";
import {
  detailRetenue,
  verifierCertificat,
} from "@/modules/tresorerie/services/certificat-ras";

/**
 * Certificat de retenue à la source.
 *
 * L'association retient une part de la facture d'un prestataire et la verse au
 * Trésor **au nom de celui-ci**. Sans certificat, le prestataire ne peut pas
 * l'imputer sur son propre impôt : il la paie deux fois. La pièce lui est
 * due, et l'application ne savait pas l'émettre — la famille était cataloguée en
 * `disponible: false` depuis le début.
 *
 * Le calcul, lui, existait déjà : la déclaration mensuelle retient ces
 * montants depuis le premier jour. Le certificat ne recalcule rien, il
 * **atteste** ce qui a été retenu.
 *
 * Les refus sont rendus, pas levés : leur texte dit quoi corriger sur la
 * facture reçue.
 */

const CHEMINS = ["/tresorerie/declaration", "/tresorerie", "/documents"];

function revalider() {
  for (const chemin of CHEMINS) revalidatePath(chemin);
}

/**
 * Matricule fiscal de la JE, cherché dans les mentions de pied de la charte.
 *
 * Il n'a pas de champ à lui : la charte porte des lignes de pied en texte
 * libre, et c'est là que la JE écrit son matricule. On le reconnaît à sa
 * forme (sept chiffres, une lettre, trois lettres séparées par des barres).
 * Introuvable, le gabarit omet la rubrique plutôt que d'imprimer un vide.
 */
function matriculeDepuisMentions(mentions: string[]): string | undefined {
  const forme = /\d{6,8}\s*[A-Za-z]\s*(?:\/\s*[A-Za-z]){2,3}\s*\/\s*\d{3}/;
  for (const ligne of mentions) {
    const trouve = ligne.match(forme);
    if (trouve) return trouve[0].replace(/\s+/g, "");
  }
  return undefined;
}

export type ResultatCertificat = { ok: boolean; message: string };

export async function emettreCertificatRAS(
  formData: FormData
): Promise<ResultatCertificat> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      factureId: z.string().min(1),
      dateReglement: z.coerce.date().optional(),
    })
    .parse({
      factureId: formData.get("factureId"),
      dateReglement: formData.get("dateReglement") || undefined,
    });

  await connectDb();

  const facture = await FactureFournisseurModel.findById(donnees.factureId).lean();
  if (!facture) {
    return { ok: false, message: "Facture fournisseur introuvable." };
  }

  const controle = verifierCertificat({
    montantTTC: facture.montantTTC,
    typePrestataire: facture.typePrestataire,
  });
  if (!controle.possible) {
    return { ok: false, message: controle.raison ?? "Certificat impossible." };
  }

  const mandat = await MandatModel.findOne({ statut: "ACTIF" })
    .select("_id annee")
    .lean();
  if (!mandat) return { ok: false, message: "Aucun mandat actif." };

  // Le matricule du prestataire vit au registre fournisseurs, pas sur la
  // facture : on l'y cherche par le nom, seul lien existant entre les deux.
  const fournisseur = await FournisseurModel.findOne({
    nom: facture.fournisseur,
  })
    .select("matriculeFiscal adresse")
    .lean();

  const charte = await chartePourModele("CERTIFICAT_RAS");
  const detail = detailRetenue({
    montantTTC: facture.montantTTC,
    typePrestataire: facture.typePrestataire,
  });

  const emission = new Date();
  let reference: string;
  try {
    const emis = await emettreDocument({
      modele: "CERTIFICAT_RAS",
      mandat,
      objetType: "FactureFournisseur",
      objetId: facture._id,
      titre: `Retenue à la source — ${facture.fournisseur}`,
      session,
      donnees: {
        reference: "",
        retenteur: charte.nomEmetteur,
        retenteurMatriculeFiscal: matriculeDepuisMentions(charte.mentions ?? []),
        beneficiaire: facture.fournisseur,
        beneficiaireMatriculeFiscal:
          (fournisseur as { matriculeFiscal?: string } | null)
            ?.matriculeFiscal || undefined,
        beneficiaireAdresse:
          (fournisseur as { adresse?: string } | null)?.adresse || undefined,
        factureReference: facture.reference,
        factureDate: new Date(facture.date),
        natureOperation: facture.description || undefined,
        montantTTC: facture.montantTTC,
        typePrestataire: facture.typePrestataire as string,
        // À défaut de date saisie, celle de la facture : mieux vaut une date
        // exacte de l'opération que celle du jour où l'on pense à la pièce.
        dateReglement: donnees.dateReglement ?? new Date(facture.date),
        modeReglement: facture.modeReglement || undefined,
        dateEmission: emission,
        mandat: mandat.annee,
        emetteur: session.user?.name ?? undefined,
      },
      gabarit: (d, ref) => construireCertificatRAS({ ...d, reference: ref }),
    });
    reference = emis.reference;
  } catch (err) {
    // Un certificat par facture : le second ferait croire à deux retenues.
    if (err instanceof DocumentDejaEmis) {
      return {
        ok: false,
        message: `Un certificat existe déjà pour cette facture (${err.reference}). Annulez-le depuis la bibliothèque avant d'en établir un autre.`,
      };
    }
    throw err;
  }

  await journaliser(session, {
    action: "tresorerie.certificatRAS.emettre",
    entite: "FactureFournisseur",
    entiteId: String(facture._id),
    details: `${reference} — ${facture.fournisseur}, retenue ${detail.retenue} DT sur ${facture.reference}`,
  });
  revalider();

  return {
    ok: true,
    message: `${reference} établi : ${detail.retenue
      .toFixed(3)
      .replace(".", ",")} DT retenus pour ${facture.fournisseur}. Remettez-lui la pièce, elle lui sert à imputer cette somme sur son impôt.`,
  };
}

/** Certificats déjà établis pour un lot de factures reçues. */
export async function certificatsDesFactures(
  factureIds: string[]
): Promise<Record<string, { id: string; reference: string }>> {
  // Exportée depuis un fichier « use server » : joignable par le réseau, donc
  // gardée comme n'importe quelle autre lecture de la trésorerie.
  await exigerModuleEtPermission("tresorerie", "lire");
  if (factureIds.length === 0) return {};
  await connectDb();
  const documents = await DocumentModel.find({
    modele: "CERTIFICAT_RAS",
    objetType: "FactureFournisseur",
    objetId: { $in: factureIds },
    statut: { $ne: "ANNULE" },
  })
    .select("_id reference objetId")
    .lean();

  return Object.fromEntries(
    documents.map((d) => [
      String(d.objetId),
      { id: String(d._id), reference: d.reference },
    ])
  );
}
