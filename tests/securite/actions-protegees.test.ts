import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toute action serveur doit vérifier une permission.
 *
 * Une Server Action est un **point d'entrée réseau** : Next lui attribue un
 * identifiant et n'importe qui peut l'appeler, connecté ou non. Le fait qu'un
 * bouton ne soit affiché qu'aux ayants droit ne protège rien — la vérification
 * côté écran décide de l'affichage, pas de l'accès.
 *
 * Ce test lit le code plutôt que de l'exécuter : il garantit qu'aucune action
 * exportée n'oublie sa garde, y compris celles qui seront écrites demain.
 * C'est le seul test du dépôt qui protège d'une faute invisible à l'écran.
 */

const RACINE = join(process.cwd(), "src", "modules");

/**
 * Gardes acceptées.
 *
 * Le dépôt suit une convention : toute fonction qui exige un droit se nomme
 * `exiger…`. On s'appuie dessus plutôt que d'énumérer, pour qu'une garde
 * écrite demain soit reconnue sans toucher à ce test. S'y ajoutent les deux
 * formes qui ne suivent pas la convention.
 */
const GARDE_NOMMEE = /\bexiger[A-Z]\w*\s*\(/;
const GARDES = ["utilisateurRequis"];

/**
 * Session vérifiée « à la main ».
 *
 * Certaines actions ne relèvent d'aucun nomModule : lire ses propres
 * notifications, par exemple. Elles appellent `auth()` puis **refusent**
 * explicitement, et cantonnent leur requête aux données de l'appelant. Exiger
 * d'elles une permission de nomModule n'aurait pas de sens ; exiger qu'elles
 * refusent un visiteur, si.
 */
const SESSION_VERIFIEE = (corps: string) =>
  /\bauth\s*\(\s*\)/.test(corps) &&
  (/redirect\s*\(\s*["'`]\/login/.test(corps) || /\bthrow\b/.test(corps));

const estGarde = (corps: string) =>
  GARDE_NOMMEE.test(corps) ||
  GARDES.some((g) => corps.includes(g + "(")) ||
  SESSION_VERIFIEE(corps);

/**
 * Exceptions, nommées une par une et justifiées.
 *
 * Une liste vide serait plus belle ; une liste anonyme serait un trou. Toute
 * entrée ajoutée ici doit porter sa raison, et la raison doit tenir.
 */
const EXCEPTIONS: Record<string, string> = {
  definirTheme:
    "Préférence d'affichage stockée côté client ; aucune donnée métier n'est lue ni écrite.",
};

type Fonction = { nom: string; exportee: boolean; corps: string };
type Action = {
  nomModule: string;
  fichier: string;
  nom: string;
  corps: string;
  protegee: boolean;
  validee: boolean;
};

function fichiersDActions(): { nomModule: string; chemin: string }[] {
  const sortie: { nomModule: string; chemin: string }[] = [];
  for (const nomModule of readdirSync(RACINE)) {
    const dossier = join(RACINE, nomModule, "actions");
    try {
      if (!statSync(dossier).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const f of readdirSync(dossier)) {
      if (f.endsWith(".ts") && !f.endsWith(".test.ts")) {
        sortie.push({ nomModule, chemin: join(dossier, f) });
      }
    }
  }
  return sortie;
}

/**
 * Découpe un fichier en fonctions, exportées ou non, avec leur corps.
 *
 * Le corps court jusqu'à la fonction suivante : suffisant pour y chercher un
 * appel, et robuste aux accolades des chaînes de caractères, qu'un comptage
 * d'accolades confondrait avec du code.
 */
function fonctionsDuFichier(texte: string): Fonction[] {
  // Les helpers d'un fichier d'actions ne sont pas tous asynchrones : la
  // lecture d'un FormData, par exemple, est synchrone. Les ignorer ferait
  // passer pour non validées les actions qui délèguent leur parsing.
  const debuts = [
    ...texte.matchAll(
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/g
    ),
  ];
  return debuts.map((m, i) => {
    const debut = m.index ?? 0;
    return {
      nom: m[1],
      // Le mot-clé est dans la correspondance elle-même : la regex l'absorbe.
      exportee: m[0].startsWith("export"),
      corps: texte.slice(debut, debuts[i + 1]?.index ?? texte.length),
    };
  });
}

/**
 * Fonctions qui garantissent la permission, **helpers locaux compris**.
 *
 * Plusieurs modules passent par un garde local : la corbeille, par exemple,
 * vérifie le droit sur le nomModule de l'élément, qu'elle ne connaît qu'après
 * l'avoir chargé. Ne regarder que l'appel direct ferait passer ces actions
 * pour des trous. On remonte donc la chaîne d'appels jusqu'à stabilisation.
 */
function nomsQuiFont(
  texte: string,
  fait: (corps: string) => boolean
): Set<string> {
  const fonctions = fonctionsDuFichier(texte);
  const acquis = new Set<string>(
    fonctions.filter((f) => fait(f.corps)).map((f) => f.nom)
  );

  let bouge = true;
  while (bouge) {
    bouge = false;
    for (const f of fonctions) {
      if (acquis.has(f.nom)) continue;
      const appelle = [...acquis].some((p) =>
        new RegExp("\\b" + p + "\\s*\\(").test(f.corps)
      );
      if (appelle) {
        acquis.add(f.nom);
        bouge = true;
      }
    }
  }
  return acquis;
}

const nomsProteges = (texte: string) => nomsQuiFont(texte, estGarde);

/**
 * Validation des entrées, par quelque moyen que ce soit.
 *
 * La règle n'est pas « employer Zod » mais « vérifier avant d'atteindre la
 * base ». Le dépôt s'y prend de trois façons, toutes acceptables : un schéma
 * Zod, un contrôle de forme d'identifiant, ou un helper local qui fait l'un
 * ou l'autre — d'où la remontée de la chaîne d'appels.
 */
const nomsQuiValident = (texte: string) =>
  nomsQuiFont(texte, (corps) =>
    /\.(safeParse|parse)\s*\(/.test(corps) || /isValid\s*\(/.test(corps)
  );

function actionsDuFichier(nomModule: string, chemin: string): Action[] {
  const texte = readFileSync(chemin, "utf8");
  if (!texte.includes('"use server"') && !texte.includes("'use server'")) return [];

  const fichier = chemin.split(/[\\/]/).pop() as string;
  const proteges = nomsProteges(texte);
  const valident = nomsQuiValident(texte);
  return fonctionsDuFichier(texte)
    .filter((f) => f.exportee)
    .map((f) => ({
      nomModule,
      fichier,
      nom: f.nom,
      corps: f.corps,
      protegee: proteges.has(f.nom),
      validee: valident.has(f.nom),
    }));
}

const TOUTES = fichiersDActions().flatMap((f) => actionsDuFichier(f.nomModule, f.chemin));

describe("gardes des actions serveur", () => {
  it("trouve bien les actions du dépôt", () => {
    // Si ce nombre s'effondre, c'est le test qui est cassé, pas le code : il
    // cesserait alors de protéger quoi que ce soit, en silence.
    expect(TOUTES.length).toBeGreaterThan(100);
  });

  it("chaque action exportée vérifie une permission", () => {
    const sansGarde = TOUTES.filter(
      (a) => !a.protegee && !(a.nom in EXCEPTIONS)
    ).map((a) => `${a.nomModule}/${a.fichier} → ${a.nom}()`);

    expect(
      sansGarde,
      "Actions serveur sans contrôle de permission :\n" + sansGarde.join("\n")
    ).toEqual([]);
  });

  it("n'autorise aucune exception non justifiée", () => {
    for (const [nom, raison] of Object.entries(EXCEPTIONS)) {
      expect(
        raison.length,
        `L'exception « ${nom} » doit porter sa raison.`
      ).toBeGreaterThan(40);
    }
  });

  it("ne garde aucune exception devenue inutile", () => {
    // Une exception qui ne correspond plus à aucune action est un reste : elle
    // dispenserait de garde une future action qui porterait le même nom.
    const noms = new Set(TOUTES.map((a) => a.nom));
    const orphelines = Object.keys(EXCEPTIONS).filter((n) => !noms.has(n));
    expect(orphelines, "Exceptions sans action correspondante").toEqual([]);
  });
});

describe("traçabilité des écritures", () => {
  it("chaque fichier d'actions qui écrit en base journalise", () => {
    /*
     * « Toute création, modification ou suppression est horodatée et
     * attribuée » — exigence non fonctionnelle du cahier des charges, et
     * condition d'auditabilité : sans journal, l'ERP ne sait pas répondre à
     * « qui a modifié ce montant ».
     *
     * Le contrôle est au fichier et non à l'action : plusieurs actions
     * délèguent l'écriture à un service qui journalise pour elles, et
     * exiger l'appel dans chaque fonction produirait des faux positifs.
     */
    /**
     * Exceptions : des écritures qui ne sont pas des actes de gestion.
     * Journaliser « a lu sa notification » noierait la piste d'audit sous du
     * bruit, et c'est elle qu'on vient consulter quand un chiffre a bougé.
     */
    const HORS_JOURNAL = ["notifications.ts"];

    const ecrit = /\.(create|insertMany|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|save)\s*\(/;
    const sansJournal = fichiersDActions()
      .filter(({ chemin }) => !HORS_JOURNAL.some((f) => chemin.endsWith(f)))
      .filter(({ chemin }) => {
        const texte = readFileSync(chemin, "utf8");
        return ecrit.test(texte) && !texte.includes("journaliser");
      })
      .map(({ nomModule, chemin }) => `${nomModule}/${chemin.split(/[\\/]/).pop()}`);

    expect(
      sansJournal,
      "Fichiers d'actions qui écrivent sans journaliser :\n" +
        sansJournal.join("\n")
    ).toEqual([]);
  });
});
