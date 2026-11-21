"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel } from "@/modules/core/models";
import {
  AvoirModel,
  BudgetPrevisionnelModel,
  DeclarationMensuelleModel,
  FactureFournisseurModel,
  FactureModel,
  FluxTresorerieModel,
  MouvementInterneModel,
  MODES_REGLEMENT,
} from "@/modules/tresorerie/models";
import {
  SENS_MOUVEMENT,
  comptePourMode,
  soldesParCompte,
} from "@/modules/tresorerie/services/caisse";
import {
  SENS_SECTION_BUDGET,
  moisDuMandat,
  normaliserValeurs,
} from "@/modules/tresorerie/services/budget-previsionnel";
import {
  TAUX_TVA_DEFAUT,
  TIMBRE_FISCAL_DT,
  TYPES_PRESTATAIRE,
  calculerDeclaration,
  libelleMois,
  moisPrecedent,
  ttcDe,
  type Declaration,
} from "@/modules/tresorerie/services/fiscal";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireDeclarationMensuelle } from "@/modules/documents/services/gabarits/declaration-mensuelle";
import { construireRapportFinancierMensuel } from "@/modules/documents/services/gabarits/rapport-financier-mensuel";
import {
  fluxSansJustificatif,
  realiseParLigne,
} from "@/modules/tresorerie/services/finances";
import { LIBELLES_NATURE_TVA } from "@/modules/tresorerie/services/fiscal";

const MOIS = /^\d{4}-\d{2}$/;

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" }).lean();
  if (!mandat) throw new Error("Aucun mandat actif.");
  return { _id: mandat._id, annee: mandat.annee, debut: mandat.debut, fin: mandat.fin };
}

/* ------------------------------------------------------------------ */
/* Factures fournisseurs                                               */
/* ------------------------------------------------------------------ */

