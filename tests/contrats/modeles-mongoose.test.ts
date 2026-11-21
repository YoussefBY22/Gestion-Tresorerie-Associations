import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrats des modèles de données.
 *
 * Ces règles ne vivent nulle part dans le code : elles sont tenues par
 * discipline, et une discipline non vérifiée se perd au mandat suivant.
 *
 * **Le cloisonnement par mandat.** Une entité rattachée à rien se retrouve
 * dans les écrans du mandat suivant : le nouveau bureau hérite des dons et des
 * factures de l'ancien, et les totaux deviennent faux. Le rattachement peut
 * être direct (champ `mandat`) ou **transitif** : une tâche appartient à un
 * projet, qui porte le mandat.
 *
 * **L'unicité des collections.** Deux modèles pointant la même collection
 * écrivent l'un sur l'autre, en silence.
 */

const RACINE = join(process.cwd(), "src", "modules");

type Modele = {
  nomModule: string;
  nom: string;
  collection: string;
  /** Déclaration de ce schéma, et d'elle seule : champs et options. */
  tranche: string;
};

/**
 * Modèles qui ne relèvent d'aucun mandat, et pourquoi.
 *
 * Ce sont les données qui traversent les mandats : les comptes, les
 * référentiels partagés, les compteurs.
 */
const SANS_MANDAT: Record<string, string> = {
  Utilisateur: "Un compte survit aux mandats ; c'est le membre qui en relève.",
  Mandat: "C'est le mandat lui-même.",
  Sequence: "Compteur de numérotation : il porte le mandat dans sa clé.",
  Notification: "Adressée à une personne, pas à un mandat.",
  CharteDocument: "Identité visuelle de la structure, valable d'un mandat à l'autre.",
  ModeleDocument: "Mise en page réutilisée par les mandats suivants.",
  Parametre: "Réglage de l'application : hors mandat par construction.",
  TypeRecu: "Famille de pièces, réutilisée d'un mandat à l'autre.",
  JournalActivite: "Piste d'audit horodatée, conservée en continu.",
  Fournisseur: "Carnet d'adresses : un fournisseur sert plusieurs mandats, son nom est unique.",
  KPIHistorique: "Table comparative pluriannuelle : elle porte le mandat en texte, y compris pour les mandats antérieurs à l'ERP.",
  ObligationFiscale: "Calendrier fiscal de référence (TVA, IS, RAS) : il ne dépend pas du mandat.",
};

/**
 * Modèles qui s'horodatent autrement, et pourquoi.
 */
const SANS_TIMESTAMPS: Record<string, string> = {
  JournalActivite: "Porte son propre champ `horodatage`, indexé : c'est lui la date qui fait foi.",
};

/** Extrait la déclaration d'un schéma : du `new Schema` au suivant. */
function trancheDuSchema(texte: string, nomSchema: string): string {
  const depart = texte.indexOf("const " + nomSchema + " = new Schema");
  if (depart < 0) return "";
  const suite = texte.slice(depart + 10);
  const fins = [
    suite.search(/\nconst \w+Schema = new Schema/),
    suite.search(/\nexport const \w+Model/),
    suite.search(/\n\w+Schema\.index/),
  ].filter((n) => n >= 0);
  const fin = fins.length ? Math.min(...fins) : suite.length;
  return suite.slice(0, fin);
}

function modeles(): Modele[] {
  const sortie: Modele[] = [];
  for (const nomModule of readdirSync(RACINE)) {
    const dossier = join(RACINE, nomModule, "models");
    try {
      if (!statSync(dossier).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const fichier of readdirSync(dossier)) {
      if (!fichier.endsWith(".ts") || fichier === "index.ts") continue;
      const texte = readFileSync(join(dossier, fichier), "utf8");
      // Un fichier porte souvent plusieurs modèles : chacun est rapporté à
      // son propre schéma, sinon tous hériteraient du premier.
      for (const m of texte.matchAll(
        /mongoose\.model<[^>]*>\(\s*"([^"]+)"\s*,\s*(\w+)/g
      )) {
        const tranche = trancheDuSchema(texte, m[2]);
        const col = tranche.match(/collection:\s*"([^"]+)"/);
        sortie.push({
          nomModule,
          nom: m[1],
          collection: col ? col[1] : "",
          tranche,
        });
      }
    }
  }
  return sortie;
}

const MODELES = modeles();

describe("inventaire des modèles", () => {
  it("trouve les modèles du dépôt", () => {
    // Garde-fou : si ce nombre s'effondre, le test ne vérifie plus rien.
    // Il est volontairement sous le compte réel — c'est un plancher, pas un
    // inventaire à maintenir à chaque modèle ajouté.
    expect(MODELES.length).toBeGreaterThan(30);
  });

  it("nomme chaque modèle une seule fois", () => {
    // Mongoose indexe ses modèles par nom : deux homonymes, et le second
    // écrase le premier au chargement.
    const noms = MODELES.map((m) => m.nom);
    const doublons = [...new Set(noms.filter((n, i) => noms.indexOf(n) !== i))];
    expect(doublons).toEqual([]);
  });

  it("donne à chaque modèle sa propre collection", () => {
    const cols = MODELES.map((m) => m.collection).filter(Boolean);
    const doublons = [...new Set(cols.filter((c, i) => cols.indexOf(c) !== i))];
    expect(doublons, "Collections partagées par deux modèles").toEqual([]);
  });

  it("nomme explicitement la collection de chaque modèle", () => {
    // Sans `collection`, Mongoose pluralise le nom à sa façon : renommer le
    // modèle déplacerait silencieusement les données.
    const sans = MODELES.filter((m) => !m.collection).map(
      (m) => `${m.nomModule}/${m.nom}`
    );
    expect(sans).toEqual([]);
  });
});

describe("cloisonnement par mandat", () => {
  it("rattache chaque entité à son mandat, directement ou par son parent", () => {
    const orphelins = MODELES.filter(
      (m) =>
        !(m.nom in SANS_MANDAT) &&
        !/\bmandat\s*:/.test(m.tranche) &&
        !/\bref:\s*"/.test(m.tranche)
    ).map((m) => `${m.nomModule}/${m.nom}`);

    expect(
      orphelins,
      "Modèles rattachés à rien : ils se retrouveront dans les écrans du " +
        "mandat suivant.\n" + orphelins.join("\n")
    ).toEqual([]);
  });

  it("justifie chaque exception au cloisonnement", () => {
    for (const [nom, raison] of Object.entries(SANS_MANDAT)) {
      expect(
        raison.length,
        `L'exception « ${nom} » doit porter sa raison.`
      ).toBeGreaterThan(20);
    }
  });

  it("ne garde aucune exception devenue inutile", () => {
    const noms = new Set(MODELES.map((m) => m.nom));
    const orphelines = Object.keys(SANS_MANDAT).filter((n) => !noms.has(n));
    expect(orphelines, "Exceptions sans modèle correspondant").toEqual([]);
  });
});

describe("traçabilité", () => {
  it("horodate chaque modèle", () => {
    // « Toute création ou modification est horodatée » : sans `timestamps`,
    // on ne sait plus dire quand une ligne a été écrite.
    const sans = MODELES.filter(
      (m) =>
        !m.tranche.includes("timestamps: true") && !(m.nom in SANS_TIMESTAMPS)
    ).map((m) => `${m.nomModule}/${m.nom}`);
    expect(sans).toEqual([]);
  });
});
