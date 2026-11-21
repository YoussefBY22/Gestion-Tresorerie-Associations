"use client";

import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import {
  deplacerElement,
  elementVide,
  itemsVersLignes,
  libelleElement,
  lignesVersItems,
  remplacerElement,
  retirerElement,
  tableauVersTexte,
  texteVersTableau,
  type ElementFlux,
} from "@/modules/documents/services/flux-document";
import type { Bloc } from "@/modules/documents/services/canevas";
import { Input } from "@/components/ui/input";

/**
 * Réglages d'un bloc au fil : la suite de ses éléments, et l'allure commune.
 *
 * Deux conventions de saisie, choisies pour qu'on puisse **coller** du
 * contenu venu d'ailleurs — c'est le geste le plus courant quand on reprend
 * un procès-verbal : une liste se tape une ligne par item, un tableau une
 * rangée par ligne avec les cellules séparées par `|`. Un champ par item ou
 * par cellule aurait encombré un panneau déjà étroit et interdit le
 * copier-coller.
 *
 * Les tableaux qui demandent un réglage cellule par cellule se font avec un
 * bloc tableau **posé**, qui a son propre éditeur.
 *
 * Rien ici ne connaît la trésorerie : réutilisable tel quel.
 */

const TYPES: { type: ElementFlux["type"]; libelle: string }[] = [
  { type: "TITRE", libelle: "Titre" },
  { type: "PARAGRAPHE", libelle: "Paragraphe" },
  { type: "LISTE", libelle: "Liste" },
  { type: "TABLEAU", libelle: "Tableau" },
  { type: "ESPACE", libelle: "Espace" },
  { type: "FILET", libelle: "Filet" },
];