export async function enregistrerFactureFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      mois: z.string().regex(MOIS),
      date: z.coerce.date(),
      reference: z.string().min(1).max(60),
      fournisseur: z.string().min(2).max(150),
      description: z.string().max(300).optional(),
      montantHT: z.coerce.number().min(0),
      tauxTVA: z.coerce.number().min(0).max(100),
      timbreFiscal: z.coerce.number().min(0),
      autresTaxes: z.coerce.number().min(0),
      tvaDeductible: z.boolean(),
      typePrestataire: z.string().optional(),
      modeReglement: z.enum(MODES_REGLEMENT),
      justificatifRef: z.string().max(200).optional(),
    })
    .parse({
      mois: formData.get("mois"),
      date: formData.get("date"),
      reference: formData.get("reference"),
      fournisseur: formData.get("fournisseur"),
      description: formData.get("description") || undefined,
      montantHT: formData.get("montantHT"),
      tauxTVA: formData.get("tauxTVA") || TAUX_TVA_DEFAUT,
      timbreFiscal: formData.get("timbreFiscal") || TIMBRE_FISCAL_DT,
      autresTaxes: formData.get("autresTaxes") || 0,
      tvaDeductible: formData.get("tvaDeductible") !== "non",
      typePrestataire: formData.get("typePrestataire") || undefined,
      modeReglement: formData.get("modeReglement") || "VIREMENT",
      justificatifRef: formData.get("justificatifRef") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  await refuserSiClose(mandat._id, donnees.mois);

  const typePrestataire =
    donnees.typePrestataire &&
    TYPES_PRESTATAIRE.some((t) => t.code === donnees.typePrestataire)
      ? donnees.typePrestataire
      : null;

  const montantTTC =
    ttcDe(donnees.montantHT, donnees.tauxTVA, donnees.timbreFiscal) +
    donnees.autresTaxes;

  await FactureFournisseurModel.create({
    ...donnees,
    typePrestataire,
    montantTTC,
    mandat: mandat._id,
  });

  await journaliser(session, {
    action: "facture.fournisseur.enregistrer",
    entite: "FactureFournisseur",
    details: `${donnees.reference} — ${donnees.fournisseur}`,
  });
  revalidatePath(`/tresorerie/declaration`);
}

export async function supprimerFactureFournisseur(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const { id } = z
    .object({ id: z.string().min(1) })
    .parse({ id: formData.get("id") });

  await connectDb();
  const facture = await FactureFournisseurModel.findById(id).lean();
  if (!facture) throw new Error("Facture introuvable.");
  await refuserSiClose(facture.mandat, facture.mois);

  await FactureFournisseurModel.deleteOne({ _id: new Types.ObjectId(id) });
  await journaliser(session, {
    action: "facture.fournisseur.supprimer",
    entite: "FactureFournisseur",
    entiteId: id,
    details: facture.reference,
  });
  revalidatePath(`/tresorerie/declaration`);
}

/**
 * Une déclaration close est une pièce remise à l'administration : on
 * n'autorise plus de mouvement sur le mois qu'elle couvre.
 */
async function refuserSiClose(mandatId: Types.ObjectId, mois: string) {
  const declaration = await DeclarationMensuelleModel.findOne({
    mandat: mandatId,
    mois,
  })
    .select("statut")
    .lean();
  if (declaration && declaration.statut !== "BROUILLON") {
    throw new Error(
      `La déclaration de ${libelleMois(mois)} est close : rouvrez-la pour modifier ses factures.`
    );
  }
}

/* ------------------------------------------------------------------ */
/* Agios                                                               */
/* ------------------------------------------------------------------ */

export async function ajouterAgios(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      mois: z.string().regex(MOIS),
      libelle: z.string().max(150).optional(),
      montantHT: z.coerce.number().min(0),
      tauxTVA: z.coerce.number().min(0).max(100),
    })
    .parse({
      mois: formData.get("mois"),
      libelle: formData.get("libelle") || undefined,
      montantHT: formData.get("montantHT"),
      tauxTVA: formData.get("tauxTVA") || TAUX_TVA_DEFAUT,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  await refuserSiClose(mandat._id, donnees.mois);

  await DeclarationMensuelleModel.updateOne(
    { mandat: mandat._id, mois: donnees.mois },
    {
      $setOnInsert: { statut: "BROUILLON" },
      $push: {
        agios: {
          libelle: donnees.libelle,
          montantHT: donnees.montantHT,
          tauxTVA: donnees.tauxTVA,
        },
      },
    },
    { upsert: true }
  );

  await journaliser(session, {
    action: "declaration.agios.ajouter",
    entite: "DeclarationMensuelle",
    details: `${donnees.mois} — ${donnees.montantHT} DT`,
  });
  revalidatePath(`/tresorerie/declaration`);
}

/* ------------------------------------------------------------------ */
/* Calcul et clôture                                                   */
/* ------------------------------------------------------------------ */

/**
 * Calcule la déclaration d'un mois à partir des factures enregistrées.
 * Utilisé par l'écran (affichage temps réel) comme par la clôture.
 */
export async function calculerDeclarationDuMois(
  mandatId: Types.ObjectId,
  mois: string
): Promise<{ declaration: Declaration; reportPrecedent: number }> {
  // Exportée depuis un fichier « use server » : joignable par le réseau. Elle
  // expose le chiffre d'affaires et la TVA du mois.
  await exigerModuleEtPermission("tresorerie", "lire");
  const debut = new Date(`${mois}-01T00:00:00.000Z`);
  const fin = new Date(debut);
  fin.setUTCMonth(fin.getUTCMonth() + 1);

  const [emises, avoirs, recues, courante, precedente] = await Promise.all([
    FactureModel.find({
      mandat: mandatId,
      emission: { $gte: debut, $lt: fin },
    }).lean(),
    // Un avoir est une facture négative : il diminue la TVA collectée du
    // mois où il est émis, jamais de celui de la facture d'origine, qui est
    // déjà déclaré.
    AvoirModel.find({ mandat: mandatId, mois }).lean(),
    FactureFournisseurModel.find({ mandat: mandatId, mois }).lean(),
    DeclarationMensuelleModel.findOne({ mandat: mandatId, mois }).lean(),
    DeclarationMensuelleModel.findOne({
      mandat: mandatId,
      mois: moisPrecedent(mois),
      statut: { $ne: "BROUILLON" },
    }).lean(),
  ]);

  // Le report ne vient que d'une déclaration CLOSE : un brouillon peut encore
  // changer, et bâtir un mois sur un chiffre mouvant produirait deux
  // déclarations incohérentes.
  const resultatPrecedent = precedente?.resultat as Declaration | undefined;
  const reportPrecedent = resultatPrecedent?.tvaAReporter ?? 0;

  const declaration = calculerDeclaration({
    facturesEmises: [
      ...emises.map((f) => ({
        montantHT: f.montantHT,
        tauxTVA: f.tauxTVA ?? TAUX_TVA_DEFAUT,
        timbreFiscal: f.timbreFiscal ?? TIMBRE_FISCAL_DT,
      })),
      ...avoirs.map((a) => ({
        montantHT: -a.montantHT,
        tauxTVA: a.tauxTVA,
        // Le droit de timbre acquitté sur la facture n'est pas restitué.
        timbreFiscal: 0,
      })),
    ],
    facturesRecues: recues.map((f) => ({
      montantHT: f.montantHT,
      tauxTVA: f.tauxTVA ?? TAUX_TVA_DEFAUT,
      timbreFiscal: f.timbreFiscal ?? TIMBRE_FISCAL_DT,
      tvaDeductible: f.tvaDeductible !== false,
      montantTTC: f.montantTTC,
      typePrestataire: f.typePrestataire,
    })),
    agios: (courante?.agios ?? []).map((a) => ({
      montantHT: a.montantHT,
      tauxTVA: a.tauxTVA ?? TAUX_TVA_DEFAUT,
    })),
    reportPrecedent,
  });

  return { declaration, reportPrecedent };
}

/**
 * Clôture le mois : fige les totaux, génère le document et libère le report
 * pour le mois suivant.
 */
export async function cloturerDeclaration(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "valider");
  const { mois } = z
    .object({ mois: z.string().regex(MOIS) })
    .parse({ mois: formData.get("mois") });

  await connectDb();
  const mandat = await mandatActifRequis();

  const existante = await DeclarationMensuelleModel.findOne({
    mandat: mandat._id,
    mois,
  });
  if (existante && existante.statut !== "BROUILLON") {
    throw new Error(`La déclaration de ${libelleMois(mois)} est déjà close.`);
  }

  // Une déclaration se bâtit sur la précédente : la clôturer dans le désordre
  // ferait perdre un report.
  const precedent = moisPrecedent(mois);
  const dPrecedente = await DeclarationMensuelleModel.findOne({
    mandat: mandat._id,
    mois: precedent,
  })
    .select("statut")
    .lean();
  if (dPrecedente && dPrecedente.statut === "BROUILLON") {
    throw new Error(
      `Clôturez d'abord ${libelleMois(precedent)} : son crédit de TVA se reporte sur ce mois.`
    );
  }

  const { declaration } = await calculerDeclarationDuMois(mandat._id, mois);

  const { id: documentId, reference } = await emettreDocument({
    modele: "DECLARATION_MENSUELLE",
    mandat,
    objetType: "DeclarationMensuelle",
    objetId: existante?._id,
    titre: `Déclaration fiscale — ${libelleMois(mois)}`,
    session,
    donnees: {
      reference: "",
      libelleMois: libelleMois(mois),
      mandat: mandat.annee,
      arreteeLe: new Date(),
      emises: declaration.emises,
      recues: declaration.recues,
      agios: declaration.agios,
      soldeTVA: declaration.soldeTVA,
      reportPrecedent: declaration.reportPrecedent,
      soldeApresReport: declaration.soldeApresReport,
      natureLibelle: LIBELLES_NATURE_TVA[declaration.nature],
      tvaAPayer: declaration.tvaAPayer,
      tvaAReporter: declaration.tvaAReporter,
      montantAPayer: declaration.montantAPayer,
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (donnees, ref) =>
      construireDeclarationMensuelle({ ...donnees, reference: ref }),
  });

  await DeclarationMensuelleModel.updateOne(
    { mandat: mandat._id, mois },
    {
      $set: {
        statut: "CLOTUREE",
        resultat: declaration,
        clotureeLe: new Date(),
        clotureeParNom: session.user?.name ?? session.user?.email,
        document: new Types.ObjectId(documentId),
      },
      $setOnInsert: { agios: [] },
    },
    { upsert: true }
  );

  await journaliser(session, {
    action: "declaration.cloturer",
    entite: "DeclarationMensuelle",
    details: `${libelleMois(mois)} — ${reference} — ${declaration.montantAPayer} DT`,
  });
  revalidatePath("/tresorerie/declaration");
  revalidatePath("/documents");
}

/** Rouvre une déclaration close pour corriger une facture. */
export async function rouvrirDeclaration(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "valider");
  const { mois } = z
    .object({ mois: z.string().regex(MOIS) })
    .parse({ mois: formData.get("mois") });

  await connectDb();
  const mandat = await mandatActifRequis();

  const declaration = await DeclarationMensuelleModel.findOne({
    mandat: mandat._id,
    mois,
  });
  if (!declaration) throw new Error("Déclaration introuvable.");
  if (declaration.statut === "DEPOSEE") {
    throw new Error(
      "Une déclaration déjà déposée ne se rouvre pas : la correction passe par une déclaration rectificative."
    );
  }

  // Un mois postérieur déjà clos s'appuie sur le report de celui-ci : le
  // rouvrir invaliderait sa base de calcul.
  const suivants = await DeclarationMensuelleModel.countDocuments({
    mandat: mandat._id,
    mois: { $gt: mois },
    statut: { $ne: "BROUILLON" },
  });
  if (suivants > 0) {
    throw new Error(
      "Un mois postérieur est déjà clos et s'appuie sur ce report : rouvrez-le d'abord."
    );
  }

  declaration.statut = "BROUILLON";
  declaration.resultat = undefined;
  declaration.clotureeLe = undefined;
  await declaration.save();

  await journaliser(session, {
    action: "declaration.rouvrir",
    entite: "DeclarationMensuelle",
    details: libelleMois(mois),
  });
  revalidatePath("/tresorerie/declaration");
}

