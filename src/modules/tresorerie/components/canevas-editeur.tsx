"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlignLeft,
  Check,
  Loader2,
  Minus,
  Square,
  Table,
  Type,
} from "lucide-react";
import {
  avecFormat,
  blocsDansLeCadre,
  blocsHorsPage,
  cadreEntre,
  contraindre,
  formatDuCanevas,
  FORMATS_PAGE,
  deplacerDansLaPile,
  ENCADREMENT_DEFAUT,
  largeursColonnes,
  nomDuBloc,
  parPlan,
  planSuivant,
  STYLE_TEXTE_DEFAUT,
  type Bloc,
  type Canevas,
  type FormatPage,
  type Rectangle,
} from "@/modules/documents/services/canevas";
import {
  composerFlux,
  libelleElement,
  mesureApprochee,
  type ElementFlux,
} from "@/modules/documents/services/flux-document";
import {
  deposerImageModele,
  enregistrerCanevas,
} from "@/modules/tresorerie/actions/modeles-canevas";
import {
  Encart,
  PanneauProprietes,
} from "@/modules/tresorerie/components/canevas-proprietes";
import { Button } from "@/components/ui/button";

/**
 * Éditeur de canevas — on pose les blocs à la souris, ils restent où on les
 * laisse.
 *
 * Le canevas tout entier est tenu dans l'état du navigateur et enregistré
 * d'un bloc après une pause : déplacer une image ne peut pas demander un
 * aller-retour serveur par pixel parcouru.
 *
 * Les coordonnées sont en millimètres — ce que montre une règle, et ce que le
 * moteur de rendu attend. L'échelle qui les relie aux pixels de l'écran est
 * **mesurée** sur la page, jamais supposée : l'avoir déduite d'une unité CSS
 * avait donné un texte dix fois trop gros.
 *
 * Rien ici ne connaît la trésorerie : l'éditeur ne manipule que des blocs de
 * canevas, et sert donc tel quel à tout module qui aura des documents à
 * mettre en page.
 */

export type ImageModele = { fichierId: string; nom: string; type: "png" | "jpeg" };
export type Champ = { jeton: string; exemple: string };

const PAUSE_ENREGISTREMENT_MS = 800;
/** Pas d'aimantation, en millimètres : aligner à l'œil ne tient pas. */
const PAS = 0.5;

function aimanter(valeur: number): number {
  return Math.round(valeur / PAS) * PAS;
}

type Glissement = {
  mode: "deplacer" | "redimensionner";
  departX: number;
  departY: number;
  /** Position de départ de chaque bloc retenu, par identifiant. */
  origines: Map<string, Bloc>;
  /** Bloc redimensionné — un seul à la fois. */
  cible?: string;
};

type Lasso = { depart: { x: number; y: number }; cadre: Rectangle } | null;

