"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileCheck2, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import {
  ajouterLigneBudget,
  deposerJustificatifLigne,
  enregistrerLigneBudget,
  supprimerJustificatifLigne,
  supprimerLigneBudget,
} from "@/modules/tresorerie/actions/budget-previsionnel";
import {
  sousTotalSection,
  type PeriodeBudget,
  type SensSection,
} from "@/modules/tresorerie/services/budget-previsionnel";
import { Button } from "@/components/ui/button";

/**
 * Grille de saisie du budget, à la manière d'un tableur.
 *
 * Il n'y a pas de bouton « Enregistrer » : ce que l'on tape est enregistré,
 * un court instant après la frappe et à chaque sortie de champ. Le bouton
 * n'apportait rien qu'un oubli possible — la trace de l'écriture, elle,
 * reste au journal d'activité.
 *
 * La grille occupe toute la largeur disponible : les colonnes de mois se
 * partagent l'espace restant plutôt que de mesurer une taille fixe qui
 * forçait un défilement horizontal.
 */

export type LigneGrille = {
  id: string;
  libelle: string;
  valeurs: number[];
  justificatif?: { nomFichier?: string } | null;
};

type Brouillon = { libelle: string; valeurs: string[] };
type Statut = "encours" | "ok" | "erreur";

const DELAI_ENREGISTREMENT_MS = 600;