/** Enregistre le dépôt effectif auprès de l'administration. */
export async function marquerDeclarationDeposee(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "valider");
  const { mois, preuveRef } = z
    .object({
      mois: z.string().regex(MOIS),
      preuveRef: z.string().min(2).max(200),
    })
    .parse({
      mois: formData.get("mois"),
      preuveRef: formData.get("preuveRef"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const declaration = await DeclarationMensuelleModel.findOne({
    mandat: mandat._id,
    mois,
  });
  if (!declaration) throw new Error("Déclaration introuvable.");
  if (declaration.statut === "BROUILLON") {
    throw new Error("Clôturez la déclaration avant d'enregistrer son dépôt.");
  }

  declaration.statut = "DEPOSEE";
  declaration.depotLe = new Date();
  declaration.preuveRef = preuveRef;
  await declaration.save();

  await journaliser(session, {
    action: "declaration.deposer",
    entite: "DeclarationMensuelle",
    details: `${libelleMois(mois)} — ${preuveRef}`,
  });
  revalidatePath("/tresorerie/declaration");
}

/* ------------------------------------------------------------------ */
/* Mouvements internes caisse ↔ banque                                 */
/* ------------------------------------------------------------------ */

/**
 * Enregistre un retrait ou un versement entre la caisse et le compte.
 *
 * Volontairement séparé de `saisirFlux` : un virement interne n'est ni une
 * recette ni une dépense, et le passer en flux gonflerait les encaissements
 * et fausserait le réalisé budgétaire.
 */
export async function enregistrerMouvementInterne(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      sens: z.enum(SENS_MOUVEMENT),
      montant: z.coerce.number().min(0.01),
      date: z.coerce.date(),
      reference: z.string().max(120).optional(),
      notes: z.string().max(500).optional(),
    })
    .parse({
      sens: formData.get("sens"),
      montant: formData.get("montant"),
      date: formData.get("date") || new Date(),
      reference: formData.get("reference") || undefined,
      notes: formData.get("notes") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();

  // Un versement ne peut pas dépasser ce qu'il y a réellement en caisse :
  // un solde de caisse négatif est une impossibilité physique, pas une
  // écriture comptable.
  if (donnees.sens === "VERSEMENT") {
    const { caisse } = await soldesActuels(mandat._id);
    if (donnees.montant > caisse) {
      throw new Error(
        `Versement impossible : la caisse ne contient que ${caisse.toFixed(3)} DT.`
      );
    }
  }

  await MouvementInterneModel.create({ mandat: mandat._id, ...donnees });

  await journaliser(session, {
    action: "tresorerie.mouvementInterne",
    entite: "MouvementInterne",
    details: `${donnees.sens} ${donnees.montant} DT`,
  });
  revalidatePath("/tresorerie/caisse");
  revalidatePath("/tresorerie");
}

/** Soldes caisse / banque à l'instant présent. */
export async function soldesActuels(mandatId: Types.ObjectId) {
  // Expose les soldes de la JE : joignable par le reseau sans cette garde.
  await exigerModuleEtPermission("tresorerie", "lire");
  const [budget, flux, mouvements] = await Promise.all([
    BudgetPrevisionnelModel.findOne({ mandat: mandatId })
      .select("soldeInitial soldeInitialCaisse")
      .lean(),
    FluxTresorerieModel.find({ mandat: mandatId })
      .select("type montant date compte modePaiement")
      .lean(),
    MouvementInterneModel.find({ mandat: mandatId })
      .select("sens montant date")
      .lean(),
  ]);

  const caisseInitiale = budget?.soldeInitialCaisse ?? 0;
  return soldesParCompte(
    {
      caisse: caisseInitiale,
      banque: (budget?.soldeInitial ?? 0) - caisseInitiale,
    },
    flux.map((f) => ({
      type: f.type as "ENCAISSEMENT" | "DECAISSEMENT",
      compte: (f.compte as "CAISSE" | "BANQUE") ?? comptePourMode(f.modePaiement),
      montant: f.montant,
      date: new Date(f.date),
      tiers: "",
      categorie: "",
    })),
    mouvements.map((m) => ({
      sens: m.sens as "RETRAIT" | "VERSEMENT",
      montant: m.montant,
      date: new Date(m.date),
    }))
  );
}

/* ------------------------------------------------------------------ */
/* Rapport financier mensuel                                           */
/* ------------------------------------------------------------------ */

/**
 * Génère le rapport financier d'un mois : trésorerie d'ouverture et de
 * clôture, encaissements et décaissements, réalisé par ligne budgétaire.
 *
 * Contrairement à la déclaration fiscale, il n'y a rien à figer ni à
 * reporter : le rapport est une photo du journal à un instant donné, et on
 * peut le régénérer si des écritures ont été corrigées.
 */
export async function genererRapportMensuel(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const { mois } = z
    .object({ mois: z.string().regex(MOIS) })
    .parse({ mois: formData.get("mois") });

  await connectDb();
  const mandat = await mandatActifRequis();

  const [budget, fluxBruts, mouvementsBruts] = await Promise.all([
    BudgetPrevisionnelModel.findOne({ mandat: mandat._id }).lean(),
    FluxTresorerieModel.find({ mandat: mandat._id }).lean(),
    MouvementInterneModel.find({ mandat: mandat._id }).lean(),
  ]);

  const caisseInitiale = budget?.soldeInitialCaisse ?? 0;
  const initiaux = {
    caisse: caisseInitiale,
    banque: (budget?.soldeInitial ?? 0) - caisseInitiale,
  };

  const flux = fluxBruts.map((f) => ({
    type: f.type as "ENCAISSEMENT" | "DECAISSEMENT",
    compte: (f.compte as "CAISSE" | "BANQUE") ?? comptePourMode(f.modePaiement),
    montant: f.montant,
    date: new Date(f.date),
    tiers: f.tiers,
    categorie: f.categorie,
    justificatifRef: f.justificatifRef,
  }));
  const mouvements = mouvementsBruts.map((m) => ({
    sens: m.sens as "RETRAIT" | "VERSEMENT",
    montant: m.montant,
    date: new Date(m.date),
  }));

  // Bornes du mois : la veille au soir pour l'ouverture, le dernier instant
  // du mois pour la clôture.
  const [annee, m] = mois.split("-").map(Number);
  const veille = new Date(annee, m - 1, 0, 23, 59, 59, 999);
  const finDuMois = new Date(annee, m, 0, 23, 59, 59, 999);

  const debut = soldesParCompte(initiaux, flux, mouvements, veille);
  const fin = soldesParCompte(initiaux, flux, mouvements, finDuMois);

  const duMois = flux.filter(
    (f) =>
      `${f.date.getFullYear()}-${String(f.date.getMonth() + 1).padStart(2, "0")}` ===
      mois
  );

  // Le budgété comparé ici est celui DU MOIS du rapport, pas le total du
  // mandat : comparer un mois réel à un total annuel n'aurait pas de sens.
  const periodesMandat = moisDuMandat(new Date(mandat.debut), new Date(mandat.fin));
  const indexMois = periodesMandat.findIndex((p) => p.cle === mois);
  const lignesBudget = (budget?.lignes ?? []).map((l) => ({
    categorie: l.libelle,
    type: SENS_SECTION_BUDGET[l.section as keyof typeof SENS_SECTION_BUDGET] === "RECETTE"
      ? ("PRODUIT" as const)
      : ("CHARGE" as const),
    prevu:
      indexMois === -1
        ? 0
        : (normaliserValeurs(l.valeursMensuelles, periodesMandat.length)[indexMois] ?? 0),
  }));
  const realise = realiseParLigne(
    lignesBudget,
    duMois.map((f) => ({
      type: f.type,
      montant: f.montant,
      categorie: f.categorie,
      justificatifRef: f.justificatifRef,
    }))
  );

  const { reference } = await emettreDocument({
    modele: "RAPPORT_FINANCIER_MENSUEL",
    mandat,
    objetType: "RapportMensuel",
    titre: `Rapport financier — ${libelleMois(mois)}`,
    session,
    donnees: {
      reference: "",
      libelleMois: libelleMois(mois),
      mandat: mandat.annee,
      arreteLe: new Date(),
      soldes: {
        caisseDebut: debut.caisse,
        banqueDebut: debut.banque,
        caisseFin: fin.caisse,
        banqueFin: fin.banque,
      },
      entrees: duMois
        .filter((f) => f.type === "ENCAISSEMENT")
        .reduce((s, f) => s + f.montant, 0),
      sorties: duMois
        .filter((f) => f.type === "DECAISSEMENT")
        .reduce((s, f) => s + f.montant, 0),
      sansJustificatif: fluxSansJustificatif(
        flux.map((f) => ({
          type: f.type,
          montant: f.montant,
          categorie: f.categorie,
          justificatifRef: f.justificatifRef,
        }))
      ),
      produits: realise.filter((l) => l.type === "PRODUIT"),
      charges: realise.filter((l) => l.type === "CHARGE"),
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (donnees, ref) =>
      construireRapportFinancierMensuel({ ...donnees, reference: ref }),
  });

  await journaliser(session, {
    action: "tresorerie.rapportMensuel",
    entite: "Document",
    details: `${libelleMois(mois)} — ${reference}`,
  });
  revalidatePath("/tresorerie/caisse");
  revalidatePath("/documents");
}
