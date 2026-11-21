import type { Types } from "mongoose";
import type { Session } from "next-auth";
import { connectDb } from "@/lib/db";
import { journaliser } from "@/modules/core/services/journal";
import { modeleRequis } from "../catalogue";
import { DocumentModel, prochaineSequence } from "../models";
import { cleSequence, formaterReference } from "./numerotation";
import { rendrePdf } from "./rendu";
import { chartePourModele } from "./charte-depot";
import { identiteJE } from "./identite-je";
import { modelePourFamille } from "./modele-depot";
import { rendreCanevas } from "./rendu-canevas";
import { enregistrerFichier, supprimerFichier } from "./stockage";
import type { StructureDocument } from "./structure";

/**
 * Chaîne d'émission d'un document, commune aux ~110 modèles :
 *
 *   modèle → numéro réservé → référence → structure (gabarit pur) → PDF →
 *   stockage interne → enregistrement + journal
 *
 * Un gabarit n'a donc qu'une chose à faire : transformer des données métier en
 * `StructureDocument`. Tout le reste — unicité du numéro, instantané des
 * données, traçabilité — est garanti ici, une fois pour toutes.
 */

export type DemandeEmission<T> = {
  /** Code du modèle au catalogue. */
  modele: string;
  mandat: { _id: Types.ObjectId; annee: string };
  /** Objet métier d'origine, pour éviter les doublons et retrouver la source. */
  objetType?: string;
  objetId?: Types.ObjectId;
  /** Données métier ; elles sont figées dans le document (instantané). */
  donnees: T;
  /** Construit la structure à partir des données et de la référence attribuée. */
  gabarit: (donnees: T, reference: string) => StructureDocument;
  /** Titre lisible dans la bibliothèque ; par défaut le libellé du modèle. */
  titre?: string;
  /**
   * Décline un modèle du catalogue en famille numérotée à part.
   *
   * Le catalogue vit en code (ADR-011) et ce n'est pas près de changer : une
   * référence doit dire la même chose d'un mandat à l'autre. Mais une JE
   * encaisse des choses qu'aucun catalogue ne prévoit — un JeBex, une
   * tombola. La variante laisse créer ces familles sans toucher au code :
   * même gabarit, même modèle, mais un segment de référence et un compteur
   * qui lui sont propres, donc `RC001-TOMBOLA-2627` et non un numéro pris
   * dans la série des reçus divers.
   */
  variante?: { code: string; formatReference: string };
  session: Session | null;
};

export class DocumentDejaEmis extends Error {
  constructor(public reference: string) {
    super(
      `Un document de ce type existe déjà pour cet élément (${reference}). ` +
        `Annulez-le avant d'en émettre un nouveau.`
    );
  }
}

export async function emettreDocument<T>(
  demande: DemandeEmission<T>
): Promise<{ id: string; reference: string }> {
  const modele = modeleRequis(demande.modele);
  if (!modele.disponible) {
    throw new Error(
      `Le modèle « ${modele.libelle} » est catalogué mais pas encore disponible.`
    );
  }

  await connectDb();

  // Garde-fou métier : un objet ne porte qu'un document actif par modèle.
  if (demande.objetId) {
    const existant = await DocumentModel.findOne({
      modele: modele.code,
      objetType: demande.objetType,
      objetId: demande.objetId,
      statut: { $ne: "ANNULE" },
    })
      .select("reference")
      .lean();
    if (existant) throw new DocumentDejaEmis(existant.reference);
  }

  const sequence = await prochaineSequence(
    cleSequence(
      demande.variante ? `${modele.code}:${demande.variante.code}` : modele.code,
      demande.mandat.annee
    )
  );
  const reference = formaterReference(
    demande.variante?.formatReference ?? modele.formatReference,
    {
      sequence,
      mandat: demande.mandat.annee,
      code: demande.variante?.code ?? modele.code,
    }
  );

  /*
   * Deux moteurs, et c'est la famille qui décide.
   *
   * Si le Trésorier a composé une **mise en page** pour cette famille, le
   * document sort du canevas : chaque bloc à la place qu'il lui a donnée, les
   * jetons remplis avec les données de la pièce. Sinon, on garde le gabarit
   * en flux et sa charte — ce qui convient aux rapports et aux procès-verbaux,
   * dont la forme se déduit du contenu.
   *
   * La référence, elle, vient d'être réservée ci-dessus dans les deux cas :
   * aucune mise en page ne peut la changer, c'est la piste d'audit.
   */
  const miseEnPage = await modelePourFamille(modele.code);
  const pdf = miseEnPage
    ? await rendreCanevas(miseEnPage.canevas, {
        titre: demande.titre,
        /*
         * L'identité de la JE d'abord, les données de la pièce ensuite : les
         * jetons `{{adresseJE}}`, `{{matriculeFiscal}}` et leurs voisins
         * étaient posés par les modèles livrés et remplis nulle part, si bien
         * qu'un en-tête complet à l'aperçu sortait vide à l'émission. Une
         * pièce qui porterait son propre champ du même nom garde le sien.
         */
        donnees: {
          ...(await identiteJE()),
          ...(demande.donnees as Record<string, unknown>),
          reference,
        },
        images: miseEnPage.images,
      })
    : await rendrePdf(
        demande.gabarit(demande.donnees, reference),
        await chartePourModele(modele.code)
      );
  const { fichierId, tailleOctets } = await enregistrerFichier(
    `${reference}.pdf`,
    pdf,
    { modele: modele.code, reference }
  );

  try {
    const document = await DocumentModel.create({
      reference,
      modele: modele.code,
      categorie: modele.categorie,
      mandat: demande.mandat._id,
      titre: demande.titre ?? modele.libelle,
      objetType: demande.objetType,
      objetId: demande.objetId,
      donnees: demande.donnees,
      statut: "EMIS",
      emisPar: demande.session?.user?.id,
      emisParNom: demande.session?.user?.name ?? demande.session?.user?.email,
      emisLe: new Date(),
      fichierId,
      tailleOctets,
    });

    await journaliser(demande.session, {
      action: "EMETTRE_DOCUMENT",
      entite: "Document",
      entiteId: String(document._id),
      details: `${modele.libelle} ${reference}`,
    });

    return { id: String(document._id), reference };
  } catch (err) {
    // L'enregistrement a échoué après l'écriture du PDF : on ne laisse pas
    // un fichier orphelin dans GridFS.
    await supprimerFichier(fichierId);
    throw err;
  }
}
