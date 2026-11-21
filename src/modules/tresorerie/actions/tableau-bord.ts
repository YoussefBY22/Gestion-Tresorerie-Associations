"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { notifier } from "@/modules/core/services/notifications";
import { MandatModel } from "@/modules/core/models";
import { KPIHistoriqueModel } from "@/modules/base/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  StrategieFinanciereModel,
} from "@/modules/tresorerie/models";
import {
  LIBELLES_STATUT_OBJECTIF,
  OBJECTIFS_OBLIGATOIRES,
  STATUTS_OBJECTIF_FINANCIER,
  objectifSupprimable,
} from "@/modules/tresorerie/services/strategie-financiere";
import {
  SECTIONS_BUDGET,
  moisDuMandat,
  soldeCumule,
  totalParSens,
} from "@/modules/tresorerie/services/budget-previsionnel";
import {
  INDICATEURS_COMPARAISON_MANDATS,
  indicateursExercice,
  pointsFaibles,
  pointsForts,
  repartitionParCategorie,
  variation as variationRelative,
  type PointMensuel,
} from "@/modules/tresorerie/services/tableau-bord";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireRapportSynthese } from "@/modules/documents/services/gabarits/rapport-synthese-periode";

/**
 * Comparaison des mandats et stratégie financière.
 *
 * La comparaison des mandats réutilise le registre `KPIHistorique` déjà
 * bâti pour l'alignement stratégique (module management) : la même donnée
 * (chiffres du mandat précédent) sert les deux vues, plutôt que d'en tenir
 * une copie séparée qui finirait par diverger. Seule la porte d'entrée
 * change — ici gardée par `tresorerie:ecrire`, pas `management:ecrire`.
 */

function rafraichirStrategie() {
  revalidatePath("/tresorerie/documentation");
  revalidatePath("/tresorerie/documentation/strategie");
  revalidatePath("/tresorerie/documentation/mandats");
  revalidatePath("/tresorerie/statistiques");
}

async function mandatActifRequis() {
  const mandat = await MandatModel.findOne({ statut: "ACTIF" });
  if (!mandat) throw new Error("Aucun mandat actif.");
  return mandat;
}

export async function enregistrerComparaisonMandat(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      annee: z
        .string()
        .regex(/^\d{4}-\d{4}$/, "Format attendu : AAAA-AAAA (ex. 2023-2024)"),
      indicateur: z.enum(INDICATEURS_COMPARAISON_MANDATS),
      valeur: z.string().min(1).max(200),
      commentaire: z.string().max(1000).optional(),
    })
    .parse({
      annee: formData.get("annee"),
      indicateur: formData.get("indicateur"),
      valeur: formData.get("valeur"),
      commentaire: formData.get("commentaire") || undefined,
    });

  await connectDb();
  await KPIHistoriqueModel.findOneAndUpdate(
    { annee: donnees.annee, indicateur: donnees.indicateur },
    { $set: donnees },
    { upsert: true }
  );

  await journaliser(session, {
    action: "tresorerie.comparaisonMandat",
    entite: "KPIHistorique",
    details: `${donnees.indicateur} — ${donnees.annee} : ${donnees.valeur}`,
  });
  rafraichirStrategie();
}

/* ------------------------------------------------------------------ */
/* Stratégie financière                                                */
/* ------------------------------------------------------------------ */

export async function creerStrategieFinanciere(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const nombreMoisChargesFixes = z.coerce
    .number()
    .min(1)
    .parse(formData.get("nombreMoisChargesFixes") || 12);

  await connectDb();
  const mandat = await mandatActifRequis();
  const existante = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (existante) throw new Error("La stratégie financière existe déjà pour ce mandat.");

  await StrategieFinanciereModel.create({
    mandat: mandat._id,
    nombreMoisChargesFixes,
    // Les deux objectifs de la Norme JE naissent verrouillés : leur
    // suppression exigera l'accord du Président.
    objectifs: OBJECTIFS_OBLIGATOIRES.map((o) => ({ ...o, verrouille: true })),
  });

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.creer",
    entite: "StrategieFinanciere",
    details: `Exercice ${mandat.annee}`,
  });
  rafraichirStrategie();
}

