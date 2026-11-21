"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { mettreALaCorbeille } from "@/modules/core/services/corbeille-depot";
import { MandatModel } from "@/modules/core/models";
import {
  FactureModel,
  FicheClientModel,
  FluxTresorerieModel,
  TypeRecuModel,
} from "@/modules/tresorerie/models";
import { DocumentModel } from "@/modules/documents/models";
import { modeleRequis } from "@/modules/documents/catalogue";
import { SequenceModel } from "@/modules/documents/models";
import {
  prefixeCompteur,
  segmentReference,
} from "@/modules/tresorerie/services/familles-recus";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireFactureClient } from "@/modules/documents/services/gabarits/facture-client";
import {
  TAUX_TVA_DEFAUT,
  TIMBRE_FISCAL_DT,
  ttcDe,
  tvaDe,
} from "@/modules/tresorerie/services/fiscal";

/**
 * Mention portée au bas des factures.
 *
 * Elle figurait dans le jeu d'exemple — donc à l'aperçu — et n'était jamais
 * remise au moteur : `{{mentionFiscale}}` sortait vide sur la pièce réelle.
 */
const MENTION_FISCALE_JE =
  "L'association, en tant que telle, est exonérée de la retenue à la source.";

/**
 * Familles de reçus — celles du catalogue comme celles de la JE — et retrait
 * d'une pièce émise.
 *
 * Les deux se présentent désormais dans la même liste, et toutes deux se
 * modifient et se suppriment. Ce qui vient du catalogue garde son segment de
 * référence — le renommer casserait la numérotation des reçus déjà émis —
 * mais son libellé est à la JE ; ce que la JE déclare se modifie entièrement
 * tant qu'aucun reçu n'a consommé de numéro. Voir
 * `services/familles-recus.ts` pour la composition de la liste.
 */

/** Codes réservés au catalogue : une famille libre ne doit pas les usurper. */
const CODES_RESERVES = ["COT", "DON", "PR", "JOBS", "INT", "DIV", "BUDG"];

/**
 * Résout la valeur du sélecteur (`RECU_COTISATION` ou `perso:<id>`) en la
 * ligne `TypeRecu` qui la porte, en la créant au besoin pour une famille du
 * catalogue : tant que personne ne l'a touchée, elle n'a pas de ligne à elle.
 */
async function ligneFamille(valeur: string) {
  if (valeur.startsWith("perso:")) {
    const type = await TypeRecuModel.findById(valeur.slice("perso:".length));
    if (!type) throw new Error("Famille de reçus introuvable.");
    return type;
  }

  const modele = modeleRequis(valeur);
  if (modele.categorie !== "RECU" || modele.module !== "tresorerie") {
    throw new Error(`« ${valeur} » n'est pas une famille de reçus.`);
  }
  const existante = await TypeRecuModel.findOne({ modele: modele.code });
  if (existante) return existante;

  return TypeRecuModel.create({
    modele: modele.code,
    libelle: modele.libelle,
    code: segmentReference(modele.formatReference, modele.code),
    actif: true,
  });
}

/**
 * Des numéros ont-ils déjà été attribués dans cette série ?
 *
 * La question se pose au compteur, pas à la liste des reçus : le compteur ne
 * redescend pas quand une pièce est supprimée, et c'est exactement ce qui
 * empêche de réémettre un numéro déjà sorti. Une série peut donc être
 * entamée alors qu'aucun reçu n'existe plus.
 */
async function serieEntamee(famille: {
  origine: "CATALOGUE" | "JE";
  code: string;
  valeur: string;
}): Promise<boolean> {
  const prefixe = prefixeCompteur(famille);
  // Les clés valent `RECU_DIVERS:TOMBOLA:2526` : on cherche le préfixe suivi
  // du seul mandat, pas une famille dont le code commencerait pareil.
  return Boolean(
    await SequenceModel.exists({
      cle: { $regex: `^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[^:]+$` },
    })
  );
}

