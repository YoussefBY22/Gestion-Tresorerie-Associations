import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La frontière client / serveur.
 *
 * Un fichier marqué `"use client"` est compilé **pour le navigateur**. S'il
 * importe, même indirectement, un fichier de modèle Mongoose, le bundler
 * tente d'embarquer l'ODM entier et la page tombe sur
 * `Can't resolve 'async_hooks'`.
 *
 * L'erreur est franche, mais elle n'apparaît qu'à l'ouverture de la page
 * concernée — donc souvent après la livraison, et jamais pendant les tests.
 * Elle est arrivée pour une raison anodine : un composant avait besoin du
 * libellé lisible d'un statut, et les libellés vivaient à côté de
 * l'énumération, dans le fichier du modèle.
 *
 * D'où ce test, et d'où `src/modules/base/constantes.ts` : les énumérations
 * et leurs libellés vivent dans des fichiers **sans Mongoose**, que les deux
 * côtés peuvent importer.
 */

const RACINE = join(process.cwd(), "src");

function fichiersSources(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiersSources(chemin));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

const SOURCES = fichiersSources(RACINE);

/** Le fichier déclare-t-il `"use client"` dans ses premières lignes ? */
function estClient(texte: string): boolean {
  const tete = texte.slice(0, 400);
  return /^\s*(["'])use client\1/m.test(tete);
}

/** Importe-t-il Mongoose, directement ou par un chemin de modèle ? */
function importeMongoose(texte: string): string[] {
  const coupables: string[] = [];
  for (const m of texte.matchAll(/from\s+["']([^"']+)["']/g)) {
    const source = m[1];
    if (source === "mongoose" || source.startsWith("mongoose/")) {
      coupables.push(source);
    } else if (/(^|\/)models(\/|$)/.test(source)) {
      // `@/modules/x/models`, `./models/Projet`, `../models` : tous mènent
      // à un schéma, donc à Mongoose.
      coupables.push(source);
    }
  }
  return coupables;
}

describe("frontière client / serveur", () => {
  it("trouve bien les sources du dépôt", () => {
    // Garde-fou : si ce nombre s'effondre, le test ne vérifie plus rien.
    expect(SOURCES.length).toBeGreaterThan(150);
  });

  it("ne laisse aucun composant client importer un modèle Mongoose", () => {
    const fautifs: string[] = [];

    for (const chemin of SOURCES) {
      const texte = readFileSync(chemin, "utf8");
      if (!estClient(texte)) continue;
      const coupables = importeMongoose(texte);
      if (coupables.length) {
        fautifs.push(`${relative(process.cwd(), chemin)} → ${coupables.join(", ")}`);
      }
    }

    expect(
      fautifs,
      "Composants client important un modèle Mongoose — la page tombera sur " +
        "« Can't resolve 'async_hooks' ». Déplacez l'énumération ou le " +
        "libellé dans un fichier de constantes sans Mongoose.\n" +
        fautifs.join("\n")
    ).toEqual([]);
  });

  it("garde les constantes du socle libres de Mongoose", () => {
    // C'est le fichier que les écrans importent : s'il tirait un modèle, il
    // ne servirait plus à rien.
    const texte = readFileSync(
      join(RACINE, "modules", "base", "constantes.ts"),
      "utf8"
    );
    expect(importeMongoose(texte)).toEqual([]);
  });
});
