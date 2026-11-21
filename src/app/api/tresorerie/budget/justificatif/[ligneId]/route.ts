import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { aPermission } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import { BudgetPrevisionnelModel } from "@/modules/tresorerie/models";
import { lireFichier } from "@/modules/documents/services/stockage";

/**
 * Sert le justificatif d'un poste budgétaire.
 *
 * Les justificatifs se déposaient sans qu'on puisse jamais les relire :
 * l'application savait qu'un PDF existait, mais personne ne pouvait le rouvrir. Le fichier
 * n'est pas exposé par son identifiant GridFS mais par celui du poste, pour
 * qu'un lien ne donne accès qu'à ce que le RBAC de la trésorerie autorise.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ ligneId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { ligneId } = await params;
  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" }).select("_id").lean();
  if (!mandat) {
    return NextResponse.json({ erreur: "Aucun mandat actif." }, { status: 404 });
  }

  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  const ligne = budget?.lignes.id(ligneId);
  if (!ligne?.justificatif?.fichierId) {
    return NextResponse.json({ erreur: "Justificatif introuvable." }, { status: 404 });
  }

  const contenu = await lireFichier(ligne.justificatif.fichierId);
  const nom = ligne.justificatif.nomFichier || `justificatif-${ligneId}.pdf`;
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` : le PDF s'ouvre dans la fenêtre de consultation plutôt que
      // de partir en téléchargement.
      "Content-Disposition": `inline; filename="${encodeURIComponent(nom)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
