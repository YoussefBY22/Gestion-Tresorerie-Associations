"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { MandatModel } from "@/modules/core/models";
import {
  ClientModel,
  ProjetModel,
  STATUTS_PROJET,
  TYPES_PROJET,
} from "@/modules/base/models";
import { FicheClientModel } from "@/modules/tresorerie/models";

/**
 * Affaires — le client et le projet, créés depuis la trésorerie.
 *
 * Dans l'ERP dont cette application est issue, un projet naissait d'une
 * opportunité commerciale gagnée, elle-même née d'un prospect : impossible
 * d'émettre une facture sans traverser deux modules que la trésorerie ne
 * possédait pas. Le trésorier d'une association se retrouvait donc avec un
 * écran de facturation qui ne proposait rien, et aucun moyen d'y remédier.
 *
 * Ici, **une affaire se crée en un geste** : le nom du client, le nom du
 * projet, le montant convenu. Le client entre au registre, le projet devient
 * facturable, et la fiche client est ouverte du même mouvement — c'est elle
 * qui porte l'adresse et le matricule fiscal qu'une facture doit mentionner.
 *
 * Trois règles tenues ici :
 *
 * - **Un client n'est pas créé deux fois.** Même organisation sur le même
 *   exercice, à la casse et aux espaces près, c'est le même client : deux
 *   fiches homonymes éparpilleraient ses factures et ses créances.
 * - **Le montant convenu reste facultatif.** Beaucoup d'affaires se chiffrent
 *   après coup. Un zéro saisi par défaut ferait croire à un reste à facturer
 *   nul, ce qui est faux et bloquant.
 * - **Rien n'est supprimé ici.** Un projet qui n'a pas lieu se met à `ANNULE` :
 *   ses factures et ses encaissements doivent rester lisibles.
 */

export type ResultatAffaire = { ok: boolean; message: string };

function rafraichir() {
  revalidatePath("/tresorerie/registres/clients");
  revalidatePath("/tresorerie/registres");
  revalidatePath("/tresorerie/registres/creances");
  revalidatePath("/tresorerie/factures");
  revalidatePath("/tresorerie");
}

const SchemaCreation = z.object({
  nomProjet: z.string().trim().min(2).max(160),
  /** Nouveau client, ou vide si l'on rattache à un client existant. */
  organisation: z.string().trim().max(160).optional(),
  clientId: z.string().trim().optional(),
  contact: z.string().trim().max(160).optional(),
  email: z.string().trim().max(160).optional(),
  telephone: z.string().trim().max(40).optional(),
  adresse: z.string().trim().max(300).optional(),
  matriculeFiscal: z.string().trim().max(50).optional(),
  type: z.enum(TYPES_PROJET).optional(),
  caSigne: z.coerce.number().min(0).optional(),
  finPrevue: z.string().trim().optional(),
  description: z.string().trim().max(1000).optional(),
});

