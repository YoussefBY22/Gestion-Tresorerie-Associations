import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COULEUR_PRIMAIRE_DEFAUT,
  couleurValide,
} from "../../src/modules/core/apparence";

/**
 * L'identité visuelle ne tient qu'à une valeur.
 *
 * La couleur de la structure se règle dans Administration › Paramétrage, et
 * trois sorties la portent : l'interface (`--primary-base` dans
 * `globals.css`), les documents PDF (charte de repli) et les e-mails.
 *
 * Le repli, lui, est écrit deux fois : une fois en TypeScript, parce que les
 * services en ont besoin, et une fois en CSS, parce que la feuille de style
 * doit pouvoir rendre une page même servie sans paramétrage. Deux écritures,
 * donc deux valeurs qui peuvent diverger — et le symptôme serait un écran
 * d'une couleur et un reçu d'une autre, ce que personne ne pense à vérifier.
 */

const RACINE = join(process.cwd(), "src");
const CSS = readFileSync(join(RACINE, "app", "globals.css"), "utf8");

describe("couleur de la structure", () => {
  it("écrit la même valeur par défaut en CSS et en TypeScript", () => {
    const m = CSS.match(/--primary-base:\s*(#[0-9a-fA-F]{3,6})\s*;/);
    expect(m, "`--primary-base` doit être défini sur `:root`").not.toBeNull();
    expect(m![1].toLowerCase()).toBe(COULEUR_PRIMAIRE_DEFAUT.toLowerCase());
  });

  it("dérive les deux thèmes de cette seule valeur", () => {
    /*
     * Si un thème posait sa propre couleur en dur, la couleur choisie par la
     * structure ne s'appliquerait qu'à l'autre thème — et le défaut
     * n'apparaîtrait qu'à ceux qui ont basculé.
     */
    const blocsSombres = CSS.split(/:root\[data-theme="sombre"\]|prefers-color-scheme: dark/)
      .slice(1)
      .join("\n");
    const primaireEnDur = blocsSombres.match(
      /--primary(-hover)?:\s*#[0-9a-fA-F]{3,6}\s*;/g
    );
    expect(
      primaireEnDur,
      "Le thème sombre doit dériver `--primary-base`, pas poser sa propre couleur :\n" +
        (primaireEnDur ?? []).join("\n")
    ).toBeNull();
  });

  it("n'accepte qu'une couleur hexadécimale", () => {
    expect(couleurValide("#2C4A7C")).toBe("#2c4a7c");
    expect(couleurValide("2c4a7c")).toBe("#2c4a7c");
    expect(couleurValide("  #abc  ")).toBe("#abc");
    // Ce qu'une variable CSS avalerait sans broncher, en rendant la page
    // terne sans rien signaler.
    expect(couleurValide("red")).toBeNull();
    expect(couleurValide("rgb(1,2,3)")).toBeNull();
    expect(couleurValide("#12345")).toBeNull();
    expect(couleurValide("")).toBeNull();
    expect(couleurValide(undefined)).toBeNull();
  });
});
