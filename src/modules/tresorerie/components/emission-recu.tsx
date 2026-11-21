"use client";

import { useState } from "react";
import { genererRecuEncaissement } from "@/modules/documents/actions/documents";
import { encaisserCotisationDepuisFlux } from "@/modules/tresorerie/actions/cotisations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Émission du reçu d'un encaissement du journal.
 *
 * Une cotisation ne s'émet pas comme une vente : elle inscrit quelqu'un au
 * registre des adhérents, que le décret-loi 2011-88 veut nominatif et
 * complet. Le formulaire demande donc l'identité avant le reçu — c'est le
 * seul moment où on la connaît, et l'exiger après revient à ne jamais
 * l'obtenir.
 */

/**
 * Une famille proposée au sélecteur.
 *
 * Aucune distinction d'origine ici : qu'une famille soit livrée avec l'application ou
 * déclarée par la JE ne regarde que l'écran qui les administre. Au moment
 * d'établir un reçu, « Participation JEBEX » est une catégorie comme les
 * autres et se lit dans la même liste.
 */
export type ChoixFamille = { valeur: string; libelle: string };

export function EmissionRecu({
  fluxId,
  tiers,
  familles,
}: {
  fluxId: string;
  tiers: string;
  familles: ChoixFamille[];
}) {
  const [nature, setNature] = useState(familles[0]?.valeur ?? "");
  const cotisation = nature === "RECU_COTISATION";

  // Toutes les familles peuvent être masquées : sans aucune, il n'y a pas de
  // reçu à émettre, et le dire vaut mieux qu'un menu vide.
  if (familles.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Aucune famille de reçus n&apos;est proposée. Reprenez-en une dans
        « Familles de reçus », ou déclarez-en une nouvelle.
      </p>
    );
  }

  if (cotisation) {
    return (
      <form action={encaisserCotisationDepuisFlux} className="mt-3 space-y-2">
        <input type="hidden" name="fluxId" value={fluxId} />
        <SelecteurNature
          nature={nature}
          setNature={setNature}
          familles={familles}
          tiers={tiers}
        />

        <p className="text-xs text-muted-foreground">
          Registre des adhérents — ces informations partent au secrétariat et
          au registre des cotisations, et la CIN figure sur le reçu. Elles ne
          sont demandées qu&apos;une fois par personne.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="prenom" required placeholder="Prénom *" className="h-9" />
          <Input name="nom" required placeholder="Nom *" className="h-9" />
          <Input
            name="cin"
            required
            inputMode="numeric"
            placeholder="CIN *"
            className="h-9"
          />
          <Input
            name="adresse"
            required
            placeholder="Domicile *"
            className="h-9"
          />
          <Input
            name="nationalite"
            required
            defaultValue="Tunisienne"
            placeholder="Nationalité *"
            className="h-9"
          />
          <Input name="profession" required placeholder="Profession *" className="h-9" />
          <label className="text-xs text-muted-foreground">
            Date de naissance *
            <Input
              name="dateNaissance"
              type="date"
              required
              className="mt-1 h-9"
            />
          </label>
          <Input
            name="email"
            type="email"
            placeholder="E-mail (facultatif)"
            className="h-9 self-end"
          />
        </div>
        <Button type="submit" size="sm" className="w-full">
          Inscrire le cotisant et générer le reçu
        </Button>
      </form>
    );
  }

  return (
    <form action={genererRecuEncaissement} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="fluxId" value={fluxId} />
      <SelecteurNature
        nature={nature}
        setNature={setNature}
        familles={familles}
        tiers={tiers}
      />
      <Button type="submit" size="sm">
        Générer le reçu
      </Button>
    </form>
  );
}

function SelecteurNature({
  nature,
  setNature,
  familles,
  tiers,
}: {
  nature: string;
  setNature: (v: string) => void;
  familles: ChoixFamille[];
  tiers: string;
}) {
  return (
    <select
      name="nature"
      value={nature}
      onChange={(e) => setNature(e.target.value)}
      className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm"
      aria-label={`Nature du reçu pour ${tiers}`}
    >
      {familles.map((f) => (
        <option key={f.valeur} value={f.valeur}>
          {f.libelle}
        </option>
      ))}
    </select>
  );
}