function nombre(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formater(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/**
 * « Septembre 2026 » → « Sept. 26 ».
 *
 * Un mois entier passait à la ligne dans sa colonne, et l'en-tête tenait sur
 * deux hauteurs différentes selon les mois. Abrégé, il tient sur une ligne.
 */
const ABREGES: Record<string, string> = {
  janvier: "Janv.",
  février: "Févr.",
  mars: "Mars",
  avril: "Avr.",
  mai: "Mai",
  juin: "Juin",
  juillet: "Juil.",
  août: "Août",
  septembre: "Sept.",
  octobre: "Oct.",
  novembre: "Nov.",
  décembre: "Déc.",
};

function libelleCourt(libelle: string): string {
  const [mois, annee] = libelle.split(/\s+/);
  const abrege = ABREGES[mois?.toLowerCase() ?? ""] ?? mois ?? libelle;
  return annee ? `${abrege} ${annee.slice(-2)}` : abrege;
}

const CHAMP_NOMBRE =
  "h-8 w-full min-w-0 rounded-md border border-border bg-card px-1 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export function GrilleBudget({
  section,
  sens,
  periodes,
  lignes,
  peutEditer,
}: {
  section: string;
  sens: SensSection;
  periodes: PeriodeBudget[];
  lignes: LigneGrille[];
  peutEditer: boolean;
}) {
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({});
  const [statuts, setStatuts] = useState<Record<string, Statut>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [consulte, setConsulte] = useState<LigneGrille | null>(null);
  const brouillonsRef = useRef<Record<string, Brouillon>>({});
  const minuteries = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fichiers = useRef<Record<string, HTMLInputElement | null>>({});

  // Les colonnes se partagent la largeur : intitulé un peu plus large, un
  // douzième de l'espace restant par mois, puis le total et les actions.
  const colonnes = `minmax(8rem, 1.7fr) repeat(${periodes.length}, minmax(0, 1fr)) 5rem 3.25rem`;

  function etat(ligne: LigneGrille): Brouillon {
    return (
      brouillons[ligne.id] ?? {
        libelle: ligne.libelle,
        valeurs: ligne.valeurs.map((v) => String(v ?? 0)),
      }
    );
  }

  async function sauvegarder(ligne: LigneGrille) {
    clearTimeout(minuteries.current[ligne.id]);
    const courant = brouillonsRef.current[ligne.id];
    if (!courant) return;

    setStatuts((s) => ({ ...s, [ligne.id]: "encours" }));
    const donnees = new FormData();
    donnees.set("ligneId", ligne.id);
    donnees.set("section", section);
    donnees.set("libelle", courant.libelle);
    for (let i = 0; i < periodes.length; i += 1) {
      donnees.append("valeur", String(nombre(courant.valeurs[i] ?? "0")));
    }
    try {
      await enregistrerLigneBudget(donnees);
      setStatuts((s) => ({ ...s, [ligne.id]: "ok" }));
      setErreur(null);
    } catch (err) {
      setStatuts((s) => ({ ...s, [ligne.id]: "erreur" }));
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }

  function modifier(ligne: LigneGrille, patch: Partial<Brouillon>) {
    const suivant = { ...etat(ligne), ...patch };
    brouillonsRef.current = { ...brouillonsRef.current, [ligne.id]: suivant };
    setBrouillons(brouillonsRef.current);
    clearTimeout(minuteries.current[ligne.id]);
    minuteries.current[ligne.id] = setTimeout(
      () => void sauvegarder(ligne),
      DELAI_ENREGISTREMENT_MS
    );
  }

  async function deposer(ligne: LigneGrille, fichier: File) {
    const donnees = new FormData();
    donnees.set("ligneId", ligne.id);
    donnees.set("fichier", fichier);
    setStatuts((s) => ({ ...s, [ligne.id]: "encours" }));
    try {
      await deposerJustificatifLigne(donnees);
      setStatuts((s) => ({ ...s, [ligne.id]: "ok" }));
      setConsulte(null);
      setErreur(null);
    } catch (err) {
      setStatuts((s) => ({ ...s, [ligne.id]: "erreur" }));
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }

  async function retirerJustificatif(ligne: LigneGrille) {
    const nom = ligne.justificatif?.nomFichier ?? "ce justificatif";
    if (
      !window.confirm(
        `Retirer le justificatif « ${nom} » ?\n\nIl part à la corbeille de la trésorerie et reste restaurable 30 jours.`
      )
    ) {
      return;
    }
    const donnees = new FormData();
    donnees.set("ligneId", ligne.id);
    try {
      await supprimerJustificatifLigne(donnees);
      setConsulte(null);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }

  async function supprimer(ligne: LigneGrille) {
    const nom = etat(ligne).libelle || "ce poste sans libellé";
    if (
      !window.confirm(
        `Supprimer le poste « ${nom} » ?\n\nIl part à la corbeille de la trésorerie et reste restaurable 30 jours.`
      )
    ) {
      return;
    }
    const donnees = new FormData();
    donnees.set("ligneId", ligne.id);
    try {
      await supprimerLigneBudget(donnees);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }

  const sousTotal = sousTotalSection(
    {
      sens,
      lignes: lignes.map((l) => ({
        valeursMensuelles: etat(l).valeurs.map(nombre),
      })),
    },
    periodes.length
  );
  const totalSection = sousTotal.reduce((s, v) => s + v, 0);
  const teinte = sens === "DEPENSE" ? "text-danger" : "text-success";

  return (
    <div>
      {/*
        Pas de `items-center` ici : une cellule centrée dans sa rangée porte
        son trait de séparation à sa propre hauteur, pas à celle de la
        rangée — les traits se décalaient donc d'une colonne à l'autre. Les
        cellules s'étirent, et c'est leur contenu qui se centre.
      */}
      <div className="grid gap-1" style={{ gridTemplateColumns: colonnes }}>
        {/* En-tête */}
        <div className="pb-2 text-xs font-medium text-muted-foreground">Poste</div>
        {periodes.map((p) => (
          <div
            key={p.cle}
            className="whitespace-nowrap pb-2 text-right text-xs font-medium text-muted-foreground"
          >
            {libelleCourt(p.libelle)}
          </div>
        ))}
        <div className="whitespace-nowrap pb-2 text-right text-xs font-medium text-muted-foreground">
          Total
        </div>
        <div className="pb-2" />

        {lignes.map((ligne) => {
          const courant = etat(ligne);
          const statut = statuts[ligne.id];
          const aJustificatif = Boolean(ligne.justificatif?.nomFichier);
          const totalLigne = courant.valeurs.reduce((s, v) => s + nombre(v), 0);
          return (
            <div key={ligne.id} className="contents">
              <div className="relative flex items-center border-t border-border/60 py-1">
                <input
                  value={courant.libelle}
                  onChange={(e) => modifier(ligne, { libelle: e.target.value })}
                  onBlur={() => void sauvegarder(ligne)}
                  disabled={!peutEditer}
                  placeholder="Intitulé du poste"
                  aria-label="Intitulé du poste"
                  className="h-8 w-full rounded-md border border-border bg-card px-2 pr-6 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
                {statut ? (
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
                    {statut === "encours" ? (
                      <Loader2 size={12} className="animate-spin text-muted-foreground" />
                    ) : statut === "ok" ? (
                      <Check size={12} className="text-success" />
                    ) : (
                      <span className="text-xs text-danger">!</span>
                    )}
                  </span>
                ) : null}
              </div>

              {periodes.map((p, i) => (
                <div key={p.cle} className="flex items-center border-t border-border/60 py-1">
                  <input
                    type="number"
                    step="0.001"
                    value={courant.valeurs[i] ?? "0"}
                    onChange={(e) => {
                      const valeurs = [...courant.valeurs];
                      valeurs[i] = e.target.value;
                      modifier(ligne, { valeurs });
                    }}
                    onBlur={() => void sauvegarder(ligne)}
                    disabled={!peutEditer}
                    aria-label={`${courant.libelle || "Poste"} — ${p.libelle}`}
                    className={CHAMP_NOMBRE}
                  />
                </div>
              ))}

              <div
                className={`flex items-center justify-end border-t border-border/60 py-1 pr-1 text-right text-sm font-medium tabular-nums ${
                  totalLigne ? teinte : "text-muted-foreground"
                }`}
              >
                {formater(totalLigne)}
              </div>

              {/*
                Les deux icônes côte à côte, et non empilées : superposées,
                elles faisaient une cellule deux fois plus haute que la
                ligne de saisie, et rien ne tombait plus en face de rien.
              */}
              <div className="flex items-center justify-end gap-0.5 border-t border-border/60 py-1">
                <input
                  ref={(el) => {
                    fichiers.current[ligne.id] = el;
                  }}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const fichier = e.target.files?.[0];
                    e.target.value = "";
                    if (fichier) void deposer(ligne, fichier);
                  }}
                />
                <button
                  type="button"
                  title={
                    aJustificatif
                      ? `Justificatif déposé : ${ligne.justificatif?.nomFichier} — cliquer pour le visualiser`
                      : "Déposer le justificatif format PDF seulement"
                  }
                  aria-label={
                    aJustificatif
                      ? "Visualiser le justificatif"
                      : "Déposer le justificatif format PDF seulement"
                  }
                  disabled={!peutEditer && !aJustificatif}
                  onClick={() =>
                    aJustificatif
                      ? setConsulte(ligne)
                      : fichiers.current[ligne.id]?.click()
                  }
                  className={`rounded p-1 hover:bg-muted disabled:opacity-30 ${
                    aJustificatif ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {aJustificatif ? <FileCheck2 size={14} /> : <Paperclip size={14} />}
                </button>
                {peutEditer ? (
                  <button
                    type="button"
                    title="Supprimer le poste"
                    aria-label={`Supprimer le poste ${courant.libelle || "sans libellé"}`}
                    onClick={() => void supprimer(ligne)}
                    className="rounded p-1 text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {lignes.length > 0 ? (
          <>
            <div className="border-t border-border pt-2 text-sm font-medium">
              Sous-total
            </div>
            {sousTotal.map((v, i) => (
              <div
                key={periodes[i]?.cle ?? i}
                className="border-t border-border pt-2 pr-1 text-right text-sm font-medium tabular-nums"
              >
                {formater(v)}
              </div>
            ))}
            <div
              className={`border-t border-border pt-2 pr-1 text-right text-sm font-semibold tabular-nums ${teinte}`}
            >
              {formater(totalSection)}
            </div>
            <div className="border-t border-border pt-2" />
          </>
        ) : null}
      </div>

      {lignes.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          Aucun poste dans cette section.
        </p>
      ) : null}

      {peutEditer ? (
        <form action={ajouterLigneBudget} className="mt-3 border-t border-border pt-3">
          <input type="hidden" name="section" value={section} />
          <button
            type="submit"
            title="Ajouter un poste vierge"
            aria-label="Ajouter un poste"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus size={16} />
          </button>
        </form>
      ) : null}

      {erreur ? (
        <p className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {erreur}
        </p>
      ) : null}

      {consulte ? (
        <FenetreJustificatif
          ligne={consulte}
          peutEditer={peutEditer}
          onFermer={() => setConsulte(null)}
          onRemplacer={() => fichiers.current[consulte.id]?.click()}
          onRetirer={() => void retirerJustificatif(consulte)}
        />
      ) : null}
    </div>
  );
}

/**
 * Consultation d'un justificatif sans quitter le budget.
 *
 * Le PDF déposé n'était jusqu'ici jamais relisible : on savait qu'il existait,
 * pas ce qu'il contenait. On le montre donc sur place, avec les deux seules
 * suites possibles — le remplacer, ou l'envoyer à la corbeille.
 */
function FenetreJustificatif({
  ligne,
  peutEditer,
  onFermer,
  onRemplacer,
  onRetirer,
}: {
  ligne: LigneGrille;
  peutEditer: boolean;
  onFermer: () => void;
  onRemplacer: () => void;
  onRetirer: () => void;
}) {
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [onFermer]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Justificatif de ${ligne.libelle || "ce poste"}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {ligne.justificatif?.nomFichier ?? "Justificatif"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Poste « {ligne.libelle || "sans libellé"} »
            </p>
          </div>
          <div className="flex items-center gap-2">
            {peutEditer ? (
              <>
                <Button size="sm" variant="outline" type="button" onClick={onRemplacer}>
                  Remplacer
                </Button>
                <Button size="sm" variant="danger" type="button" onClick={onRetirer}>
                  <Trash2 size={14} /> Corbeille
                </Button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onFermer}
              title="Fermer"
              aria-label="Fermer la fenêtre"
              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <iframe
          src={`/api/tresorerie/budget/justificatif/${ligne.id}`}
          title={`Justificatif de ${ligne.libelle || "ce poste"}`}
          className="min-h-0 flex-1 bg-muted"
        />
      </div>
    </div>
  );
}