/**
 * Renomme une famille, et corrige son code quand c'est encore permis.
 *
 * Le libellé est le mot que la JE emploie — « Adhésion » plutôt que
 * « Cotisation », « Participation JeBex » plutôt que « Divers » — et rien
 * n'empêche de le changer. Le code, lui, entre dans la référence : dès qu'un
 * reçu l'a porté, le modifier ferait deux séries qui prétendent être la même.
 */
export async function modifierFamilleRecu(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      valeur: z.string().min(1),
      libelle: z.string().min(2).max(60),
      code: z
        .string()
        .min(2)
        .max(10)
        .regex(
          /^[A-Za-z]+$/,
          "Le code ne prend que des lettres — il devient un morceau de la référence."
        )
        .optional(),
    })
    .parse({
      valeur: formData.get("valeur"),
      libelle: formData.get("libelle"),
      code: formData.get("code") || undefined,
    });

  await connectDb();
  const ligne = await ligneFamille(donnees.valeur);
  const origine = ligne.modele ? "CATALOGUE" : "JE";
  const avant = `${ligne.libelle} (${ligne.code})`;

  ligne.libelle = donnees.libelle;

  const codeVoulu = donnees.code?.toUpperCase();
  if (codeVoulu && codeVoulu !== ligne.code) {
    if (origine === "CATALOGUE") {
      throw new Error(
        `« ${ligne.libelle} » vient du catalogue : son segment de référence (${ligne.code}) est celui des reçus déjà émis et ne se renomme pas. Le libellé, lui, est à vous.`
      );
    }
    if (CODES_RESERVES.includes(codeVoulu)) {
      throw new Error(
        `Le code « ${codeVoulu} » est déjà celui d'une famille du catalogue : choisissez-en un autre.`
      );
    }
    if (
      await serieEntamee({ origine, code: ligne.code, valeur: donnees.valeur })
    ) {
      throw new Error(
        `Des numéros ont déjà été attribués sous « RC001-${ligne.code}-… » : le code ne peut plus changer, même si les reçus correspondants ont depuis été supprimés. Déclarez une nouvelle famille si la précédente ne convient plus.`
      );
    }
    if (
      await TypeRecuModel.exists({ code: codeVoulu, _id: { $ne: ligne._id } })
    ) {
      throw new Error(`Une autre famille utilise déjà le code « ${codeVoulu} ».`);
    }
    ligne.code = codeVoulu;
  }

  await ligne.save();

  await journaliser(session, {
    action: "tresorerie.typeRecu.modifier",
    entite: "TypeRecu",
    entiteId: String(ligne._id),
    details: `${avant} → ${ligne.libelle} (${ligne.code})`,
  });
  revalidatePath("/tresorerie/recus");
}

/**
 * Supprime une famille de reçus — vers la corbeille, comme tout le reste.
 *
 * Une famille de la JE voit sa ligne disparaître. Une famille du catalogue
 * vit en code et ne peut pas être effacée du disque : sa ligne est marquée
 * inactive, ce qui la sort de la liste et des choix exactement pareil. Dans
 * les deux cas, elle reste trente jours dans la corbeille et se restaure.
 *
 * Les reçus déjà émis ne bougent pas : ils portent leur propre référence et
 * leur propre libellé, figés à l'émission. Supprimer la famille ferme la
 * série, elle ne réécrit pas le passé.
 */
export async function supprimerFamilleRecu(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const valeur = z.string().min(1).parse(formData.get("valeur"));

  await connectDb();
  const ligne = await ligneFamille(valeur);
  const duCatalogue = Boolean(ligne.modele);

  const instantane = {
    libelle: ligne.libelle,
    code: ligne.code,
    modele: ligne.modele ?? undefined,
    creePar: ligne.creePar ?? undefined,
  };

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "FAMILLE_RECU",
    titre: ligne.libelle,
    description: `Série ${ligne.code} · famille ${duCatalogue ? "du catalogue" : "de la JE"}`,
    donnees: instantane,
    session,
  });

  if (duCatalogue) {
    ligne.actif = false;
    await ligne.save();
  } else {
    await TypeRecuModel.deleteOne({ _id: ligne._id });
  }

  await journaliser(session, {
    action: "tresorerie.typeRecu.supprimer",
    entite: "TypeRecu",
    entiteId: String(ligne._id),
    details: `${ligne.libelle} (${ligne.code}) — mise à la corbeille`,
  });
  revalidatePath("/tresorerie/recus");
  revalidatePath("/corbeille");
}