export async function majNombreMoisChargesFixes(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const nombreMoisChargesFixes = z.coerce
    .number()
    .min(1)
    .parse(formData.get("nombreMoisChargesFixes"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Créez d'abord la stratégie financière.");

  strategie.nombreMoisChargesFixes = nombreMoisChargesFixes;
  await strategie.save();

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.moisChargesFixes",
    entite: "StrategieFinanciere",
    details: String(nombreMoisChargesFixes),
  });
  rafraichirStrategie();
}

export async function ajouterObjectifFinancier(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      libelle: z.string().min(3).max(200),
      kpiAssocie: z.string().max(200).optional(),
      cible: z.string().max(100).optional(),
      echeance: z.coerce.date().optional(),
    })
    .parse({
      libelle: formData.get("libelle"),
      kpiAssocie: formData.get("kpiAssocie") || undefined,
      cible: formData.get("cible") || undefined,
      echeance: formData.get("echeance") || undefined,
    });
  // Un objectif verrouillé engage le mandat entier : le Trésorier le propose,
  // le Président le grave. Sans cet accord, il reste une proposition visible
  // mais qui ne compte pas.
  const verrouille = formData.get("verrouille") === "on";

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Créez d'abord la stratégie financière.");

  strategie.objectifs.push({
    ...donnees,
    verrouille,
    validation: verrouille
      ? {
          statut: "EN_ATTENTE",
          demandeLe: new Date(),
          demandePar: session.user?.id,
        }
      : undefined,
  } as unknown as (typeof strategie.objectifs)[number]);
  await strategie.save();

  if (verrouille) {
    await notifier(
      { roles: ["PRESIDENT", "SUPER_ADMIN"] },
      {
        titre: "Objectif financier à graver",
        message: `${session.user?.name ?? "Le Trésorier"} propose « ${donnees.libelle} » comme objectif verrouillé du mandat ${mandat.annee}. Une fois accepté, il ne se modifie ni ne se supprime plus sans votre accord.`,
        lien: "/tresorerie/documentation/strategie",
        type: "validation",
        critique: true,
        cle: `objectif-verrou:${strategie._id}:${donnees.libelle}`,
      }
    );
  }

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.objectif.ajouter",
    entite: "StrategieFinanciere",
    details: `${donnees.libelle}${verrouille ? " — verrouillage soumis au Président" : ""}`,
  });
  rafraichirStrategie();
}

/** Décision du Président sur un objectif que le Trésorier veut graver. */
export async function deciderValidationObjectif(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "valider");
  const donnees = z
    .object({
      objectifId: z.string().min(1),
      decision: z.enum(["ACCEPTEE", "REFUSEE"]),
      motifDecision: z.string().max(2000).optional(),
    })
    .parse({
      objectifId: formData.get("objectifId"),
      decision: formData.get("decision"),
      motifDecision: formData.get("motifDecision") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Stratégie financière introuvable.");

  const objectif = strategie.objectifs.id(donnees.objectifId);
  if (!objectif?.validation) {
    throw new Error("Cet objectif n'attend aucune décision.");
  }
  if (objectif.validation.statut !== "EN_ATTENTE") {
    throw new Error("Cette proposition a déjà été tranchée.");
  }

  objectif.validation.statut = donnees.decision;
  objectif.validation.decidePar = session.user?.id
    ? new Types.ObjectId(session.user.id)
    : undefined;
  objectif.validation.decideLe = new Date();
  objectif.validation.motifDecision = donnees.motifDecision;
  // Refusé, l'objectif redevient un objectif ordinaire : le Trésorier le garde
  // s'il y tient, mais il ne s'impose à personne.
  if (donnees.decision === "REFUSEE") objectif.verrouille = false;
  await strategie.save();

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.objectif.valider",
    entite: "StrategieFinanciere",
    entiteId: donnees.objectifId,
    details: `${objectif.libelle} — ${donnees.decision}`,
  });
  rafraichirStrategie();
}