export function CanevasEditeur({
  modeleId,
  famille,
  canevasInitial,
  images,
  champs,
  peutEcrire,
}: {
  modeleId: string;
  famille: string;
  canevasInitial: Canevas;
  images: ImageModele[];
  champs: Champ[];
  peutEcrire: boolean;
}) {
  const [canevas, setCanevas] = useState<Canevas>(canevasInitial);
  const [selection, setSelection] = useState<string[]>([]);
  const [lasso, setLasso] = useState<Lasso>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [pxParMm, setPxParMm] = useState(2.6);

  const page = useRef<HTMLDivElement>(null);
  const glissement = useRef<Glissement | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prochainId = useRef(0);

  const blocSeul =
    selection.length === 1
      ? (canevas.blocs.find((b) => b.id === selection[0]) ?? null)
      : null;

  /* ---------------------------------------------------------------- */
  /* Échelle et enregistrement                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const element = page.current;
    if (!element) return;
    const observateur = new ResizeObserver(([entree]) => {
      const largeurPx = entree.contentRect.width;
      if (largeurPx > 0) setPxParMm(largeurPx / canevas.largeur);
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [canevas.largeur]);

  const programmerEnregistrement = useCallback(
    (suivant: Canevas) => {
      if (!peutEcrire) return;
      if (minuterie.current) clearTimeout(minuterie.current);
      setEnregistre(false);
      minuterie.current = setTimeout(() => {
        demarrer(async () => {
          await enregistrerCanevas(modeleId, suivant);
          setEnregistre(true);
        });
      }, PAUSE_ENREGISTREMENT_MS);
    },
    [modeleId, peutEcrire]
  );

  const majCanevas = useCallback(
    (suivant: Canevas) => {
      setCanevas(suivant);
      programmerEnregistrement(suivant);
    },
    [programmerEnregistrement]
  );

  const majBlocs = useCallback(
    (transformer: (bloc: Bloc) => Bloc, ids: string[]) => {
      setCanevas((courant) => {
        const suivant: Canevas = {
          ...courant,
          blocs: courant.blocs.map((b) =>
            ids.includes(b.id) ? contraindre(transformer(b), courant) : b
          ),
        };
        programmerEnregistrement(suivant);
        return suivant;
      });
    },
    [programmerEnregistrement]
  );

  useEffect(() => {
    return () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    };
  }, []);

  useEffect(() => {
    if (!enregistre) return;
    const t = setTimeout(() => setEnregistre(false), 1800);
    return () => clearTimeout(t);
  }, [enregistre]);

  /* ---------------------------------------------------------------- */
  /* Souris : glissement et lasso                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    function bouger(evenement: PointerEvent) {
      const geste = glissement.current;
      if (geste) {
        const facteur = 1 / pxParMm;
        const dx = (evenement.clientX - geste.departX) * facteur;
        const dy = (evenement.clientY - geste.departY) * facteur;

        if (geste.mode === "deplacer") {
          // Tous les blocs retenus bougent du même écart : c'est ce qui rend
          // une sélection multiple utile plutôt que décorative.
          majBlocs(
            (b) => {
              const origine = geste.origines.get(b.id);
              return origine
                ? { ...b, x: aimanter(origine.x + dx), y: aimanter(origine.y + dy) }
                : b;
            },
            [...geste.origines.keys()]
          );
        } else if (geste.cible) {
          const origine = geste.origines.get(geste.cible);
          if (origine) {
            majBlocs(
              (b) => ({
                ...b,
                largeur: aimanter(Math.max(3, origine.largeur + dx)),
                hauteur: aimanter(Math.max(3, origine.hauteur + dy)),
              }),
              [geste.cible]
            );
          }
        }
        return;
      }

      setLasso((courant) => {
        if (!courant || !page.current) return courant;
        const cadrePage = page.current.getBoundingClientRect();
        const arrivee = {
          x: (evenement.clientX - cadrePage.left) / pxParMm,
          y: (evenement.clientY - cadrePage.top) / pxParMm,
        };
        return { ...courant, cadre: cadreEntre(courant.depart, arrivee) };
      });
    }

    function lacher() {
      glissement.current = null;
      setLasso((courant) => {
        // Un cadre minuscule est un clic, pas un lasso : on ne vide pas la
        // sélection pour un tremblement de souris.
        if (courant && (courant.cadre.largeur > 2 || courant.cadre.hauteur > 2)) {
          setSelection(blocsDansLeCadre(canevas.blocs, courant.cadre));
        }
        return null;
      });
    }

    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
    return () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
  }, [canevas.blocs, majBlocs, pxParMm]);

  function saisirBloc(
    evenement: React.PointerEvent,
    cible: Bloc,
    mode: Glissement["mode"]
  ) {
    if (!peutEcrire) return;
    evenement.preventDefault();
    evenement.stopPropagation();

    // Maj enfoncée : on ajoute ou retire de la sélection au lieu de la refaire.
    const retenus = evenement.shiftKey
      ? selection.includes(cible.id)
        ? selection.filter((id) => id !== cible.id)
        : [...selection, cible.id]
      : selection.includes(cible.id)
        ? selection
        : [cible.id];
    setSelection(retenus);

    glissement.current = {
      mode,
      departX: evenement.clientX,
      departY: evenement.clientY,
      cible: cible.id,
      origines: new Map(
        canevas.blocs.filter((b) => retenus.includes(b.id)).map((b) => [b.id, b])
      ),
    };
  }

  function commencerLasso(evenement: React.PointerEvent) {
    if (!peutEcrire || !page.current) return;
    const cadrePage = page.current.getBoundingClientRect();
    const depart = {
      x: (evenement.clientX - cadrePage.left) / pxParMm,
      y: (evenement.clientY - cadrePage.top) / pxParMm,
    };
    if (!evenement.shiftKey) setSelection([]);
    setLasso({ depart, cadre: { ...depart, largeur: 0, hauteur: 0 } });
  }

  /* ---------------------------------------------------------------- */
  /* Ajout de blocs                                                    */
  /* ---------------------------------------------------------------- */

  function identifiant(prefixe: string) {
    prochainId.current += 1;
    return `${prefixe}-${prochainId.current}-${modeleId.slice(-4)}`;
  }

  function ajouter(nouveau: Bloc) {
    majCanevas({
      ...canevas,
      blocs: [...canevas.blocs, contraindre(nouveau, canevas)],
    });
    setSelection([nouveau.id]);
  }

  function ajouterTexte(contenu: string, x = 20, y = 20) {
    ajouter({
      id: identifiant("txt"),
      type: "TEXTE",
      x,
      y,
      largeur: 60,
      hauteur: 10,
      plan: planSuivant(canevas.blocs),
      contenu,
      style: { ...STYLE_TEXTE_DEFAUT, alignementVertical: "milieu" },
      encadrement: { ...ENCADREMENT_DEFAUT },
      marge: 1.5,
    });
  }

  function deposerChamp(evenement: React.DragEvent) {
    evenement.preventDefault();
    const jeton = evenement.dataTransfer.getData("text/jeton");
    if (!jeton || !page.current) return;
    const cadre = page.current.getBoundingClientRect();
    ajouterTexte(
      `{{${jeton}}}`,
      aimanter((evenement.clientX - cadre.left) / pxParMm),
      aimanter((evenement.clientY - cadre.top) / pxParMm)
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[250px_1fr_300px]">
      {/* ------------------------------------------------ Palette --- */}
      <div className="space-y-4">
        <Encart titre="Ajouter">
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" disabled={!peutEcrire} onClick={() => ajouterTexte("Texte")}>
              <Type className="h-4 w-4" /> Texte
            </Button>
            <Button
              size="sm"
              disabled={!peutEcrire}
              onClick={() =>
                ajouter({
                  id: identifiant("apl"),
                  type: "RECTANGLE",
                  x: 20,
                  y: 20,
                  largeur: 60,
                  hauteur: 12,
                  plan: planSuivant(canevas.blocs),
                  encadrement: { ...ENCADREMENT_DEFAUT, fond: "#2c4a7c" },
                })
              }
            >
              <Square className="h-4 w-4" /> Aplat
            </Button>
            <Button
              size="sm"
              disabled={!peutEcrire}
              onClick={() =>
                ajouter({
                  id: identifiant("lig"),
                  type: "LIGNE",
                  x: 20,
                  y: 40,
                  largeur: 80,
                  hauteur: 4,
                  plan: planSuivant(canevas.blocs),
                  orientation: "horizontale",
                  couleur: "#15181d",
                  epaisseur: 0.4,
                })
              }
            >
              <Minus className="h-4 w-4" /> Trait
            </Button>
            <Button
              size="sm"
              disabled={!peutEcrire}
              onClick={() =>
                ajouter({
                  id: identifiant("tab"),
                  type: "TABLEAU",
                  x: 12,
                  y: 120,
                  largeur: 186,
                  hauteur: 40,
                  plan: planSuivant(canevas.blocs),
                  source: "",
                  lignesManuelles: [
                    ["", "", ""],
                    ["", "", ""],
                  ],
                  colonnes: [
                    { entete: "Colonne 1", part: 2, alignement: "gauche", champ: "" },
                    { entete: "Colonne 2", part: 1, alignement: "centre", champ: "" },
                    { entete: "Colonne 3", part: 1, alignement: "droite", champ: "" },
                  ],
                  hauteurEntete: 9,
                  hauteurLigne: 8,
                  styleEntete: {
                    ...STYLE_TEXTE_DEFAUT,
                    couleur: "#ffffff",
                    gras: true,
                    taille: 8.5,
                    alignementVertical: "milieu",
                  },
                  encadrementEntete: { ...ENCADREMENT_DEFAUT, fond: "#2c4a7c" },
                  styleCorps: {
                    ...STYLE_TEXTE_DEFAUT,
                    taille: 8.5,
                    alignementVertical: "milieu",
                  },
                  encadrementCorps: { ...ENCADREMENT_DEFAUT },
                  zebrure: "",
                  bordure: "#8e8e8e",
                  epaisseurBordure: 0.25,
                })
              }
            >
              <Table className="h-4 w-4" /> Tableau
            </Button>
            <Button
              size="sm"
              className="col-span-2"
              disabled={!peutEcrire}
              onClick={() =>
                ajouter({
                  id: identifiant("flx"),
                  type: "FLUX",
                  x: 15,
                  y: 30,
                  largeur: 180,
                  hauteur: 200,
                  plan: planSuivant(canevas.blocs),
                  nom: "Texte au fil",
                  elements: [
                    { type: "TITRE", niveau: 1, texte: "Titre du document" },
                    { type: "PARAGRAPHE", texte: "Premier paragraphe." },
                  ],
                  style: { ...STYLE_TEXTE_DEFAUT, taille: 10, interligne: 1.35 },
                  encadrement: { ...ENCADREMENT_DEFAUT },
                  marge: 0,
                  couleurTitre: "#2c4a7c",
                  fondEntete: "#15181d",
                  couleurEntete: "#ffffff",
                  bordureTableau: "#d9d9d9",
                })
              }
            >
              <AlignLeft className="h-4 w-4" /> Texte au fil
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            «&nbsp;Texte au fil&nbsp;» pour un procès-verbal ou un contrat :
            titres, paragraphes, listes et tableaux s&apos;y enchaînent, et
            c&apos;est le cadre seul qu&apos;on place.
          </p>
        </Encart>

        <Encart titre="Champs à glisser">
          <p className="mb-2 text-xs text-muted-foreground">
            Glissez un champ sur la page : il s&apos;y pose, et c&apos;est là
            qu&apos;il s&apos;imprimera. Pour un texte fixe, prenez « Texte » et
            tapez-le — il restera tel quel sur tous les documents.
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {champs.map((champ) => (
              <div
                key={champ.jeton}
                draggable={peutEcrire}
                onDragStart={(e) => e.dataTransfer.setData("text/jeton", champ.jeton)}
                onDoubleClick={() => ajouterTexte(`{{${champ.jeton}}}`)}
                title={`Exemple : ${champ.exemple}`}
                className="cursor-grab rounded border border-border px-2 py-1 text-xs hover:border-primary hover:bg-muted active:cursor-grabbing"
              >
                <span className="font-mono">{`{{${champ.jeton}}}`}</span>
                <span className="ml-1 text-muted-foreground">{champ.exemple}</span>
              </div>
            ))}
          </div>
        </Encart>

        <Encart titre="Images déposées">
          <div className="space-y-1">
            {images.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Déposez un logo, une signature ou un cachet, puis posez-le sur
                la page.
              </p>
            ) : (
              images.map((image) => (
                <button
                  key={image.fichierId}
                  type="button"
                  disabled={!peutEcrire}
                  onClick={() =>
                    ajouter({
                      id: identifiant("img"),
                      type: "IMAGE",
                      x: 20,
                      y: 20,
                      largeur: 35,
                      hauteur: 25,
                      plan: planSuivant(canevas.blocs),
                      nom: image.nom,
                      fichierId: image.fichierId,
                      nomFichier: image.nom,
                      ajustement: "contenir",
                      opacite: 1,
                    })
                  }
                  className="flex w-full items-center gap-2 rounded border border-border p-1 text-left text-xs hover:border-primary hover:bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/tresorerie/canevas/${modeleId}/image/${image.fichierId}`}
                    alt=""
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                  <span className="truncate">{image.nom}</span>
                </button>
              ))
            )}
          </div>
          {peutEcrire ? (
            <form
              action={async (donnees) => {
                donnees.set("modeleId", modeleId);
                await deposerImageModele(donnees);
              }}
              className="mt-2 space-y-1"
            >
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg"
                required
                aria-label="Image à déposer"
                className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              />
              <Button type="submit" size="sm" variant="ghost" className="h-7 w-full text-xs">
                Déposer l&apos;image
              </Button>
            </form>
          ) : null}
        </Encart>
      </div>

      {/* --------------------------------------------------- Page --- */}
      <div className="space-y-2">
        <div
          ref={page}
          onDragOver={(e) => e.preventDefault()}
          onDrop={deposerChamp}
          onPointerDown={commencerLasso}
          style={{ aspectRatio: `${canevas.largeur} / ${canevas.hauteur}` }}
          className="relative w-full select-none overflow-hidden rounded border border-border bg-white shadow-sm"
        >
          {parPlan(canevas.blocs).map((b) => (
            <BlocSurPage
              key={b.id}
              bloc={b}
              canevas={canevas}
              pxParMm={pxParMm}
              modeleId={modeleId}
              selectionne={selection.includes(b.id)}
              peutEcrire={peutEcrire}
              onSaisir={saisirBloc}
            />
          ))}

          {lasso ? (
            <div
              aria-hidden
              style={{
                left: `${(lasso.cadre.x / canevas.largeur) * 100}%`,
                top: `${(lasso.cadre.y / canevas.hauteur) * 100}%`,
                width: `${(lasso.cadre.largeur / canevas.largeur) * 100}%`,
                height: `${(lasso.cadre.hauteur / canevas.hauteur) * 100}%`,
              }}
              className="pointer-events-none absolute z-50 border border-primary bg-primary/15"
            />
          ) : null}
        </div>

        <FormatDeLaPage
          canevas={canevas}
          peutEcrire={peutEcrire}
          onChanger={(format) => majCanevas(avecFormat(canevas, format))}
        />

        <p aria-live="polite" className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground">
          {enCours ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Enregistrement…
            </>
          ) : enregistre ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Enregistré.
            </>
          ) : selection.length > 1 ? (
            `${selection.length} blocs retenus — ils se déplacent ensemble.`
          ) : (
            "Glissez les blocs. Maj + clic pour en retenir plusieurs, ou tracez un cadre sur la page."
          )}
        </p>

        <ApercuPdf modeleId={modeleId} famille={famille} canevas={canevas} />
      </div>

      {/* --------------------------------------- Propriétés + pile --- */}
      <div className="space-y-4">
        {blocSeul ? (
          <PanneauProprietes
            bloc={blocSeul}
            peutEcrire={peutEcrire}
            onChange={(ajouts) =>
              majBlocs((b) => ({ ...b, ...ajouts }) as Bloc, [blocSeul.id])
            }
            onRemplacer={(remplacant) => majBlocs(() => remplacant, [blocSeul.id])}
            onPile={(sens) =>
              majCanevas({
                ...canevas,
                blocs: deplacerDansLaPile(canevas.blocs, blocSeul.id, sens),
              })
            }
            onSupprimer={() => {
              majCanevas({
                ...canevas,
                blocs: canevas.blocs.filter((b) => b.id !== blocSeul.id),
              });
              setSelection([]);
            }}
          />
        ) : selection.length > 1 ? (
          <Encart titre={`${selection.length} blocs retenus`}>
            <p className="mb-2 text-xs text-muted-foreground">
              Déplacez-les ensemble à la souris. Les réglages s&apos;affichent
              quand un seul bloc est retenu.
            </p>
            <button
              type="button"
              disabled={!peutEcrire}
              onClick={() => {
                if (!window.confirm(`Supprimer ${selection.length} blocs de la page ?`)) return;
                majCanevas({
                  ...canevas,
                  blocs: canevas.blocs.filter((b) => !selection.includes(b.id)),
                });
                setSelection([]);
              }}
              className="h-8 w-full rounded border border-danger/40 text-xs text-danger hover:bg-danger/10"
            >
              Supprimer les blocs retenus
            </button>
          </Encart>
        ) : (
          <Encart titre="Propriétés">
            <p className="text-xs text-muted-foreground">
              Cliquez un bloc de la page pour le régler.
            </p>
          </Encart>
        )}

        <Encart titre={`Calques (${canevas.blocs.length})`}>
          <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
            {[...parPlan(canevas.blocs)].reverse().map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={(e) =>
                  setSelection((courant) =>
                    e.shiftKey
                      ? courant.includes(b.id)
                        ? courant.filter((id) => id !== b.id)
                        : [...courant, b.id]
                      : [b.id]
                  )
                }
                className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
                  selection.includes(b.id)
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted"
                } ${b.masque ? "opacity-50" : ""}`}
              >
                <span className="truncate">{nomDuBloc(b)}</span>
              </button>
            ))}
          </div>
        </Encart>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Un bloc tel qu'il se voit sur la page                               */
/* ------------------------------------------------------------------ */

function BlocSurPage({
  bloc,
  canevas,
  pxParMm,
  modeleId,
  selectionne,
  peutEcrire,
  onSaisir,
}: {
  bloc: Bloc;
  canevas: Canevas;
  pxParMm: number;
  modeleId: string;
  selectionne: boolean;
  peutEcrire: boolean;
  onSaisir: (e: React.PointerEvent, bloc: Bloc, mode: "deplacer" | "redimensionner") => void;
}) {
  const style: React.CSSProperties = {
    left: `${(bloc.x / canevas.largeur) * 100}%`,
    top: `${(bloc.y / canevas.hauteur) * 100}%`,
    width: `${(bloc.largeur / canevas.largeur) * 100}%`,
    height: `${(bloc.hauteur / canevas.hauteur) * 100}%`,
    zIndex: bloc.plan + 1,
    opacity: bloc.masque ? 0.25 : 1,
  };

  if (bloc.type === "TEXTE" || bloc.type === "RECTANGLE") {
    style.backgroundColor = bloc.encadrement.fond || undefined;
    if (bloc.encadrement.bordure && bloc.encadrement.epaisseurBordure > 0) {
      style.border = `${Math.max(1, bloc.encadrement.epaisseurBordure * pxParMm)}px solid ${bloc.encadrement.bordure}`;
    }
  }

  return (
    <div
      role="presentation"
      onPointerDown={(e) => onSaisir(e, bloc, "deplacer")}
      style={style}
      className={`absolute ${peutEcrire ? "cursor-move" : ""} ${
        selectionne ? "outline outline-2 outline-offset-1 outline-primary" : ""
      }`}
    >
      {bloc.type === "TEXTE" ? (
        <span
          style={{
            // Comme dans le PDF : une taille en points vaut 0,353 mm, qu'on
            // convertit avec l'échelle mesurée de la page.
            fontSize: `${bloc.style.taille * 0.3528 * pxParMm}px`,
            color: bloc.style.couleur,
            fontWeight: bloc.style.gras ? 700 : 400,
            fontStyle: bloc.style.italique ? "italic" : "normal",
            textAlign:
              bloc.style.alignement === "centre"
                ? "center"
                : bloc.style.alignement === "droite"
                  ? "right"
                  : "left",
            textTransform: bloc.style.majuscules ? "uppercase" : "none",
            lineHeight: bloc.style.interligne,
            padding: `${bloc.marge * pxParMm}px`,
          }}
          className={`pointer-events-none flex h-full w-full overflow-hidden whitespace-pre-wrap break-words ${
            bloc.style.alignementVertical === "milieu"
              ? "items-center"
              : bloc.style.alignementVertical === "bas"
                ? "items-end"
                : "items-start"
          } ${
            bloc.style.alignement === "centre"
              ? "justify-center"
              : bloc.style.alignement === "droite"
                ? "justify-end"
                : "justify-start"
          }`}
        >
          {bloc.contenu}
        </span>
      ) : null}

      {bloc.type === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/tresorerie/canevas/${modeleId}/image/${bloc.fichierId}`}
          alt={bloc.nomFichier}
          draggable={false}
          style={{
            objectFit: bloc.ajustement === "remplir" ? "fill" : "contain",
            opacity: bloc.opacite,
          }}
          className="pointer-events-none h-full w-full"
        />
      ) : null}

      {bloc.type === "LIGNE" ? (
        <span
          aria-hidden
          style={
            bloc.orientation === "horizontale"
              ? {
                  height: `${Math.max(1, bloc.epaisseur * pxParMm)}px`,
                  width: "100%",
                  backgroundColor: bloc.couleur,
                }
              : {
                  width: `${Math.max(1, bloc.epaisseur * pxParMm)}px`,
                  height: "100%",
                  backgroundColor: bloc.couleur,
                }
          }
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      ) : null}

      {bloc.type === "TABLEAU" ? <GrilleApercu bloc={bloc} pxParMm={pxParMm} /> : null}

      {bloc.type === "FLUX" ? <FluxApercu bloc={bloc} pxParMm={pxParMm} /> : null}

      {selectionne && peutEcrire ? (
        <span
          role="presentation"
          onPointerDown={(e) => onSaisir(e, bloc, "redimensionner")}
          title="Redimensionner"
          className="absolute -bottom-1 -right-1 z-10 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-primary"
        />
      ) : null}
    </div>
  );
}