export async function creerTypeRecu(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      libelle: z.string().min(2).max(60),
      code: z
        .string()
        .min(2)
        .max(10)
        .regex(
          /^[A-Za-z]+$/,
          "Le code ne prend que des lettres — il devient un morceau de la référence."
        ),
    })
    .parse({
      libelle: formData.get("libelle"),
      code: formData.get("code"),
    });

  const code = donnees.code.toUpperCase();
  if (CODES_RESERVES.includes(code)) {
    throw new Error(
      `Le code « ${code} » est déjà celui d'une famille du catalogue : choisissez-en un autre.`
    );
  }

  await connectDb();
  if (await TypeRecuModel.exists({ code })) {
    throw new Error(`Une famille de reçus utilise déjà le code « ${code} ».`);
  }

  await TypeRecuModel.create({
    libelle: donnees.libelle,
    code,
    creePar: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
  });

  await journaliser(session, {
    action: "tresorerie.typeRecu.creer",
    entite: "TypeRecu",
    details: `${donnees.libelle} (${code})`,
  });
  revalidatePath("/tresorerie/recus");
}

/**
 * Émet le PDF d'une facture client.
 *
 * Jusqu'ici « émettre une facture » ne créait qu'une ligne en base : il n'y
 * avait rien à montrer au client, rien à joindre à un mail. Le PDF est une
 * photo de la facture au moment où on l'édite ; la rééditer après correction
 * demande d'abord de retirer la précédente, faute de quoi deux pièces
 * différentes porteraient le même numéro.
 */
export async function emettreFacturePdf(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const factureId = z.string().min(1).parse(formData.get("factureId"));

  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" }).lean();
  if (!mandat) throw new Error("Aucun mandat actif.");

  const facture = await FactureModel.findById(factureId)
    .populate<{
      projet: {
        _id: Types.ObjectId;
        nom: string;
        client?: { organisation?: string };
      };
    }>({
      path: "projet",
      select: "_id nom client",
      populate: { path: "client", select: "organisation" },
    })
    .lean();
  if (!facture) throw new Error("Facture introuvable.");

  // Adresse et matricule fiscal du client : ils vivent au registre clients,
  // seul endroit de l'application qui les porte, et une facture tunisienne les exige.
  const fiche = await FicheClientModel.findOne({ projet: facture.projet?._id })
    .select("adresse matriculeFiscal")
    .lean();

  /*
   * Les totaux, calculés une fois ici.
   *
   * Ils étaient absents des données remises au moteur : les jetons
   * `{{totalHT}}`, `{{totalTVA}}` et `{{totalTTC}}` existaient dans le jeu
   * d'exemple — donc à l'aperçu — et sortaient vides sur la pièce réelle.
   */
  const tauxTVA = facture.tauxTVA ?? TAUX_TVA_DEFAUT;
  const timbre = facture.timbreFiscal ?? TIMBRE_FISCAL_DT;
  const totalTVA = tvaDe(facture.montantHT, tauxTVA);
  const totalTTC = ttcDe(facture.montantHT, tauxTVA, timbre);
  const designation = facture.projet?.nom ?? "Prestation";

  /*
   * Les montants partent **mis en forme**, pas en nombres bruts.
   *
   * Le moteur de jetons rend un entier « 1 500 » et un décimal « 1500,500» :
   * sur une même facture, le total rond et la TVA ne s'écriraient pas de la
   * même façon. Une somme en dinars s'écrit toujours à trois décimales.
   */
  const dt = (montant: number) => montant.toFixed(3).replace(".", ",");
  const lignesChiffrees = [
    {
      designation,
      quantite: 1,
      prixUnitaire: dt(facture.montantHT),
      totalHT: dt(facture.montantHT),
      tauxTVA: `${tauxTVA} %`,
      totalTVA: dt(totalTVA),
      total: dt(facture.montantHT + totalTVA),
    },
  ];

  const { reference } = await emettreDocument({
    modele: "FACTURE_CLIENT",
    mandat: { _id: mandat._id, annee: mandat.annee },
    objetType: "Facture",
    objetId: facture._id,
    titre: `Facture ${facture.numero}`,
    session,
    donnees: {
      reference: "",
      numero: facture.numero,
      client:
        facture.projet?.client?.organisation ??
        facture.projet?.nom ??
        "Client",
      adresseClient: fiche?.adresse ?? "",
      matriculeClient: fiche?.matriculeFiscal ?? "",
      objet: facture.projet?.nom ?? "",
      lignes: lignesChiffrees,
      totalHT: dt(facture.montantHT),
      tauxTVA: `${tauxTVA} %`,
      totalTVA: dt(totalTVA),
      timbreFiscal: dt(timbre),
      totalTTC: dt(totalTTC),
      mentionFiscale: MENTION_FISCALE_JE,
      dateEmission: new Date(facture.emission),
      echeance: new Date(facture.echeance),
      payeeLe: facture.payeeLe ? new Date(facture.payeeLe) : null,
      mandat: mandat.annee,
      emetteur: session.user?.name ?? undefined,
    },
    /*
     * Le gabarit en flux attend des nombres et ses propres noms de champs ;
     * le canevas attend des jetons mis en forme. On ne duplique pas les
     * données pour autant : la correspondance se fait ici, une fois.
     */
    gabarit: (d, ref) =>
      construireFactureClient({
        ...d,
        reference: ref,
        clientAdresse: fiche?.adresse ?? undefined,
        clientMatriculeFiscal: fiche?.matriculeFiscal ?? undefined,
        lignes: [
          {
            designation,
            quantite: 1,
            prixUnitaireHT: facture.montantHT,
            montantHT: facture.montantHT,
          },
        ],
        tauxTVA,
        timbreFiscal: timbre,
      }),
  });

  await journaliser(session, {
    action: "tresorerie.facture.pdf",
    entite: "Facture",
    entiteId: factureId,
    details: `${facture.numero} → ${reference}`,
  });
  revalidatePath("/tresorerie/factures");
  revalidatePath("/documents");
}

