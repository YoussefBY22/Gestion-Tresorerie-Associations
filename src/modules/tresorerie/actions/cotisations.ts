"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import {
  MandatModel,
  MembreModel,
  UtilisateurModel,
} from "@/modules/core/models";
import { CotisationModel } from "@/modules/base/models";
import { FluxTresorerieModel } from "@/modules/tresorerie/models";
import { emettreDocument } from "@/modules/documents/services/emission";
import { construireRecuCotisation } from "@/modules/documents/services/gabarits/recu-cotisation";
import { envoyerCotisationALaCorbeille } from "@/modules/tresorerie/services/suppression-cotisation";

/**
 * Encaissement d'une cotisation saisie au journal des flux.
 *
 * Le Trésorier encaissait une cotisation comme n'importe quel flux, avec un
 * simple nom de tiers. Le registre des cotisations, lui, se nourrit du module
 * RH et restait donc vide : l'argent était là, le cotisant nulle part.
 *
 * On demande désormais l'identité **avant** d'émettre le reçu, et cette
 * saisie alimente les trois registres d'un coup : les adhérents (registre
 * légal, décret-loi 2011-88), les cotisations, et la pièce justificative. Une
 * seule saisie, parce qu'aucune des trois ne se déduit des deux autres.
 */

const SchemaCotisant = z.object({
  fluxId: z.string().min(1),
  nom: z.string().min(2).max(120),
  prenom: z.string().min(1).max(120),
  cin: z.string().min(4).max(20),
  email: z.string().email().optional().or(z.literal("")),
  adresse: z.string().min(3).max(300),
  nationalite: z.string().min(2).max(80),
  dateNaissance: z.coerce.date(),
  profession: z.string().min(2).max(120),
  modePaiement: z.string().max(60).optional(),
});

export async function encaisserCotisationDepuisFlux(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = SchemaCotisant.parse({
    fluxId: formData.get("fluxId"),
    nom: formData.get("nom"),
    prenom: formData.get("prenom"),
    cin: formData.get("cin"),
    email: formData.get("email") || "",
    adresse: formData.get("adresse"),
    nationalite: formData.get("nationalite"),
    dateNaissance: formData.get("dateNaissance"),
    profession: formData.get("profession"),
    modePaiement: formData.get("modePaiement") || undefined,
  });

  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" }).lean();
  if (!mandat) throw new Error("Aucun mandat actif.");

  const flux = await FluxTresorerieModel.findById(donnees.fluxId);
  if (!flux) throw new Error("Opération introuvable.");
  if (flux.type !== "ENCAISSEMENT") {
    throw new Error("Une cotisation est un encaissement, pas un décaissement.");
  }

  const nomComplet = `${donnees.prenom.trim()} ${donnees.nom.trim()}`.trim();
  // Sans e-mail, on fabrique une clé stable à partir du nom : le registre doit
  // pouvoir accueillir un cotisant qui n'a pas de compte dans l'application, sans pour
  // autant créer un doublon à chaque encaissement.
  const email =
    donnees.email?.trim().toLowerCase() ||
    `${nomComplet.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@cotisant.local`;

  const utilisateur = await UtilisateurModel.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, nom: nomComplet, actif: false, roles: ["MEMBRE"] } },
    { upsert: true, new: true }
  );

  const membre = await MembreModel.findOneAndUpdate(
    { utilisateur: utilisateur._id },
    {
      $set: {
        adresse: donnees.adresse,
        cin: donnees.cin,
        nationalite: donnees.nationalite,
        dateNaissance: donnees.dateNaissance,
        profession: donnees.profession,
      },
      $setOnInsert: { utilisateur: utilisateur._id, statut: "ACTIF" },
    },
    { upsert: true, new: true }
  );

  const cotisation = await CotisationModel.findOneAndUpdate(
    { mandat: mandat._id, membre: membre._id },
    {
      $set: {
        montant: flux.montant,
        payee: true,
        datePaiement: flux.date ?? new Date(),
        // Le lien vers l'opération : sans lui, effacer l'encaissement
        // laissait la cotisation derrière lui (voir services/suppression-cotisation).
        flux: flux._id,
      },
    },
    { upsert: true, new: true }
  );

  const { reference } = await emettreDocument({
    modele: "RECU_COTISATION",
    mandat: { _id: mandat._id, annee: mandat.annee },
    objetType: "Cotisation",
    objetId: cotisation._id,
    titre: `Reçu de cotisation — ${nomComplet}`,
    session,
    donnees: {
      reference: "",
      membre: nomComplet,
      email: donnees.email?.trim() || undefined,
      cin: donnees.cin,
      qualite: "Membre",
      montant: flux.montant,
      modePaiement: donnees.modePaiement ?? "Espèces",
      datePaiement: flux.date ?? new Date(),
      mandat: mandat.annee,
      emetteur: session.user?.name ?? undefined,
    },
    gabarit: (d, ref) => construireRecuCotisation({ ...d, reference: ref }),
  });

  // Le reçu vaut justificatif du flux, comme pour tout encaissement.
  flux.justificatifRef = reference;
  await flux.save();

  await journaliser(session, {
    action: "tresorerie.cotisation.encaisser",
    entite: "Cotisation",
    entiteId: String(cotisation._id),
    details: `${nomComplet} — ${flux.montant} DT — ${reference}`,
  });

  revalidatePath("/tresorerie/recus");
  revalidatePath("/tresorerie/flux");
  revalidatePath("/tresorerie/registres/cotisations");
  revalidatePath("/documents");
}

