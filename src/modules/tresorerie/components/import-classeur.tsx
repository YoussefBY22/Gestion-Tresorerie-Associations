"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import {
  importerClasseur,
  listerPartiesDuFichier,
  type FormatImport,
  type PartieDisponible,
  type ResultatImport,
} from "@/modules/tresorerie/actions/import-modele";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Import d'un modèle depuis un classeur Excel ou une présentation PowerPoint.
 *
 * Le fichier part d'abord **sans être importé** : on y lit la liste des
 * feuilles ou des diapositives et on la propose. Un classeur de la JE en
 * compte six dont deux sont des modèles — importer la première venue
 * produirait un document absurde.
 *
 * Depuis Google : « Fichier → Télécharger → Microsoft Excel », ou
 * « Microsoft PowerPoint ».
 */
export function ImportClasseur() {
  const [parties, setParties] = useState<PartieDisponible[] | null>(null);
  const [format, setFormat] = useState<FormatImport | null>(null);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function donneesCourantes(): FormData | null {
    const form = formulaire.current;
    return form ? new FormData(form) : null;
  }

  function examiner() {
    const donnees = donneesCourantes();
    if (!donnees) return;
    setErreur(null);
    setResultat(null);
    demarrer(async () => {
      try {
        const lu = await listerPartiesDuFichier(donnees);
        setFormat(lu.format);
        setParties(lu.parties);
      } catch (err) {
        setParties(null);
        setFormat(null);
        setErreur(err instanceof Error ? err.message : "Fichier illisible.");
      }
    });
  }

  function importer() {
    const donnees = donneesCourantes();
    if (!donnees) return;
    setErreur(null);
    demarrer(async () => {
      try {
        const fait = await importerClasseur(donnees);
        setResultat(fait);
        // La page liste les modèles : elle doit montrer le nouveau.
        router.refresh();
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Import impossible.");
      }
    });
  }

  return (
    <form ref={formulaire} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Déposez un <span className="font-mono">.xlsx</span>, un{" "}
        <span className="font-mono">.pptx</span> ou un{" "}
        <span className="font-mono">.docx</span> : l&apos;application en lit la mise en
        page et en fait un modèle que vous retouchez ensuite à la souris. Un
        classeur et une diapositive donnent des blocs posés au millimètre ; un
        document Word, qui n&apos;a pas de coordonnées, donne un bloc de texte
        au fil. Depuis Google : «&nbsp;Fichier → Télécharger&nbsp;» puis le
        format Microsoft correspondant.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <label className="block text-xs text-muted-foreground">
          Fichier
          <input
            type="file"
            name="classeur"
            accept=".xlsx,.pptx,.docx"
            required
            onChange={examiner}
            className="mt-1 w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Nom du modèle
          <Input
            name="nom"
            required
            minLength={2}
            placeholder="ex. Reçu de cotisation"
            className="mt-1 h-9"
          />
        </label>
      </div>

      {parties ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
          <label className="block text-xs text-muted-foreground">
            {format === "pptx"
              ? "Diapositive à importer"
              : format === "docx"
                ? "Contenu"
                : "Feuille à importer"}
            <select
              name="partie"
              className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
            >
              {parties.map((partie) => (
                <option key={partie.cle} value={partie.cle}>
                  {partie.libelle} ({partie.elements}{" "}
                  {format === "pptx"
                    ? "formes"
                    : format === "docx"
                      ? "éléments"
                      : "lignes"})
                </option>
              ))}
            </select>
          </label>

          {format === "pptx" ? (
            <label className="flex items-end gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="ajusterALaPage"
                defaultChecked
                className="mb-2.5 accent-primary"
              />
              <span className="mb-2">Ramener en A4</span>
            </label>
          ) : (
            <label className="block text-xs text-muted-foreground">
              Marge (mm)
              <Input
                name="marge"
                type="number"
                min={0}
                max={40}
                step={1}
                defaultValue={6}
                className="mt-1 h-9"
              />
            </label>
          )}

          <div className="flex items-end">
            <Button type="button" onClick={importer} disabled={enCours}>
              <Upload className="h-4 w-4" />
              {enCours ? "Import…" : "Importer"}
            </Button>
          </div>

          {format === "pptx" ? (
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Une diapositive fait souvent 254 × 143 mm : posée telle quelle
              sur un A4 portrait, elle déborderait à droite et laisserait le
              bas vide. « Ramener en A4 » la met à l&apos;échelle sans la
              déformer.
            </p>
          ) : null}
        </div>
      ) : null}

      {erreur ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger"
        >
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {erreur}
        </p>
      ) : null}

      {resultat ? (
        <div className="rounded-md border border-success/40 bg-success/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-success">
            <FileSpreadsheet size={14} aria-hidden />
            «&nbsp;{resultat.partie}&nbsp;» importée : {resultat.resume}.
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {"formulesIgnorees" in resultat.rapport &&
            resultat.rapport.formulesIgnorees > 0 ? (
              <li>
                {resultat.rapport.formulesIgnorees} cellule(s) de formule
                laissée(s) vides — leur valeur vient de l&apos;application, pas du
                classeur. Posez-y les champs voulus.
              </li>
            ) : null}
            {"tableaux" in resultat.rapport && resultat.rapport.tableaux > 0 ? (
              <li>
                {resultat.rapport.tableaux}{" "}
                tableau(x) repris avec leur contenu. Pour qu&apos;une grille se
                remplisse toute seule à l&apos;émission, donnez-lui sa source
                dans l&apos;éditeur.
              </li>
            ) : null}
            {"rotationsIgnorees" in resultat.rapport &&
            resultat.rapport.rotationsIgnorees > 0 ? (
              <li>
                {resultat.rapport.rotationsIgnorees} forme(s) pivotée(s) :
                la rotation n&apos;est pas reprise, elles sont posées droites.
              </li>
            ) : null}
            {"imagesIgnorees" in resultat.rapport &&
            resultat.rapport.imagesIgnorees > 0 ? (
              <li>
                {resultat.rapport.imagesIgnorees} image(s) laissée(s) de côté :
                un texte au fil n&apos;en place pas. Déposez-les et posez-les
                sur la page.
              </li>
            ) : null}
            {"stylesMelanges" in resultat.rapport &&
            resultat.rapport.stylesMelanges > 0 ? (
              <li>
                {resultat.rapport.stylesMelanges} forme(s) mêlaient plusieurs
                mises en forme : chacune a pris celle de son passage le plus
                long. Séparez-les en blocs si besoin.
              </li>
            ) : null}
            {"horsPage" in resultat.rapport && resultat.rapport.horsPage > 0 ? (
              <li className="text-warning">
                {resultat.rapport.horsPage} bloc(s) dépassent de la page :
                la source est plus large qu&apos;un A4. Resserrez-les ou
                élargissez la page.
              </li>
            ) : null}
            <li>
              Le texte d&apos;exemple est conservé tel quel : remplacez-le par
              les champs à glisser.
            </li>
          </ul>
          <a
            href={`/tresorerie/documentation/modeles/${resultat.modeleId}`}
            className="mt-2 inline-block font-medium text-primary hover:underline"
          >
            Ouvrir l&apos;éditeur →
          </a>
        </div>
      ) : null}
    </form>
  );
}