/**
 * Le tableau tel qu'il sortira : colonnes réparties, en-tête, lignes, filets.
 * L'éditeur n'en montrait qu'un bandeau de couleur, ce qui ne permettait de
 * juger ni la largeur des colonnes ni la hauteur des lignes.
 */
function GrilleApercu({
  bloc,
  pxParMm,
}: {
  bloc: Extract<Bloc, { type: "TABLEAU" }>;
  pxParMm: number;
}) {
  const largeurs = largeursColonnes(bloc);
  // Un tableau nourri par les données n'a pas de contenu connu d'avance : on
  // montre une ligne d'exemple, qui suffit à juger la mise en page.
  const lignes = bloc.source ? [bloc.colonnes.map(() => "…")] : bloc.lignesManuelles;
  const place = Math.max(0, bloc.hauteur - bloc.hauteurEntete);
  const visibles = lignes.slice(
    0,
    Math.max(0, Math.floor(place / Math.max(1, bloc.hauteurLigne)))
  );
  const filet = bloc.bordure
    ? `${Math.max(1, bloc.epaisseurBordure * pxParMm)}px solid ${bloc.bordure}`
    : "none";

  return (
    <span className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden">
      {bloc.hauteurEntete > 0 ? (
        <span
          style={{ height: `${(bloc.hauteurEntete / bloc.hauteur) * 100}%` }}
          className="flex w-full shrink-0"
        >
          {bloc.colonnes.map((colonne, i) => (
            <span
              key={i}
              style={{
                width: `${(largeurs[i] / bloc.largeur) * 100}%`,
                backgroundColor: bloc.encadrementEntete.fond || undefined,
                color: bloc.styleEntete.couleur,
                fontSize: `${bloc.styleEntete.taille * 0.3528 * pxParMm}px`,
                fontWeight: bloc.styleEntete.gras ? 700 : 400,
                border: filet,
              }}
              className="flex items-center justify-center overflow-hidden px-0.5 text-center"
            >
              {colonne.entete}
            </span>
          ))}
        </span>
      ) : null}

      {visibles.map((ligne, rang) => (
        <span
          key={rang}
          style={{
            height: `${(bloc.hauteurLigne / bloc.hauteur) * 100}%`,
            backgroundColor:
              bloc.zebrure && rang % 2 === 1
                ? bloc.zebrure
                : bloc.encadrementCorps.fond || undefined,
          }}
          className="flex w-full shrink-0"
        >
          {bloc.colonnes.map((colonne, i) => (
            <span
              key={i}
              style={{
                width: `${(largeurs[i] / bloc.largeur) * 100}%`,
                color: bloc.styleCorps.couleur,
                fontSize: `${bloc.styleCorps.taille * 0.3528 * pxParMm}px`,
                border: filet,
                textAlign:
                  colonne.alignement === "centre"
                    ? "center"
                    : colonne.alignement === "droite"
                      ? "right"
                      : "left",
              }}
              className="flex items-center overflow-hidden px-0.5"
            >
              {ligne[i] ?? ""}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Le contenu au fil tel qu'il tombera, à l'échelle de l'écran.
 *
 * La composition est la même qu'au rendu PDF, avec un mesureur **approché** :
 * le navigateur n'a pas les métriques de la police embarquée. Les retours à
 * la ligne peuvent donc différer de quelques mots du document final — c'est
 * assez juste pour juger d'un débordement, et l'aperçu PDF juste à côté
 * donne la vérité.
 */
function FluxApercu({
  bloc,
  pxParMm,
}: {
  bloc: Extract<Bloc, { type: "FLUX" }>;
  pxParMm: number;
}) {
  const elements = bloc.elements as ElementFlux[];
  const { operations, elementsCoupes } = composerFlux(elements, {
    largeur: Math.max(1, bloc.largeur - bloc.marge * 2),
    hauteur: Math.max(1, bloc.hauteur - bloc.marge * 2),
    style: {
      corps: bloc.style,
      couleurTitre: bloc.couleurTitre || bloc.style.couleur,
      fondEntete: bloc.fondEntete,
      couleurEntete: bloc.couleurEntete || "#ffffff",
      bordureTableau: bloc.bordureTableau,
    },
    mesurer: mesureApprochee,
  });

  if (!elements.length) {
    return (
      <span
        style={{ fontSize: `${Math.max(6, 2.5 * pxParMm)}px` }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center border border-dashed border-primary/40 text-primary"
      >
        Texte au fil — ajoutez des éléments
      </span>
    );
  }

  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden">
      {operations.map((operation, index) => {
        const gauche = (bloc.marge + operation.x) * pxParMm;
        const haut = (bloc.marge + operation.y) * pxParMm;

        if (operation.type === "FILET") {
          return (
            <span
              key={index}
              style={{
                left: gauche,
                top: haut,
                width: operation.largeur * pxParMm,
                height: Math.max(1, 0.3 * pxParMm),
                backgroundColor: operation.couleur,
              }}
              className="absolute"
            />
          );
        }

        const commun: React.CSSProperties = {
          left: gauche,
          top: haut,
          width: operation.largeur * pxParMm,
          fontSize: `${operation.taille * 0.3528 * pxParMm}px`,
          color: operation.couleur,
          fontWeight: operation.gras ? 700 : 400,
          textAlign:
            operation.alignement === "centre"
              ? "center"
              : operation.alignement === "droite"
                ? "right"
                : "left",
        };

        if (operation.type === "CELLULE") {
          return (
            <span
              key={index}
              style={{
                ...commun,
                height: operation.hauteur * pxParMm,
                backgroundColor: operation.fond || undefined,
                border: operation.bordure
                  ? `1px solid ${operation.bordure}`
                  : undefined,
              }}
              className="absolute flex items-center overflow-hidden px-0.5"
            >
              {operation.texte}
            </span>
          );
        }

        return (
          <span
            key={index}
            style={{
              ...commun,
              fontStyle: operation.italique ? "italic" : "normal",
              whiteSpace: "nowrap",
            }}
            className="absolute overflow-hidden"
          >
            {operation.texte}
          </span>
        );
      })}

      {elementsCoupes > 0 ? (
        <span
          style={{ fontSize: `${Math.max(6, 2.2 * pxParMm)}px` }}
          className="absolute inset-x-0 bottom-0 bg-danger/80 px-1 text-center text-white"
        >
          {elementsCoupes} élément(s) ne tiennent pas —{" "}
          {libelleElement(elements[elements.length - 1])} en dernier
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Aperçu PDF du canevas en cours                                      */
/* ------------------------------------------------------------------ */

function ApercuPdf({
  modeleId,
  famille,
  canevas,
}: {
  modeleId: string;
  famille: string;
  canevas: Canevas;
}) {
  const [source, setSource] = useState<string | null>(null);
  const aLiberer = useRef<string | null>(null);
  const demande = JSON.stringify({ ...canevas, famille });

  useEffect(() => {
    const abandon = new AbortController();
    const minuterie = setTimeout(async () => {
      try {
        const reponse = await fetch(`/api/tresorerie/canevas/${modeleId}/apercu`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: demande,
          signal: abandon.signal,
        });
        if (!reponse.ok) return;
        const url = URL.createObjectURL(await reponse.blob());
        setSource((precedente) => {
          if (precedente) aLiberer.current = precedente;
          return url;
        });
      } catch {
        // Abandon volontaire ou aperçu indisponible : la page reste utilisable.
      }
    }, 400);

    return () => {
      clearTimeout(minuterie);
      abandon.abort();
    };
  }, [modeleId, demande]);

  useEffect(() => {
    if (!aLiberer.current) return;
    const url = aLiberer.current;
    aLiberer.current = null;
    const t = setTimeout(() => URL.revokeObjectURL(url), 1000);
    return () => clearTimeout(t);
  }, [source]);

  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Aperçu PDF
      </summary>
      {source ? (
        <iframe
          src={source}
          title="Aperçu PDF du modèle"
          className="h-[520px] w-full border-t border-border"
        />
      ) : (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          Fabrication de l&apos;aperçu…
        </p>
      )}
    </details>
  );
}

/**
 * Format de la page — portrait ou paysage.
 *
 * Un classeur de suivi est presque toujours plus large qu'un A4 portrait, et
 * l'import le signalait déjà (« la source est plus large qu'un A4 ») sans que
 * rien ne permette d'y remédier : le conseil renvoyait à une commande qui
 * n'existait pas.
 *
 * Rétrécir une page dont le contenu dépasse resserre ce contenu, ce qu'on
 * annonce avant plutôt que de le laisser découvrir.
 */
function FormatDeLaPage({
  canevas,
  peutEcrire,
  onChanger,
}: {
  canevas: Canevas;
  peutEcrire: boolean;
  onChanger: (format: FormatPage) => void;
}) {
  const actuel = formatDuCanevas(canevas);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Page</span>
      {(Object.keys(FORMATS_PAGE) as FormatPage[]).map((format) => {
        const choisi = format === actuel;
        const perdus = choisi ? 0 : blocsHorsPage(canevas, format);
        return (
          <button
            key={format}
            type="button"
            disabled={!peutEcrire || choisi}
            aria-pressed={choisi}
            title={
              perdus > 0
                ? `${perdus} bloc(s) dépassent de ce format et seront resserrés dans la page.`
                : FORMATS_PAGE[format].libelle
            }
            onClick={() => {
              if (
                perdus > 0 &&
                !window.confirm(
                  `Passer en ${FORMATS_PAGE[format].libelle} ?\n\n${perdus} bloc(s) n'y tiennent pas et seront resserrés dans la page. Vous pourrez revenir au format précédent, mais leurs dimensions, elles, ne se rétabliront pas.`
                )
              ) {
                return;
              }
              onChanger(format);
            }}
            className={`rounded border px-2 py-0.5 ${
              choisi
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            }`}
          >
            {FORMATS_PAGE[format].libelle}
            {perdus > 0 ? (
              <span className="ml-1 text-warning">· {perdus} à resserrer</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
