import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { aPermission } from "@/lib/autorisation";
import {
  ChequeOuDetteModel,
  DonModel,
  FournisseurModel,
} from "@/modules/tresorerie/models";
import { lireFichier } from "@/modules/documents/services/stockage";
import {
  REGISTRES_AVEC_PIECES,
  type RegistreAvecPieces,
} from "@/modules/tresorerie/services/pieces-justificatives";

/**
 * Sert une pièce justificative des registres dons, fournisseurs et
 * chèques/dettes.
 *
 * Adressée par le registre, la ligne et l'identifiant de la pièce — jamais
 * par l'identifiant GridFS : un lien ne doit donner accès qu'à ce que le
 * RBAC de la trésorerie autorise. Même principe que la route du registre
 * clients, dont celle-ci est la généralisation aux trois autres.
 */

type LigneAvecPieces = {
  justificatifs?: {
    _id?: unknown;
    fichierId: Parameters<typeof lireFichier>[0];
    nomFichier?: string | null;
  }[];
};

/**
 * Charge la ligne et ses pièces.
 *
 * Une branche par registre plutôt qu'un modèle choisi puis interrogé : les
 * trois modèles n'ont pas la même forme, et l'union de leurs `findById` n'est
 * pas appelable. Chaque branche interroge un modèle concret.
 */
async function ligneAvecPieces(
  registre: RegistreAvecPieces,
  ligneId: string
): Promise<LigneAvecPieces | null> {
  const champs = "justificatifs";
  if (registre === "dons") {
    return (await DonModel.findById(ligneId)
      .select(champs)
      .lean()) as LigneAvecPieces | null;
  }
  if (registre === "fournisseurs") {
    return (await FournisseurModel.findById(ligneId)
      .select(champs)
      .lean()) as LigneAvecPieces | null;
  }
  return (await ChequeOuDetteModel.findById(ligneId)
    .select(champs)
    .lean()) as LigneAvecPieces | null;
}

export async function GET(
  _requete: Request,
  {
    params,
  }: {
    params: Promise<{ registre: string; ligneId: string; pieceId: string }>;
  }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { registre, ligneId, pieceId } = await params;
  if (!REGISTRES_AVEC_PIECES.includes(registre as RegistreAvecPieces)) {
    return NextResponse.json({ erreur: "Registre inconnu." }, { status: 404 });
  }

  await connectDb();
  const ligne = await ligneAvecPieces(registre as RegistreAvecPieces, ligneId);

  const piece = ligne?.justificatifs?.find((j) => String(j._id) === pieceId);
  if (!piece) {
    return NextResponse.json({ erreur: "Pièce introuvable." }, { status: 404 });
  }

  const contenu = await lireFichier(piece.fichierId);
  const nom = piece.nomFichier || `piece-${pieceId}.pdf`;
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nom)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