function texte(formData: FormData, cle: string): string | undefined {
  const v = formData.get(cle);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export async function creerAffaire(
  formData: FormData
): Promise<ResultatAffaire> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");

  const donnees = SchemaCreation.safeParse({
    nomProjet: formData.get("nomProjet"),
    organisation: texte(formData, "organisation"),
    clientId: texte(formData, "clientId"),
    contact: texte(formData, "contact"),
    email: texte(formData, "email"),
    telephone: texte(formData, "telephone"),
    adresse: texte(formData, "adresse"),
    matriculeFiscal: texte(formData, "matriculeFiscal"),
    type: texte(formData, "type"),
    caSigne: texte(formData, "caSigne"),
    finPrevue: texte(formData, "finPrevue"),
    description: texte(formData, "description"),
  });

  if (!donnees.success) {
    return {
      ok: false,
      message:
        "Vérifiez la saisie : un nom de projet d'au moins 2 caractères, et un montant positif s'il est renseigné.",
    };
  }
  const d = donnees.data;

  if (!d.clientId && !d.organisation) {
    return {
      ok: false,
      message:
        "Indiquez le client : choisissez-en un dans la liste, ou saisissez le nom d'un nouveau.",
    };
  }

  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" })
    .select("_id annee")
    .lean();
  if (!mandat) {
    return {
      ok: false,
      message:
        "Aucun exercice actif : ouvrez-en un dans Administration › Exercices avant de créer une affaire.",
    };
  }

  /*
   * Le client, retrouvé ou créé. La recherche se fait sur le nom exact à la
   * casse près (`^…$` ancré, insensible) : un `contains` rapprocherait
   * « Société Alpha » et « Alpha », qui sont deux clients différents.
   */
  let clientId = d.clientId;
  let nomClient = "";
  let clientCree = false;

  if (clientId) {
    const existant = await ClientModel.findOne({
      _id: clientId,
      mandat: mandat._id,
    })
      .select("_id organisation")
      .lean();
    if (!existant) {
      return {
        ok: false,
        message: "Ce client n'existe pas sur l'exercice en cours.",
      };
    }
    nomClient = existant.organisation;
    // Les coordonnées saisies complètent la fiche du client existant, sans
    // écraser ce qui y est déjà : on ne vide pas un champ renseigné par
    // quelqu'un d'autre parce qu'on l'a laissé vide dans ce formulaire.
    const complements = Object.fromEntries(
      Object.entries({
        contact: d.contact,
        email: d.email,
        telephone: d.telephone,
        adresse: d.adresse,
        matriculeFiscal: d.matriculeFiscal,
      }).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(complements).length) {
      await ClientModel.updateOne({ _id: clientId }, { $set: complements });
    }
  } else {
    const organisation = d.organisation as string;
    const deja = await ClientModel.findOne({
      mandat: mandat._id,
      organisation: {
        $regex: `^${organisation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    })
      .select("_id organisation")
      .lean();

    if (deja) {
      clientId = String(deja._id);
      nomClient = deja.organisation;
    } else {
      const cree = await ClientModel.create({
        mandat: mandat._id,
        organisation,
        contact: d.contact,
        email: d.email,
        telephone: d.telephone,
        adresse: d.adresse,
        matriculeFiscal: d.matriculeFiscal,
      });
      clientId = String(cree._id);
      nomClient = cree.organisation;
      clientCree = true;
    }
  }

  /*
   * Deux projets de même nom pour le même client sur le même exercice : c'est
   * presque toujours un double clic ou une saisie en double. On le refuse en
   * le disant, plutôt que de laisser deux lignes jumelles au registre dont
   * personne ne saura plus laquelle facturer.
   */
  const doublon = await ProjetModel.exists({
    mandat: mandat._id,
    client: clientId,
    nom: d.nomProjet,
  });
  if (doublon) {
    return {
      ok: false,
      message: `« ${d.nomProjet} » existe déjà pour ${nomClient} sur cet exercice.`,
    };
  }

  const finPrevue = d.finPrevue ? new Date(d.finPrevue) : undefined;
  if (finPrevue && Number.isNaN(finPrevue.getTime())) {
    return { ok: false, message: "La date de fin prévue est illisible." };
  }

  const projet = await ProjetModel.create({
    mandat: mandat._id,
    nom: d.nomProjet,
    client: clientId,
    type: d.type ?? "PRESTATION",
    statut: "EN_COURS",
    caSigne: d.caSigne,
    description: d.description,
    finPrevue,
  });

  /*
   * La fiche client du projet est ouverte tout de suite, avec l'adresse et le
   * matricule fiscal : ce sont eux que l'émission d'une facture va chercher.
   * Les créer plus tard, c'est émettre une première facture avec ces champs
   * vides — et une facture tunisienne les exige.
   */
  await FicheClientModel.findOneAndUpdate(
    { projet: projet._id },
    {
      $setOnInsert: {
        mandat: mandat._id,
        projet: projet._id,
        contact: d.contact,
        email: d.email,
        telephone: d.telephone,
        adresse: d.adresse,
        matriculeFiscal: d.matriculeFiscal,
      },
    },
    { upsert: true }
  );

  await journaliser(session, {
    action: "tresorerie.affaire.creer",
    entite: "Projet",
    entiteId: String(projet._id),
    details: `${d.nomProjet} — ${nomClient}${
      d.caSigne ? ` — ${d.caSigne} DT HT convenus` : ""
    }${clientCree ? " (nouveau client)" : ""}`,
  });
  rafraichir();

  return {
    ok: true,
    message: clientCree
      ? `« ${d.nomProjet} » créé, et ${nomClient} ajouté au registre des clients. Le projet est facturable.`
      : `« ${d.nomProjet} » créé pour ${nomClient}. Le projet est facturable.`,
  };
}

const SchemaMaj = z.object({
  projetId: z.string().min(1),
  nomProjet: z.string().trim().min(2).max(160),
  statut: z.enum(STATUTS_PROJET),
  caSigne: z.coerce.number().min(0).optional(),
  finPrevue: z.string().trim().optional(),
});

/**
 * Corrige une affaire : son nom, son statut, le montant convenu.
 *
 * Le montant convenu se corrige ici, et c'est voulu : il n'y a plus de module
 * commercial pour le détenir, et un avenant signé doit pouvoir être reporté.
 * La correction est journalisée avec l'ancienne et la nouvelle valeur — c'est
 * ce qui permet de comprendre, six mois plus tard, pourquoi le reste à
 * facturer a changé.
 */
export async function majAffaire(
  formData: FormData
): Promise<ResultatAffaire> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");

  const donnees = SchemaMaj.safeParse({
    projetId: formData.get("projetId"),
    nomProjet: formData.get("nomProjet"),
    statut: formData.get("statut"),
    caSigne: texte(formData, "caSigne"),
    finPrevue: texte(formData, "finPrevue"),
  });
  if (!donnees.success) {
    return {
      ok: false,
      message: "Vérifiez la saisie : un nom, un statut connu, un montant positif.",
    };
  }
  const d = donnees.data;

  await connectDb();
  const mandat = await MandatModel.findOne({ statut: "ACTIF" })
    .select("_id")
    .lean();
  if (!mandat) return { ok: false, message: "Aucun exercice actif." };

  const projet = await ProjetModel.findOne({
    _id: d.projetId,
    mandat: mandat._id,
  });
  if (!projet) {
    return {
      ok: false,
      message: "Projet introuvable sur l'exercice en cours.",
    };
  }

  const finPrevue = d.finPrevue ? new Date(d.finPrevue) : undefined;
  if (finPrevue && Number.isNaN(finPrevue.getTime())) {
    return { ok: false, message: "La date de fin prévue est illisible." };
  }

  const avant = { nom: projet.nom, statut: projet.statut, caSigne: projet.caSigne };

  projet.nom = d.nomProjet;
  projet.statut = d.statut;
  // `undefined` laisse le montant tel quel ; le vider explicitement n'est pas
  // proposé, parce qu'un montant convenu qui disparaît ferait disparaître le
  // reste à facturer sans trace.
  if (d.caSigne !== undefined) projet.caSigne = d.caSigne;
  if (finPrevue) projet.finPrevue = finPrevue;
  await projet.save();

  const changements: string[] = [];
  if (avant.nom !== projet.nom) {
    changements.push(`nom « ${avant.nom} » → « ${projet.nom} »`);
  }
  if (avant.statut !== projet.statut) {
    changements.push(`statut ${avant.statut} → ${projet.statut}`);
  }
  if (avant.caSigne !== projet.caSigne) {
    changements.push(
      `montant convenu ${avant.caSigne ?? "non renseigné"} → ${projet.caSigne ?? "non renseigné"} DT HT`
    );
  }

  await journaliser(session, {
    action: "tresorerie.affaire.maj",
    entite: "Projet",
    entiteId: String(projet._id),
    details: changements.length
      ? `${projet.nom} : ${changements.join(" ; ")}`
      : projet.nom,
  });
  rafraichir();

  return {
    ok: true,
    message: changements.length
      ? `Affaire mise à jour : ${changements.join(" ; ")}.`
      : "Aucun changement à enregistrer.",
  };
}