/**
 * Met une pièce émise à la corbeille.
 *
 * L'ERP tenait jusqu'ici qu'un document numéroté ne se supprime pas, on
 * l'annule — c'est la règle sur une pièce remise à un tiers. La corbeille
 * réconcilie les deux : la pièce sort des écrans, reste restaurable trente
 * jours, et n'est vraiment détruite qu'ensuite. Reste que le numéro, lui,
 * est consommé : la série ne se rebouche pas.
 */
export async function supprimerDocumentTresorerie(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const documentId = z.string().min(1).parse(formData.get("documentId"));

  await connectDb();
  const document = await DocumentModel.findById(documentId).lean();
  if (!document) throw new Error("Document introuvable.");

  const modele = modeleRequis(document.modele);
  if (modele.module !== "tresorerie") {
    throw new Error(
      `« ${document.reference} » appartient au module ${modele.module} : supprimez-le depuis ce module.`
    );
  }

  await mettreALaCorbeille({
    module: "tresorerie",
    type: "DOCUMENT",
    titre: document.reference,
    description: document.titre,
    donnees: document,
    fichiers: [document.fichierId ?? undefined],
    session,
  });
  await DocumentModel.deleteOne({ _id: document._id });

  // Le reçu valait justificatif du flux : sans lui, le flux redevient « en
  // attente » plutôt que de pointer une référence qui n'existe plus.
  if (document.objetType === "FluxTresorerie" && document.objetId) {
    await FluxTresorerieModel.updateOne(
      { _id: document.objetId, justificatifRef: document.reference },
      { $unset: { justificatifRef: "" } }
    );
  }

  await journaliser(session, {
    action: "tresorerie.document.supprimer",
    entite: "Document",
    entiteId: documentId,
    details: `${document.reference} — mis à la corbeille`,
  });
  revalidatePath("/tresorerie/recus");
  revalidatePath("/tresorerie/budget");
  revalidatePath("/tresorerie/flux");
  revalidatePath("/corbeille");
  revalidatePath("/documents");
}
