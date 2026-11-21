import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { aPermission } from "@/lib/autorisation";
import { CharteDocumentModel } from "@/modules/documents/models/CharteDocument";
import { structureDApercu } from "@/modules/documents/services/apercu-charte";
import { rendrePdf } from "@/modules/documents/services/rendu";
import {
  completerCharte,
  type ChartePdf,
} from "@/modules/documents/services/charte";
import { lireFichier } from "@/modules/documents/services/stockage";

/**
 * Aperçu d'un modèle de document.
 *
 * Le PDF est fabriqué à la demande, par les vrais gabarits et le vrai moteur
 * de rendu : ce que le Trésorier valide ici est exactement ce que ses pièces
 * auront. Rien n'est stocké, rien n'est numéroté — l'aperçu porte une
 * référence factice et un filigrane, pour qu'il ne puisse jamais passer pour
 * une pièce émise.
 *
 * Deux entrées, pour deux usages :
 * - **GET** rend la charte telle qu'elle est enregistrée. C'est le lien
 *   « ouvrir à part », et le premier affichage.
 * - **POST** rend une charte qu'on lui donne, sans rien lire ni écrire en
 *   base. C'est ce qui permet à l'aperçu de suivre la frappe : il n'attend
 *   plus l'enregistrement, qui part de son côté et à son rythme.
 *
 * Le logo, lui, vient toujours de la charte enregistrée : il ne se règle pas
 * au clavier, il se dépose.
 */

const SchemaApercu = z.object({
  modele: z.string().max(60).optional(),
  nomEmetteur: z.string().max(120).optional(),
  slogan: z.string().max(120).optional(),
  titre: z.string().max(120).optional(),
  mentions: z.array(z.string().max(200)).max(10).optional(),
  couleurPrimaire: z.string().max(9).optional(),
  couleurTexte: z.string().max(9).optional(),
  couleurSecondaire: z.string().max(9).optional(),
  couleurSurPrimaire: z.string().max(9).optional(),
  hauteurBandeau: z.coerce.number().optional(),
  afficherSlogan: z.boolean().optional(),
  bandeauPied: z.boolean().optional(),
  afficherMentionErp: z.boolean().optional(),
});

/** Logo enregistré de la charte. Introuvable ou illisible, on s'en passe. */
async function logoDe(charteId: string): Promise<ChartePdf["logo"]> {
  const charte = await CharteDocumentModel.findById(charteId)
    .select("logoFichierId logoType")
    .lean();
  if (!charte?.logoFichierId || !charte.logoType) return undefined;
  try {
    return { octets: await lireFichier(charte.logoFichierId), type: charte.logoType };
  } catch {
    return undefined;
  }
}

function reponsePdf(pdf: Uint8Array, modele: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="apercu-${modele}.pdf"`,
      // Un aperçu doit refléter la dernière modification, jamais un cache.
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  requete: Request,
  { params }: { params: Promise<{ charteId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { charteId } = await params;
  const modele =
    new URL(requete.url).searchParams.get("modele") ?? "RECU_COTISATION";

  await connectDb();
  const charte = await CharteDocumentModel.findById(charteId).lean();
  if (!charte) {
    return NextResponse.json({ erreur: "Modèle introuvable." }, { status: 404 });
  }

  const pdf = await rendrePdf(
    structureDApercu(modele),
    completerCharte({
      nomEmetteur: charte.nomEmetteur,
      slogan: charte.slogan ?? undefined,
      mentions: charte.mentions ?? [],
      titre: charte.titre ?? undefined,
      couleurPrimaire: charte.couleurPrimaire,
      couleurTexte: charte.couleurTexte,
      couleurSecondaire: charte.couleurSecondaire,
      couleurSurPrimaire: charte.couleurSurPrimaire ?? "",
      hauteurBandeau: charte.hauteurBandeau,
      afficherSlogan: charte.afficherSlogan,
      bandeauPied: charte.bandeauPied,
      afficherMentionErp: charte.afficherMentionErp,
      logo: await logoDe(charteId),
    })
  );

  return reponsePdf(pdf, modele);
}

export async function POST(
  requete: Request,
  { params }: { params: Promise<{ charteId: string }> }
) {
  if (!(await aPermission("tresorerie", "lire"))) {
    return NextResponse.json({ erreur: "Accès refusé." }, { status: 403 });
  }

  const { charteId } = await params;
  const demande = SchemaApercu.safeParse(await requete.json().catch(() => ({})));
  if (!demande.success) {
    return NextResponse.json({ erreur: "Charte illisible." }, { status: 400 });
  }
  const { modele = "RECU_COTISATION", ...charte } = demande.data;

  await connectDb();
  // `completerCharte` comble et borne : une couleur à moitié tapée ou une
  // hauteur hors bornes rend un aperçu présentable plutôt qu'une erreur.
  const pdf = await rendrePdf(
    structureDApercu(modele),
    completerCharte({ ...charte, logo: await logoDe(charteId) })
  );

  return reponsePdf(pdf, modele);
}
