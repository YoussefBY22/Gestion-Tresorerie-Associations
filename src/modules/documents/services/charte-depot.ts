import { connectDb } from "@/lib/db";
import { getParametre } from "@/modules/core/services/parametrage";
import { couleurValide } from "@/modules/core/apparence";
import { CharteDocumentModel } from "../models/CharteDocument";
import { lireFichier } from "./stockage";
import {
  charteApplicable,
  CHARTE_DEFAUT,
  completerCharte,
  type ChartePdf,
} from "./charte";

/**
 * Chargement de la charte applicable à un modèle, logo compris.
 *
 * Le choix de la charte est une fonction pure (`charteApplicable`) ; ce
 * fichier ne fait que lui apporter la base et le fichier du logo. Une charte
 * introuvable ou illisible ne doit jamais empêcher d'émettre une pièce : on
 * retombe alors sur la charte livrée, complétée du nom saisi au paramétrage.
 */
async function charteDeRepli(): Promise<ChartePdf> {
  try {
    const [nom, slogan, couleur] = await Promise.all([
      getParametre<string>("general.nomStructure"),
      getParametre<string>("general.sloganStructure"),
      getParametre<string>("apparence.couleurPrimaire"),
    ]);
    return {
      ...CHARTE_DEFAUT,
      nomEmetteur: nom?.trim() ? nom.trim().toUpperCase() : CHARTE_DEFAUT.nomEmetteur,
      slogan: slogan?.trim() ?? "",
      afficherSlogan: Boolean(slogan?.trim()),
      /*
       * Sans charte enregistrée, la pièce sort aux couleurs de l'écran.
       * C'est ce qu'on attend : une association qui a choisi sa couleur ne
       * devrait pas avoir à la ressaisir dans l'éditeur de charte pour que
       * ses reçus cessent de sortir dans la couleur par défaut.
       */
      couleurPrimaire: couleurValide(couleur) ?? CHARTE_DEFAUT.couleurPrimaire,
    };
  } catch {
    // Le paramétrage est injoignable : la charte livrée, telle quelle.
    // Surtout pas un appel récursif — il ne rendrait jamais la main.
    return CHARTE_DEFAUT;
  }
}

export async function chartePourModele(modele: string): Promise<ChartePdf> {
  try {
    await connectDb();
    const chartes = await CharteDocumentModel.find().lean();
    const retenue = charteApplicable(
      chartes.map((c) => ({
        ...c,
        modeles: c.modeles ?? [],
        parDefaut: Boolean(c.parDefaut),
      })),
      modele
    );
    if (!retenue) return charteDeRepli();

    let logo: ChartePdf["logo"];
    if (retenue.logoFichierId && retenue.logoType) {
      try {
        const octets = await lireFichier(retenue.logoFichierId);
        logo = { octets, type: retenue.logoType };
      } catch {
        // Logo perdu : la pièce sort sans lui plutôt que pas du tout.
        logo = undefined;
      }
    }

    return completerCharte({
      nomEmetteur: retenue.nomEmetteur,
      slogan: retenue.slogan ?? undefined,
      mentions: retenue.mentions ?? [],
      titre: retenue.titre ?? undefined,
      couleurPrimaire: retenue.couleurPrimaire,
      couleurTexte: retenue.couleurTexte,
      couleurSecondaire: retenue.couleurSecondaire,
      couleurSurPrimaire: retenue.couleurSurPrimaire ?? "",
      hauteurBandeau: retenue.hauteurBandeau,
      afficherSlogan: retenue.afficherSlogan,
      bandeauPied: retenue.bandeauPied,
      afficherMentionErp: retenue.afficherMentionErp,
      logo,
    });
  } catch {
    return CHARTE_DEFAUT;
  }
}
