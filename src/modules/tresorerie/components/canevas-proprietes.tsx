"use client";

import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Minus,
  Trash2,
} from "lucide-react";
import {
  ajouterColonne,
  ajouterLigne,
  majCellule,
  nomDuBloc,
  supprimerColonne,
  supprimerLigne,
  type Bloc,
  type BlocTableau,
} from "@/modules/documents/services/canevas";
import { ReglagesFlux } from "@/modules/tresorerie/components/canevas-flux";
import { Input } from "@/components/ui/input";

/**
 * Réglages du bloc sélectionné.
 *
 * Sorti de l'éditeur pour ne pas en faire un fichier illisible : la page et
 * ses gestes d'un côté, ce qu'on règle sur un bloc de l'autre.
 *
 * Le panneau est **commun à tous les modules** : il ne connaît que des blocs
 * de canevas, jamais une famille de document ni la trésorerie.
 */

export function PanneauProprietes({
  bloc,
  peutEcrire,
  onChange,
  onRemplacer,
  onPile,
  onSupprimer,
}: {
  bloc: Bloc;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
  /** Remplace le bloc entier — nécessaire aux opérations sur un tableau. */
  onRemplacer: (bloc: Bloc) => void;
  onPile: (sens: "avancer" | "reculer") => void;
  onSupprimer: () => void;
}) {
  const nombre = (
    cle: "x" | "y" | "largeur" | "hauteur",
    libelle: string
  ) => (
    <label className="block text-xs text-muted-foreground">
      {libelle}
      <Input
        type="number"
        step={0.5}
        value={bloc[cle]}
        disabled={!peutEcrire}
        onChange={(e) => onChange({ [cle]: Number(e.target.value) } as Partial<Bloc>)}
        className="mt-0.5 h-8 text-xs"
      />
    </label>
  );

  return (
    <Encart titre={nomDuBloc(bloc)}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {nombre("x", "X (mm)")}
          {nombre("y", "Y (mm)")}
          {nombre("largeur", "Largeur")}
          {nombre("hauteur", "Hauteur")}
        </div>

        <label className="block text-xs text-muted-foreground">
          Nom du calque
          <Input
            value={bloc.nom ?? ""}
            disabled={!peutEcrire}
            placeholder={nomDuBloc(bloc)}
            onChange={(e) => onChange({ nom: e.target.value } as Partial<Bloc>)}
            className="mt-0.5 h-8 text-xs"
          />
        </label>

        {bloc.type === "TEXTE" ? (
          <ReglagesTexte bloc={bloc} peutEcrire={peutEcrire} onChange={onChange} />
        ) : null}

        {bloc.type === "LIGNE" ? (
          <ReglagesLigne bloc={bloc} peutEcrire={peutEcrire} onChange={onChange} />
        ) : null}

        {bloc.type === "IMAGE" ? (
          <ReglagesImage bloc={bloc} peutEcrire={peutEcrire} onChange={onChange} />
        ) : null}

        {bloc.type === "TEXTE" ||
        bloc.type === "RECTANGLE" ||
        bloc.type === "FLUX" ? (
          <ReglagesEncadrement bloc={bloc} peutEcrire={peutEcrire} onChange={onChange} />
        ) : null}

        {bloc.type === "FLUX" ? (
          <ReglagesFlux bloc={bloc} peutEcrire={peutEcrire} onChange={onChange} />
        ) : null}

        {bloc.type === "TABLEAU" ? (
          <ReglagesTableau
            bloc={bloc}
            peutEcrire={peutEcrire}
            onChange={onChange}
            onRemplacer={onRemplacer}
          />
        ) : null}

        <div className="flex items-center gap-1 border-t border-border pt-2">
          <Icone titre="Avancer d'un plan" disabled={!peutEcrire} onClick={() => onPile("avancer")}>
            <ChevronUp className="h-3.5 w-3.5" />
          </Icone>
          <Icone titre="Reculer d'un plan" disabled={!peutEcrire} onClick={() => onPile("reculer")}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Icone>
          <Icone
            titre={bloc.masque ? "Afficher" : "Masquer"}
            disabled={!peutEcrire}
            onClick={() => onChange({ masque: !bloc.masque } as Partial<Bloc>)}
          >
            {bloc.masque ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Icone>
          <Icone
            titre="Supprimer ce bloc"
            danger
            disabled={!peutEcrire}
            onClick={() => {
              if (window.confirm(`Supprimer « ${nomDuBloc(bloc)} » de la page ?`)) {
                onSupprimer();
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Icone>
        </div>
      </div>
    </Encart>
  );
}

/* ------------------------------------------------------------------ */

function ReglagesTexte({
  bloc,
  peutEcrire,
  onChange,
}: {
  bloc: Extract<Bloc, { type: "TEXTE" }>;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
}) {
  const majStyle = (ajouts: Partial<(typeof bloc)["style"]>) =>
    onChange({ style: { ...bloc.style, ...ajouts } } as Partial<Bloc>);

  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">
        Contenu — tapez librement, ou posez un champ {"{{…}}"}
        <textarea
          value={bloc.contenu}
          disabled={!peutEcrire}
          onChange={(e) => onChange({ contenu: e.target.value } as Partial<Bloc>)}
          rows={3}
          className="mt-0.5 w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs text-muted-foreground">
          Taille
          <Input
            type="number"
            step={0.5}
            min={4}
            value={bloc.style.taille}
            disabled={!peutEcrire}
            onChange={(e) => majStyle({ taille: Number(e.target.value) })}
            className="mt-0.5 h-8 text-xs"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Interligne
          <Input
            type="number"
            step={0.1}
            min={0.8}
            value={bloc.style.interligne}
            disabled={!peutEcrire}
            onChange={(e) => majStyle({ interligne: Number(e.target.value) })}
            className="mt-0.5 h-8 text-xs"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Couleur
          <input
            type="color"
            value={bloc.style.couleur}
            disabled={!peutEcrire}
            onChange={(e) => majStyle({ couleur: e.target.value })}
            className="mt-0.5 h-8 w-full rounded border border-border bg-card"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {([["gras", "G"], ["italique", "I"], ["majuscules", "AA"]] as const).map(
          ([cle, libelle]) => (
            <Bascule
              key={cle}
              actif={bloc.style[cle]}
              disabled={!peutEcrire}
              onClick={() => majStyle({ [cle]: !bloc.style[cle] })}
            >
              {libelle}
            </Bascule>
          )
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Choix
          libelle="Alignement"
          valeurs={["gauche", "centre", "droite"] as const}
          actif={bloc.style.alignement}
          disabled={!peutEcrire}
          onChange={(v) => majStyle({ alignement: v })}
        />
        <Choix
          libelle="Vertical"
          valeurs={["haut", "milieu", "bas"] as const}
          actif={bloc.style.alignementVertical}
          disabled={!peutEcrire}
          onChange={(v) => majStyle({ alignementVertical: v })}
        />
      </div>
      <label className="block text-xs text-muted-foreground">
        Marge intérieure (mm)
        <Input
          type="number"
          step={0.5}
          min={0}
          value={bloc.marge}
          disabled={!peutEcrire}
          onChange={(e) => onChange({ marge: Number(e.target.value) } as Partial<Bloc>)}
          className="mt-0.5 h-8 text-xs"
        />
      </label>
    </div>
  );
}

function ReglagesLigne({
  bloc,
  peutEcrire,
  onChange,
}: {
  bloc: Extract<Bloc, { type: "LIGNE" }>;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Choix
        libelle="Orientation"
        valeurs={["horizontale", "verticale"] as const}
        actif={bloc.orientation}
        disabled={!peutEcrire}
        onChange={(v) => onChange({ orientation: v } as Partial<Bloc>)}
      />
      <label className="block text-xs text-muted-foreground">
        Épaisseur (mm)
        <Input
          type="number"
          step={0.1}
          min={0.1}
          value={bloc.epaisseur}
          disabled={!peutEcrire}
          onChange={(e) => onChange({ epaisseur: Number(e.target.value) } as Partial<Bloc>)}
          className="mt-0.5 h-8 text-xs"
        />
      </label>
      <label className="col-span-2 block text-xs text-muted-foreground">
        Couleur
        <input
          type="color"
          value={bloc.couleur}
          disabled={!peutEcrire}
          onChange={(e) => onChange({ couleur: e.target.value } as Partial<Bloc>)}
          className="mt-0.5 h-8 w-full rounded border border-border bg-card"
        />
      </label>
    </div>
  );
}

function ReglagesImage({
  bloc,
  peutEcrire,
  onChange,
}: {
  bloc: Extract<Bloc, { type: "IMAGE" }>;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Choix
        libelle="Ajustement"
        valeurs={["contenir", "remplir"] as const}
        actif={bloc.ajustement}
        disabled={!peutEcrire}
        onChange={(v) => onChange({ ajustement: v } as Partial<Bloc>)}
      />
      <label className="block text-xs text-muted-foreground">
        Opacité
        <Input
          type="number"
          step={0.05}
          min={0}
          max={1}
          value={bloc.opacite}
          disabled={!peutEcrire}
          onChange={(e) => onChange({ opacite: Number(e.target.value) } as Partial<Bloc>)}
          className="mt-0.5 h-8 text-xs"
        />
      </label>
    </div>
  );
}

function ReglagesEncadrement({
  bloc,
  peutEcrire,
  onChange,
}: {
  bloc: Extract<Bloc, { type: "TEXTE" | "RECTANGLE" | "FLUX" }>;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
}) {
  const maj = (ajouts: Partial<(typeof bloc)["encadrement"]>) =>
    onChange({ encadrement: { ...bloc.encadrement, ...ajouts } } as Partial<Bloc>);

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block text-xs text-muted-foreground">
        Fond
        <input
          type="color"
          value={bloc.encadrement.fond || "#ffffff"}
          disabled={!peutEcrire}
          onChange={(e) => maj({ fond: e.target.value })}
          className="mt-0.5 h-8 w-full rounded border border-border bg-card"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Bordure
        <input
          type="color"
          value={bloc.encadrement.bordure || "#15181d"}
          disabled={!peutEcrire}
          onChange={(e) => maj({ bordure: e.target.value })}
          className="mt-0.5 h-8 w-full rounded border border-border bg-card"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Épaisseur (mm)
        <Input
          type="number"
          step={0.05}
          min={0}
          value={bloc.encadrement.epaisseurBordure}
          disabled={!peutEcrire}
          onChange={(e) => maj({ epaisseurBordure: Number(e.target.value) })}
          className="mt-0.5 h-8 text-xs"
        />
      </label>
      <div className="flex items-end gap-1">
        <button
          type="button"
          disabled={!peutEcrire}
          onClick={() => maj({ fond: "" })}
          className="h-8 flex-1 rounded border border-border text-xs hover:bg-muted"
        >
          Sans fond
        </button>
        <button
          type="button"
          disabled={!peutEcrire}
          onClick={() => maj({ bordure: "" })}
          className="h-8 flex-1 rounded border border-border text-xs hover:bg-muted"
        >
          Sans filet
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tableau                                                             */
/* ------------------------------------------------------------------ */

function ReglagesTableau({
  bloc,
  peutEcrire,
  onChange,
  onRemplacer,
}: {
  bloc: BlocTableau;
  peutEcrire: boolean;
  onChange: (ajouts: Partial<Bloc>) => void;
  onRemplacer: (bloc: Bloc) => void;
}) {
  const manuel = !bloc.source;

  return (
    <div className="space-y-2 border-t border-border pt-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Tableau</p>

      <label className="block text-xs text-muted-foreground">
        Source des lignes — vide pour un tableau rempli à la main
        <Input
          value={bloc.source}
          disabled={!peutEcrire}
          placeholder="lignes"
          onChange={(e) => onChange({ source: e.target.value } as Partial<Bloc>)}
          className="mt-0.5 h-8 text-xs"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-muted-foreground">
          Hauteur d&apos;en-tête
          <Input
            type="number"
            step={0.5}
            min={0}
            value={bloc.hauteurEntete}
            disabled={!peutEcrire}
            onChange={(e) => onChange({ hauteurEntete: Number(e.target.value) } as Partial<Bloc>)}
            className="mt-0.5 h-8 text-xs"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Hauteur de ligne
          <Input
            type="number"
            step={0.5}
            min={1}
            value={bloc.hauteurLigne}
            disabled={!peutEcrire}
            onChange={(e) => onChange({ hauteurLigne: Number(e.target.value) } as Partial<Bloc>)}
            className="mt-0.5 h-8 text-xs"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs text-muted-foreground">
          Filets
          <input
            type="color"
            value={bloc.bordure || "#d9d9d9"}
            disabled={!peutEcrire}
            onChange={(e) => onChange({ bordure: e.target.value } as Partial<Bloc>)}
            className="mt-0.5 h-8 w-full rounded border border-border bg-card"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Épaisseur
          <Input
            type="number"
            step={0.05}
            min={0}
            value={bloc.epaisseurBordure}
            disabled={!peutEcrire}
            onChange={(e) => onChange({ epaisseurBordure: Number(e.target.value) } as Partial<Bloc>)}
            className="mt-0.5 h-8 text-xs"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          En-tête
          <input
            type="color"
            value={bloc.encadrementEntete.fond || "#15181d"}
            disabled={!peutEcrire}
            onChange={(e) =>
              onChange({
                encadrementEntete: { ...bloc.encadrementEntete, fond: e.target.value },
              } as Partial<Bloc>)
            }
            className="mt-0.5 h-8 w-full rounded border border-border bg-card"
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!peutEcrire}
          onClick={() => onChange({ bordure: "" } as Partial<Bloc>)}
          className="h-7 flex-1 rounded border border-border text-xs hover:bg-muted"
        >
          Sans filets
        </button>
        <button
          type="button"
          disabled={!peutEcrire}
          onClick={() =>
            onChange({ zebrure: bloc.zebrure ? "" : "#f2f2f2" } as Partial<Bloc>)
          }
          className={`h-7 flex-1 rounded border text-xs ${
            bloc.zebrure ? "border-primary bg-primary/10 text-primary" : "border-border"
          }`}
        >
          Zébrure
        </button>
      </div>

      {/* --------------------------------------------- Colonnes --- */}
      <p className="pt-1 text-xs font-medium text-muted-foreground">
        Colonnes ({bloc.colonnes.length})
      </p>
      <div className="space-y-1">
        {bloc.colonnes.map((colonne, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              value={colonne.entete}
              disabled={!peutEcrire}
              placeholder="En-tête"
              onChange={(e) =>
                onChange({
                  colonnes: bloc.colonnes.map((c, j) =>
                    j === i ? { ...c, entete: e.target.value } : c
                  ),
                } as Partial<Bloc>)
              }
              className="h-7 flex-1 text-xs"
            />
            <Input
              type="number"
              step={0.1}
              min={0.1}
              value={colonne.part}
              disabled={!peutEcrire}
              title="Largeur relative"
              onChange={(e) =>
                onChange({
                  colonnes: bloc.colonnes.map((c, j) =>
                    j === i ? { ...c, part: Number(e.target.value) } : c
                  ),
                } as Partial<Bloc>)
              }
              className="h-7 w-14 text-xs"
            />
            <Icone
              titre="Insérer une colonne à gauche"
              disabled={!peutEcrire}
              onClick={() => onRemplacer(ajouterColonne(bloc, i, "gauche"))}
            >
              <ArrowLeftToLine className="h-3 w-3" />
            </Icone>
            <Icone
              titre="Insérer une colonne à droite"
              disabled={!peutEcrire}
              onClick={() => onRemplacer(ajouterColonne(bloc, i, "droite"))}
            >
              <ArrowRightToLine className="h-3 w-3" />
            </Icone>
            <Icone
              titre="Supprimer cette colonne"
              danger
              disabled={!peutEcrire || bloc.colonnes.length <= 1}
              onClick={() => onRemplacer(supprimerColonne(bloc, i))}
            >
              <Minus className="h-3 w-3" />
            </Icone>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------- Lignes --- */}
      {manuel ? (
        <>
          <p className="pt-1 text-xs font-medium text-muted-foreground">
            Lignes ({bloc.lignesManuelles.length})
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {bloc.lignesManuelles.map((ligne, i) => (
              <div key={i} className="flex items-start gap-1">
                <div className="flex-1 space-y-0.5">
                  {ligne.map((cellule, j) => (
                    <Input
                      key={j}
                      value={cellule}
                      disabled={!peutEcrire}
                      placeholder={bloc.colonnes[j]?.entete ?? "Cellule"}
                      onChange={(e) => onRemplacer(majCellule(bloc, i, j, e.target.value))}
                      className="h-7 text-xs"
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-0.5">
                  <Icone
                    titre="Insérer une ligne au-dessus"
                    disabled={!peutEcrire}
                    onClick={() => onRemplacer(ajouterLigne(bloc, i, "dessus"))}
                  >
                    <ArrowUpToLine className="h-3 w-3" />
                  </Icone>
                  <Icone
                    titre="Insérer une ligne au-dessous"
                    disabled={!peutEcrire}
                    onClick={() => onRemplacer(ajouterLigne(bloc, i, "dessous"))}
                  >
                    <ArrowDownToLine className="h-3 w-3" />
                  </Icone>
                  <Icone
                    titre="Supprimer cette ligne"
                    danger
                    disabled={!peutEcrire}
                    onClick={() => onRemplacer(supprimerLigne(bloc, i))}
                  >
                    <Minus className="h-3 w-3" />
                  </Icone>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={!peutEcrire}
            onClick={() =>
              onRemplacer(
                ajouterLigne(bloc, Math.max(0, bloc.lignesManuelles.length - 1), "dessous")
              )
            }
            className="h-7 w-full rounded border border-border text-xs hover:bg-muted"
          >
            Ajouter une ligne
          </button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Les lignes viennent des données ({`{{${bloc.source}}}`}) : leur nombre
          dépend du document émis. Videz la source pour les saisir à la main.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Petits éléments partagés                                            */
/* ------------------------------------------------------------------ */

export function Encart({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 truncate text-xs font-semibold uppercase text-muted-foreground">
        {titre}
      </p>
      {children}
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
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border disabled:opacity-40 ${
        danger ? "text-danger hover:bg-danger/10" : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Bascule({
  actif,
  children,
  onClick,
  disabled,
}: {
  actif: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-7 w-9 rounded border text-xs ${
        actif ? "border-primary bg-primary/10 text-primary" : "border-border"
      }`}
    >
      {children}
    </button>
  );
}

function Choix<T extends string>({
  libelle,
  valeurs,
  actif,
  onChange,
  disabled,
}: {
  libelle: string;
  valeurs: readonly T[];
  actif: T;
  onChange: (valeur: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {libelle}
      <select
        value={actif}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-0.5 h-8 w-full rounded-md border border-border bg-card px-1 text-xs"
      >
        {valeurs.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}