export function ReglagesFlux({
  bloc,
  peutEcrire,
  onChange,
}: {
  bloc: Extract<Bloc, { type: "FLUX" }>;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
}) {
  const elements = bloc.elements as ElementFlux[];
  const majElements = (suivants: ElementFlux[]) =>
    onChange({ elements: suivants } as Partial<Bloc>);

  return (
    <div className="space-y-3 border-t border-border pt-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Contenu au fil ({elements.length})
      </p>
      <p className="text-xs text-muted-foreground">
        Les éléments s&apos;enchaînent dans le cadre. Ce qui ne tient pas
        n&apos;est pas dessiné — agrandissez le bloc ou réduisez la taille du
        texte.
      </p>

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {elements.map((element, index) => (
          <div key={index} className="rounded border border-border p-2">
            <div className="mb-1 flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {libelleElement(element)}
              </span>
              <Icone
                titre="Monter"
                disabled={!peutEcrire || index === 0}
                onClick={() => majElements(deplacerElement(elements, index, "haut"))}
              >
                <ChevronUp className="h-3 w-3" />
              </Icone>
              <Icone
                titre="Descendre"
                disabled={!peutEcrire || index === elements.length - 1}
                onClick={() => majElements(deplacerElement(elements, index, "bas"))}
              >
                <ChevronDown className="h-3 w-3" />
              </Icone>
              <Icone
                titre="Retirer cet élément"
                danger
                disabled={!peutEcrire}
                onClick={() => majElements(retirerElement(elements, index))}
              >
                <Minus className="h-3 w-3" />
              </Icone>
            </div>

            <ChampsElement
              element={element}
              peutEcrire={peutEcrire}
              onChange={(remplacant) =>
                majElements(remplacerElement(elements, index, remplacant))
              }
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {TYPES.map(({ type, libelle }) => (
          <button
            key={type}
            type="button"
            disabled={!peutEcrire}
            onClick={() => majElements([...elements, elementVide(type)])}
            className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs hover:bg-muted disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> {libelle}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2">
        <label className="block text-xs text-muted-foreground">
          Taille du corps
          <Input
            type="number"
            step={0.5}
            min={4}
            value={bloc.style.taille}
            disabled={!peutEcrire}
            onChange={(e) =>
              onChange({
                style: { ...bloc.style, taille: Number(e.target.value) },
              } as Partial<Bloc>)
            }
            className="mt-0.5 h-8 text-xs"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Interligne
          <Input
            type="number"
            step={0.05}
            min={0.9}
            value={bloc.style.interligne}
            disabled={!peutEcrire}
            onChange={(e) =>
              onChange({
                style: { ...bloc.style, interligne: Number(e.target.value) },
              } as Partial<Bloc>)
            }
            className="mt-0.5 h-8 text-xs"
          />
        </label>
        <Couleur
          label="Texte"
          valeur={bloc.style.couleur}
          disabled={!peutEcrire}
          onChange={(couleur) =>
            onChange({ style: { ...bloc.style, couleur } } as Partial<Bloc>)
          }
        />
        <Couleur
          label="Titres"
          valeur={bloc.couleurTitre}
          disabled={!peutEcrire}
          onChange={(couleurTitre) => onChange({ couleurTitre } as Partial<Bloc>)}
        />
        <Couleur
          label="Fond d'en-tête"
          valeur={bloc.fondEntete}
          disabled={!peutEcrire}
          onChange={(fondEntete) => onChange({ fondEntete } as Partial<Bloc>)}
        />
        <Couleur
          label="Filets de tableau"
          valeur={bloc.bordureTableau}
          disabled={!peutEcrire}
          onChange={(bordureTableau) => onChange({ bordureTableau } as Partial<Bloc>)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChampsElement({
  element,
  peutEcrire,
  onChange,
}: {
  element: ElementFlux;
  peutEcrire: boolean;
  onChange: (remplacant: ElementFlux) => void;
}) {
  if (element.type === "FILET") {
    return (
      <p className="text-xs text-muted-foreground">
        Trait de séparation sur toute la largeur.
      </p>
    );
  }

  if (element.type === "ESPACE") {
    return (
      <label className="block text-xs text-muted-foreground">
        Hauteur (mm)
        <Input
          type="number"
          step={0.5}
          min={0.5}
          value={element.hauteur}
          disabled={!peutEcrire}
          onChange={(e) =>
            onChange({ ...element, hauteur: Number(e.target.value) })
          }
          className="mt-0.5 h-8 text-xs"
        />
      </label>
    );
  }

  if (element.type === "TITRE") {
    return (
      <div className="space-y-1">
        <Input
          value={element.texte}
          disabled={!peutEcrire}
          placeholder="Intitulé du titre"
          onChange={(e) => onChange({ ...element, texte: e.target.value })}
          className="h-8 text-xs"
        />
        <label className="block text-xs text-muted-foreground">
          Niveau
          <select
            value={element.niveau}
            disabled={!peutEcrire}
            onChange={(e) =>
              onChange({ ...element, niveau: Number(e.target.value) as 1 | 2 | 3 })
            }
            className="mt-0.5 h-8 w-full rounded-md border border-border bg-card px-1 text-xs"
          >
            <option value={1}>1 — titre principal</option>
            <option value={2}>2 — section</option>
            <option value={3}>3 — sous-section</option>
          </select>
        </label>
      </div>
    );
  }

  if (element.type === "PARAGRAPHE") {
    return (
      <textarea
        value={element.texte}
        disabled={!peutEcrire}
        rows={3}
        placeholder="Texte du paragraphe — les champs {{…}} fonctionnent ici"
        onChange={(e) => onChange({ ...element, texte: e.target.value })}
        className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
      />
    );
  }

  if (element.type === "LISTE") {
    return (
      <div className="space-y-1">
        <textarea
          value={itemsVersLignes(element.items)}
          disabled={!peutEcrire}
          rows={3}
          placeholder={"Un item par ligne"}
          onChange={(e) =>
            onChange({ ...element, items: lignesVersItems(e.target.value) })
          }
          className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={element.ordonnee}
            disabled={!peutEcrire}
            onChange={(e) => onChange({ ...element, ordonnee: e.target.checked })}
            className="accent-primary"
          />
          Numérotée
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <textarea
        value={tableauVersTexte(element)}
        disabled={!peutEcrire}
        rows={4}
        placeholder={"Point | Décision\nBudget | Adopté"}
        onChange={(e) => onChange({ type: "TABLEAU", ...texteVersTableau(e.target.value) })}
        className="w-full rounded-md border border-border bg-card px-2 py-1 font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        Une rangée par ligne, cellules séparées par <span className="font-mono">|</span>.
        La première rangée sert d&apos;en-tête.
      </p>
    </div>
  );
}

function Icone({
  titre,
  children,
  onClick,
  disabled,
  danger,
}: {
  titre: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border disabled:opacity-40 ${
        danger ? "text-danger hover:bg-danger/10" : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Couleur({
  label,
  valeur,
  onChange,
  disabled,
}: {
  label: string;
  valeur: string;
  onChange: (valeur: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input
        type="color"
        value={valeur || "#15181d"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-8 w-full rounded border border-border bg-card"
      />
    </label>
  );
}
