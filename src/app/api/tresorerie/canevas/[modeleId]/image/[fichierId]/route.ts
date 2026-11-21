import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { aPermission } from "@/lib/autorisation";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import { lireFichier } from "@/modules/documents/services/stockage";

/**
 * Sert une image déposée sur un modèle, pour que l'éditeur la montre.
 *
 * L'éditeur affichait un cadre pointillé portant le nom du fichier : on
 * posait un cachet sans jamais voir à quoi il ressemblait, ce qui rendait le
 * placement à la souris inutile. Le fichier est exposé par l'identifiant du
 * **modèle** et non par le seul identifiant GridFS, pour qu'un lien ne donne
 * accès qu'à ce que le RBAC de la trésorerie autorise.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ modeleId: string; fichierId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { modeleId, fichierId } = await params;
  await connectDb();
  const modele = await ModeleDocumentModel.findById(modeleId)
    .select("images")
    .lean();
  const image = modele?.images?.find((i) => String(i.fichierId) === fichierId);
  if (!image) {
    return NextResponse.json({ erreur: "Image introuvable." }, { status: 404 });
  }

  try {
    const contenu = await lireFichier(image.fichierId);
    return new NextResponse(new Uint8Array(contenu), {
      headers: {
        "Content-Type": image.type === "png" ? "image/png" : "image/jpeg",
        // Le contenu d'un identifiant GridFS ne change jamais : on peut le
        // garder longtemps en cache sans risquer d'afficher du périmé.
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ erreur: "Fichier illisible." }, { status: 404 });
  }
}
