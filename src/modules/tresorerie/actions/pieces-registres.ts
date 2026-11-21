"use server";

import { revalidatePath } from "next/cache";
import { Types, type Model } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import {
  ChequeOuDetteModel,
  DonModel,
  FournisseurModel,
} from "@/modules/tresorerie/models";
import {
  enregistrerFichier,
  supprimerFichier,
} from "@/modules/documents/services/stockage";
import {
  REGISTRES_AVEC_PIECES,
  nomDePiece,
  verifierPiece,
  type RegistreAvecPieces,
} from "@/modules/tresorerie/services/pieces-justificatives";

/**
 * Pièces justificatives des registres dons, fournisseurs et chèques/dettes.
 *
 * Seul le registre clients en acceptait. Ailleurs, la ligne existait sans sa
 * preuve — un don sans reçu, une dette sans reconnaissance signée. En audit
 * CTJE, c'est la pièce qu'on demande.
 *
 * Une seule action pour les trois registres : ils stockent la même chose et
 * doivent refuser de la même façon. Les règles d'acceptation vivent dans
 * `services/pieces-justificatives.ts`, les refus sont rendus.
 */

type ModeleAvecPieces = Model<{
  _id: Types.ObjectId;
  justificatifs?: {
    _id?: Types.ObjectId;
    fichierId: Types.ObjectId;
    nomFichier?: string | null;
  }[];
}>;

const MODELES: Record<
  RegistreAvecPieces,
  { modele: () => ModeleAvecPieces; entite: string; chemin: string }
> = {
  dons: {
    modele: () => DonModel as unknown as ModeleAvecPieces,
    entite: "Don",
    chemin: "/tresorerie/registres/dons",
  },
  fournisseurs: {
    modele: () => FournisseurModel as unknown as ModeleAvecPieces,
    entite: "Fournisseur",
    chemin: "/tresorerie/registres/fournisseurs",
  },
  "cheques-dettes": {
    modele: () => ChequeOuDetteModel as unknown as ModeleAvecPieces,
    entite: "ChequeOuDette",
    chemin: "/tresorerie/registres/cheques-dettes",
  },
};

export type ResultatPiece = { ok: boolean; message: string };

const SchemaRegistre = z.enum(REGISTRES_AVEC_PIECES);

export async function deposerPieceRegistre(
  formData: FormData
): Promise<ResultatPiece> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");

  const champs = z
    .object({
      registre: SchemaRegistre,
      ligneId: z.string().min(1),
      libelle: z.string().max(160).optional(),
    })
    .safeParse({
      registre: formData.get("registre"),
      ligneId: formData.get("ligneId"),
      libelle: formData.get("libelle") || undefined,
    });
  if (!champs.success) {
    return { ok: false, message: "Registre ou ligne inconnus." };
  }

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File)) {
    return { ok: false, message: "Choisissez un fichier à déposer." };
  }
  const controle = verifierPiece({
    nom: fichier.name,
    type: fichier.type,
    taille: fichier.size,
  });
  if (!controle.possible) {
    return { ok: false, message: controle.raison ?? "Pièce refusée." };
  }

  const { modele, entite, chemin } = MODELES[champs.data.registre];

  await connectDb();
  const ligne = await modele().findById(champs.data.ligneId).select("_id");
  if (!ligne) {
    return {
      ok: false,
      message: "Cette ligne du registre n'existe plus : rechargez la page.",
    };
  }

  const nom = nomDePiece(champs.data.registre, fichier.name);
  const contenu = new Uint8Array(await fichier.arrayBuffer());
  const { fichierId, tailleOctets } = await enregistrerFichier(nom, contenu, {
    contentType: "application/pdf",
    registre: champs.data.registre,
    ligne: champs.data.ligneId,
  });

  await modele().updateOne(
    { _id: ligne._id },
    {
      $push: {
        justificatifs: {
          fichierId,
          nomFichier: nom,
          libelle: champs.data.libelle,
          tailleOctets,
          deposeLe: new Date(),
        },
      },
    }
  );

  await journaliser(session, {
    action: `tresorerie.registre.${champs.data.registre}.piece`,
    entite,
    entiteId: champs.data.ligneId,
    details: nom,
  });
  revalidatePath(chemin);

  return { ok: true, message: `« ${nom} » déposé.` };
}

export async function supprimerPieceRegistre(
  formData: FormData
): Promise<ResultatPiece> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");

  const champs = z
    .object({
      registre: SchemaRegistre,
      ligneId: z.string().min(1),
      pieceId: z.string().min(1),
    })
    .safeParse({
      registre: formData.get("registre"),
      ligneId: formData.get("ligneId"),
      pieceId: formData.get("pieceId"),
    });
  if (!champs.success) {
    return { ok: false, message: "Registre, ligne ou pièce inconnus." };
  }

  const { modele, entite, chemin } = MODELES[champs.data.registre];

  await connectDb();
  const ligne = await modele()
    .findById(champs.data.ligneId)
    .select("justificatifs")
    .lean();
  const piece = ligne?.justificatifs?.find(
    (j) => String(j._id) === champs.data.pieceId
  );
  if (!piece) {
    return { ok: false, message: "Cette pièce n'existe plus." };
  }

  await modele().updateOne(
    { _id: new Types.ObjectId(champs.data.ligneId) },
    {
      $pull: {
        justificatifs: { _id: new Types.ObjectId(champs.data.pieceId) },
      },
    }
  );
  // Le fichier part avec sa référence : un PDF orphelin dans GridFS ne se
  // retrouve plus et occupe la base pour rien.
  await supprimerFichier(piece.fichierId);

  await journaliser(session, {
    action: `tresorerie.registre.${champs.data.registre}.piece.supprimer`,
    entite,
    entiteId: champs.data.ligneId,
    details: piece.nomFichier ?? champs.data.pieceId,
  });
  revalidatePath(chemin);

  return {
    ok: true,
    message: `« ${piece.nomFichier ?? "Pièce"} » retirée du registre.`,
  };
}