/* ------------------------------------------------------------------ */
/* Registre des cotisations — correction et retrait                    */
/* ------------------------------------------------------------------ */

/**
 * Champs corrigeables d'une ligne du registre.
 *
 * Le registre était en lecture seule, au motif qu'il se remplit tout seul à
 * l'encaissement. Mais une saisie d'identité faite au comptoir se trompe :
 * une CIN mal recopiée, un domicile approximatif, un montant arrondi. Sans
 * correction, la seule issue était de supprimer et de tout ressaisir — et le
 * registre légal des adhérents ne se ressaisit pas de mémoire.
 *
 * L'identité vit sur le membre (registre des adhérents), le paiement sur la
 * cotisation : une correction ici touche les deux, comme la saisie initiale.
 */
const SchemaCorrectionCotisation = z.object({
  cotisationId: z.string().min(1),
  nom: z.string().min(2).max(240),
  cin: z.string().max(20).optional(),
  adresse: z.string().max(300).optional(),
  nationalite: z.string().max(80).optional(),
  dateNaissance: z.coerce.date().optional(),
  profession: z.string().max(120).optional(),
  montant: z.coerce.number().min(0),
  datePaiement: z.coerce.date().optional(),
  payee: z.coerce.boolean(),
});

export async function modifierCotisation(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = SchemaCorrectionCotisation.parse({
    cotisationId: formData.get("cotisationId"),
    nom: formData.get("nom"),
    cin: formData.get("cin") || undefined,
    adresse: formData.get("adresse") || undefined,
    nationalite: formData.get("nationalite") || undefined,
    dateNaissance: formData.get("dateNaissance") || undefined,
    profession: formData.get("profession") || undefined,
    montant: formData.get("montant"),
    datePaiement: formData.get("datePaiement") || undefined,
    payee: formData.get("payee") === "on" || formData.get("payee") === "true",
  });

  await connectDb();
  const cotisation = await CotisationModel.findById(donnees.cotisationId);
  if (!cotisation) throw new Error("Cotisation introuvable.");

  const avant = `${cotisation.montant} DT${cotisation.payee ? " payée" : " en attente"}`;
  cotisation.montant = donnees.montant;
  cotisation.payee = donnees.payee;
  // Une cotisation qui n'est plus payée n'a plus de date de paiement : la
  // laisser derrière ferait un registre qui se contredit tout seul.
  cotisation.datePaiement = donnees.payee ? (donnees.datePaiement ?? cotisation.datePaiement) : undefined;
  await cotisation.save();

  const membre = await MembreModel.findById(cotisation.membre);
  if (membre) {
    membre.set({
      cin: donnees.cin,
      adresse: donnees.adresse,
      nationalite: donnees.nationalite,
      dateNaissance: donnees.dateNaissance,
      profession: donnees.profession,
    });
    await membre.save();
  }

  await journaliser(session, {
    action: "tresorerie.cotisation.modifier",
    entite: "Cotisation",
    entiteId: donnees.cotisationId,
    details: `${donnees.nom} : ${avant} → ${donnees.montant} DT${donnees.payee ? " payée" : " en attente"}`,
  });

  revalidatePath("/tresorerie/registres/cotisations");
  revalidatePath("/tresorerie/recus");
  revalidatePath("/rh/cotisations");
}

/**
 * Retire une cotisation du registre — elle part à la corbeille avec son reçu.
 * Le cotisant reste au registre des adhérents : on retire un paiement, on ne
 * radie pas une personne.
 */
export async function supprimerCotisation(formData: FormData) {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const cotisationId = z.string().min(1).parse(formData.get("cotisationId"));

  const libelle = await envoyerCotisationALaCorbeille(cotisationId, session);

  await journaliser(session, {
    action: "tresorerie.cotisation.supprimer",
    entite: "Cotisation",
    entiteId: cotisationId,
    details: `${libelle} — mise à la corbeille`,
  });

  revalidatePath("/tresorerie/registres/cotisations");
  revalidatePath("/tresorerie/recus");
  revalidatePath("/rh/cotisations");
  revalidatePath("/documents");
  revalidatePath("/corbeille");
}
