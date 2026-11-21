import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { modeleRequis } from "@/modules/documents/catalogue";
import { DocumentModel } from "@/modules/documents/models";
import { lireFichier } from "@/modules/documents/services/stockage";

/**
 * Téléchargement du PDF d'un document.
 *
 * Le fichier vit dans GridFS, donc il n'a pas d'URL publique : c'est ce
 * handler qui porte le contrôle d'accès. On exige la permission de *lecture*
 * du module porteur du modèle — un reçu de cotisation ne se télécharge pas
 * sans droit de lecture sur la trésorerie.
 */
export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ id: string }> }
) {
  const { id } = await contexte.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ erreur: "Identifiant invalide." }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });
  }

  await connectDb();
  const document = await DocumentModel.findById(id).lean();
  if (!document?.fichierId) {
    return NextResponse.json({ erreur: "Document introuvable." }, { status: 404 });
  }

  const modele = modeleRequis(document.modele);
  if (!can(session.user.roles, modele.module, "lire")) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const contenu = await lireFichier(document.fichierId);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` : le PDF s'ouvre dans l'onglet, on ne force pas le
      // téléchargement — c'est l'aperçu attendu depuis la fiche document.
      "Content-Disposition": `inline; filename="${document.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
