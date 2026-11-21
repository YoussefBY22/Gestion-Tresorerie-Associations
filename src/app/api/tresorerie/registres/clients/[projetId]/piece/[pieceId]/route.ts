import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { aPermission } from "@/lib/autorisation";
import { FicheClientModel } from "@/modules/tresorerie/models";
import { lireFichier } from "@/modules/documents/services/stockage";

/**
 * Sert une pièce de paiement du registre des clients.
 *
 * Adressée par le projet et l'identifiant de la pièce, jamais par
 * l'identifiant GridFS : un lien ne doit donner accès qu'à ce que le RBAC de
 * la trésorerie autorise.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ projetId: string; pieceId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { projetId, pieceId } = await params;
  await connectDb();
  const fiche = await FicheClientModel.findOne({ projet: projetId }).lean();
  const piece = fiche?.justificatifs?.find((j) => String(j._id) === pieceId);
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