export async function majStatutObjectif(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      objectifId: z.string().min(1),
      statut: z.enum(STATUTS_OBJECTIF_FINANCIER),
    })
    .parse({
      objectifId: formData.get("objectifId"),
      statut: formData.get("statut"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Stratégie financière introuvable.");

  const objectif = strategie.objectifs.id(donnees.objectifId);
  if (!objectif) throw new Error("Objectif introuvable.");
  objectif.statut = donnees.statut;
  await strategie.save();

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.objectif.statut",
    entite: "StrategieFinanciere",
    entiteId: donnees.objectifId,
    details: `${LIBELLES_STATUT_OBJECTIF[donnees.statut]}`,
  });
  rafraichirStrategie();
}

/** Supprime directement un objectif non verrouillé. */
export async function supprimerObjectifFinancier(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const objectifId = z.string().min(1).parse(formData.get("objectifId"));

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Stratégie financière introuvable.");

  const objectif = strategie.objectifs.id(objectifId);
  if (!objectif) throw new Error("Objectif introuvable.");
  if (
    !objectifSupprimable(
      Boolean(objectif.verrouille),
      objectif.demandeSuppression
        ? { statut: objectif.demandeSuppression.statut as "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE" }
        : null
    )
  ) {
    throw new Error(
      "Cet objectif est imposé par la Norme JE : demandez l'accord du Président pour le supprimer."
    );
  }

  strategie.objectifs.pull(objectifId);
  await strategie.save();

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.objectif.supprimer",
    entite: "StrategieFinanciere",
    entiteId: objectifId,
  });
  rafraichirStrategie();
}

export async function demanderSuppressionObjectif(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      objectifId: z.string().min(1),
      motif: z.string().min(10).max(2000),
    })
    .parse({
      objectifId: formData.get("objectifId"),
      motif: formData.get("motif"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Stratégie financière introuvable.");

  const objectif = strategie.objectifs.id(donnees.objectifId);
  if (!objectif) throw new Error("Objectif introuvable.");
  if (!objectif.verrouille) {
    throw new Error("Cet objectif n'est pas verrouillé : supprimez-le directement.");
  }
  if (objectif.demandeSuppression?.statut === "EN_ATTENTE") {
    throw new Error("Une demande est déjà en attente pour cet objectif.");
  }

  objectif.demandeSuppression = {
    motif: donnees.motif,
    demandeLe: new Date(),
    demandePar: session.user.id,
    statut: "EN_ATTENTE",
  } as unknown as (typeof objectif)["demandeSuppression"];
  await strategie.save();

  await notifier(
    { roles: ["PRESIDENT", "SUPER_ADMIN"] },
    {
      titre: `Demande de suppression d'un objectif financier obligatoire`,
      message: `${session.user.name ?? "Le Trésorier"} demande à retirer « ${objectif.libelle} » — motif : ${donnees.motif}`,
      lien: "/tresorerie/statistiques",
      type: "validation",
      critique: true,
      cle: `objectif-suppression:${donnees.objectifId}`,
    }
  );

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.objectif.demandeSuppression",
    entite: "StrategieFinanciere",
    entiteId: donnees.objectifId,
    details: donnees.motif.slice(0, 160),
  });
  rafraichirStrategie();
}

