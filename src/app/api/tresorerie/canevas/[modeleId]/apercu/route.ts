import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { aPermission } from "@/lib/autorisation";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import { chargerImages } from "@/modules/documents/services/modele-depot";
import { rendreCanevas } from "@/modules/documents/services/rendu-canevas";
import { donneesExemple } from "@/modules/documents/services/modeles-livres";
import type { Canevas } from "@/modules/documents/services/canevas";

/**
 * Aperçu d'un modèle de canevas.
 *
 * **POST** rend le canevas qu'on lui donne — celui que l'éditeur a sous les
 * yeux, pas celui de la base. C'est ce qui permet au document de suivre les
 * déplacements à la souris sans enregistrer à chaque geste.
 *
 * **GET** rend le modèle enregistré : c'est le lien « ouvrir à part ».
 *
 * Les images viennent toujours de la base : elles se déposent, elles ne se
 * tapent pas. Les valeurs sont celles du jeu d'exemple, reconnaissables comme
 * fausses, et le filigrane empêche l'aperçu de passer pour une pièce émise.
 */

const SchemaCanevas = z.object({
  largeur: z.coerce.number().min(50).max(1000),
  hauteur: z.coerce.number().min(50).max(1000),
  blocs: z.array(z.unknown()).max(400),
  /** Famille dont on emprunte le jeu d'exemple. */
  famille: z.string().max(60).optional(),
});

async function rendre(
  modeleId: string,
  canevas: Canevas,
  famille: string
): Promise<NextResponse> {
  const enBase = await ModeleDocumentModel.findById(modeleId)
    .select("images nom")
    .lean();
  if (!enBase) {
    return NextResponse.json({ erreur: "Modèle introuvable." }, { status: 404 });
  }

  const pdf = await rendreCanevas(canevas, {
    titre: `Aperçu — ${enBase.nom}`,
    donnees: donneesExemple(famille),
    images: await chargerImages(canevas, enBase.images ?? []),
    filigrane: "Aperçu",
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="apercu-modele.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(
  requete: Request,
  { params }: { params: Promise<{ modeleId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { modeleId } = await params;
  const demande = SchemaCanevas.safeParse(
    await requete.json().catch(() => ({}))
  );
  if (!demande.success) {
    return NextResponse.json({ erreur: "Canevas illisible." }, { status: 400 });
  }

  await connectDb();
  const { largeur, hauteur, blocs, famille } = demande.data;
  return rendre(
    modeleId,
    { largeur, hauteur, blocs: blocs as Canevas["blocs"] },
    famille ?? ""
  );
}

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ modeleId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { modeleId } = await params;
  await connectDb();
  const modele = await ModeleDocumentModel.findById(modeleId).lean();
  if (!modele) {
    return NextResponse.json({ erreur: "Modèle introuvable." }, { status: 404 });
  }

  const famille =
    new URL(requete.url).searchParams.get("famille") ??
    modele.modeles?.[0] ??
    "";
  return rendre(
    modeleId,
    {
      largeur: modele.largeur,
      hauteur: modele.hauteur,
      blocs: modele.blocs as unknown as Canevas["blocs"],
    },
    famille
  );
}