export async function deciderSuppressionObjectif(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "valider");
  const donnees = z
    .object({
      objectifId: z.string().min(1),
      decision: z.enum(["ACCEPTEE", "REFUSEE"]),
      motifDecision: z.string().max(2000).optional(),
    })
    .parse({
      objectifId: formData.get("objectifId"),
      decision: formData.get("decision"),
      motifDecision: formData.get("motifDecision") || undefined,
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const strategie = await StrategieFinanciereModel.findOne({ mandat: mandat._id });
  if (!strategie) throw new Error("Stratégie financière introuvable.");

  const objectif = strategie.objectifs.id(donnees.objectifId);
  if (!objectif?.demandeSuppression || objectif.demandeSuppression.statut !== "EN_ATTENTE") {
    throw new Error("Aucune demande en attente pour cet objectif.");
  }

  objectif.demandeSuppression.statut = donnees.decision;
  objectif.demandeSuppression.decidePar = session.user.id as unknown as typeof objectif.demandeSuppression.decidePar;
  objectif.demandeSuppression.decideLe = new Date();
  objectif.demandeSuppression.motifDecision = donnees.motifDecision;

  if (donnees.decision === "ACCEPTEE") {
    // L'accord du Président ne supprime pas tout seul : le Trésorier
    // applique ensuite le retrait, comme pour la fin d'une modification de
    // budget — une trace explicite de qui a agi.
    strategie.markModified("objectifs");
  }
  await strategie.save();

  await notifier(
    objectif.demandeSuppression.demandePar
      ? { utilisateurIds: [String(objectif.demandeSuppression.demandePar)] }
      : { roles: ["TRESORIER"] },
    {
      titre:
        donnees.decision === "ACCEPTEE"
          ? "Suppression d'objectif acceptée"
          : "Suppression d'objectif refusée",
      message:
        donnees.decision === "ACCEPTEE"
          ? `Le Président a accepté le retrait de « ${objectif.libelle} ». Vous pouvez le supprimer.`
          : `Le Président a refusé le retrait de « ${objectif.libelle} ».${donnees.motifDecision ? ` Motif : ${donnees.motifDecision}` : ""}`,
      lien: "/tresorerie/statistiques",
      type: "validation",
      critique: true,
      cle: `objectif-decision:${donnees.objectifId}`,
    }
  );

  await journaliser(session, {
    action: "tresorerie.strategieFinanciere.objectif.decider",
    entite: "StrategieFinanciere",
    entiteId: donnees.objectifId,
    details: donnees.decision,
  });
  rafraichirStrategie();
}

/* ------------------------------------------------------------------ */
/* Rapport de synthèse — une ou plusieurs périodes, jusqu'au mandat      */
/* ------------------------------------------------------------------ */

function moisDe(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** « 2025-2026 » → « 2024-2025 » : mécanique, pas une donnée à saisir. */
function anneePrecedente(annee: string): string | null {
  const m = annee.match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  return `${Number(m[1]) - 1}-${Number(m[2]) - 1}`;
}

export async function genererRapportSynthese(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      moisDebut: z.string().regex(/^\d{4}-\d{2}$/),
      moisFin: z.string().regex(/^\d{4}-\d{2}$/),
    })
    .parse({
      moisDebut: formData.get("moisDebut"),
      moisFin: formData.get("moisFin"),
    });

  await connectDb();
  const mandat = await mandatActifRequis();
  const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandat._id });
  if (!budget) throw new Error("Créez d'abord le budget prévisionnel du mandat.");

  const periodesMandat = moisDuMandat(mandat.debut, mandat.fin);
  const iDebut = periodesMandat.findIndex((p) => p.cle === donnees.moisDebut);
  const iFin = periodesMandat.findIndex((p) => p.cle === donnees.moisFin);
  if (iDebut === -1 || iFin === -1 || iFin < iDebut) {
    throw new Error("Période invalide : le mois de fin doit suivre le mois de début.");
  }

  const fluxBruts = await FluxTresorerieModel.find({ mandat: mandat._id })
    .select("type montant date categorie")
    .lean();
  const flux = fluxBruts.map((f) => ({
    type: f.type as "ENCAISSEMENT" | "DECAISSEMENT",
    montant: f.montant,
    date: new Date(f.date),
    categorie: f.categorie,
  }));

  const sectionsCalc = SECTIONS_BUDGET.map((s) => ({
    sens: s.sens,
    lignes: budget.lignes.filter((l) => l.section === s.code),
  }));
  const recettesBudgetMois = totalParSens(sectionsCalc, "RECETTE", periodesMandat.length);
  const depensesBudgetMois = totalParSens(sectionsCalc, "DEPENSE", periodesMandat.length);

  const recettesReellesMois = periodesMandat.map((p) =>
    Math.round(
      flux
        .filter((f) => f.type === "ENCAISSEMENT" && moisDe(f.date) === p.cle)
        .reduce((s, f) => s + f.montant, 0) * 1000
    ) / 1000
  );
  const depensesReellesMois = periodesMandat.map((p) =>
    Math.round(
      flux
        .filter((f) => f.type === "DECAISSEMENT" && moisDe(f.date) === p.cle)
        .reduce((s, f) => s + f.montant, 0) * 1000
    ) / 1000
  );
  const bilanReelMois = recettesReellesMois.map(
    (r, i) => Math.round((r - depensesReellesMois[i]) * 1000) / 1000
  );
  const soldeReelCumule = soldeCumule(budget.soldeInitial, bilanReelMois);

  const pointsMandat: PointMensuel[] = periodesMandat.map((p, i) => ({
    periode: p.libelle,
    soldeOuverture: i === 0 ? budget.soldeInitial : soldeReelCumule[i - 1],
    soldeCloture: soldeReelCumule[i],
    recettesReelles: recettesReellesMois[i],
    depensesReelles: depensesReellesMois[i],
    recettesBudget: recettesBudgetMois[i],
    depensesBudget: depensesBudgetMois[i],
  }));
  const pointsSelection = pointsMandat.slice(iDebut, iFin + 1);
  const ind = indicateursExercice(pointsSelection);

  const [anneeDebut, moisDebutNum] = donnees.moisDebut.split("-").map(Number);
  const [anneeFin, moisFinNum] = donnees.moisFin.split("-").map(Number);
  const debutRange = new Date(anneeDebut, moisDebutNum - 1, 1);
  const finRange = new Date(anneeFin, moisFinNum, 0, 23, 59, 59, 999);
  const fluxPeriode = flux.filter(
    (f) => f.date >= debutRange && f.date <= finRange
  );

  const estMandatEntier = iDebut === 0 && iFin === periodesMandat.length - 1;
  let comparaisonMandatPrecedent: { annee: string; variationRecettes: number | null } | undefined;
  if (estMandatEntier) {
    const anneePrec = anneePrecedente(mandat.annee);
    if (anneePrec) {
      const kpi = await KPIHistoriqueModel.findOne({
        annee: anneePrec,
        indicateur: "Trésorerie — Total recettes (DT)",
      }).lean();
      // La valeur est stockée en nombre : plus rien à analyser.
      const recettesPrecedentes = typeof kpi?.valeur === "number" ? kpi.valeur : null;
      comparaisonMandatPrecedent = {
        annee: anneePrec,
        variationRecettes: variationRelative(ind.totalRecettesReelles, recettesPrecedentes),
      };
    }
  }

  const intitulePeriode =
    iDebut === iFin
      ? periodesMandat[iDebut].libelle
      : estMandatEntier
        ? `Exercice ${mandat.annee}`
        : `${periodesMandat[iDebut].libelle} à ${periodesMandat[iFin].libelle}`;

  const { reference } = await emettreDocument({
    modele: "RAPPORT_SYNTHESE_TRESORERIE",
    mandat: { _id: mandat._id, annee: mandat.annee },
    objetType: "RapportSyntheseTresorerie",
    titre: `Rapport de synthèse — ${intitulePeriode}`,
    session,
    donnees: {
      reference: "",
      intitulePeriode,
      mandat: mandat.annee,
      arreteLe: new Date(),
      soldeOuverture: pointsSelection[0]?.soldeOuverture ?? budget.soldeInitial,
      soldeCloture: ind.soldeCloture,
      totalRecettesReelles: ind.totalRecettesReelles,
      totalDepensesReelles: ind.totalDepensesReelles,
      totalRecettesBudget: ind.totalRecettesBudget,
      totalDepensesBudget: ind.totalDepensesBudget,
      tauxRealisationRecettes: ind.tauxRealisationRecettes,
      tauxRealisationDepenses: ind.tauxRealisationDepenses,
      tauxDeCharges: ind.tauxDeCharges,
      soldeMinimum: ind.soldeMinimum,
      periodesDeficitaires: ind.periodesDeficitaires,
      repartitionRecettes: repartitionParCategorie(fluxPeriode, "ENCAISSEMENT"),
      repartitionDepenses: repartitionParCategorie(fluxPeriode, "DECAISSEMENT"),
      pointsForts: pointsForts(
        ind,
        comparaisonMandatPrecedent?.variationRecettes ?? null
      ).map((c) => c.texte),
      pointsFaibles: pointsFaibles(ind).map((c) => c.texte),
      comparaisonMandatPrecedent,
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (d, ref) => construireRapportSynthese({ ...d, reference: ref }),
  });

  await journaliser(session, {
    action: "tresorerie.rapportSynthese",
    entite: "RapportSyntheseTresorerie",
    details: `${intitulePeriode} — ${reference}`,
  });
  revalidatePath("/documents");
  rafraichirStrategie();
}
