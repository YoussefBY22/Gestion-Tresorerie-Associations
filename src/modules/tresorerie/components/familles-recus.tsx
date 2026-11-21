"use client";

import { useState } from "react";
import { Check, Lock, Pencil, Trash2, X } from "lucide-react";
import {
  modifierFamilleRecu,
  supprimerFamilleRecu,
} from "@/modules/tresorerie/actions/recus";
import type { FamilleRecu } from "@/modules/tresorerie/services/familles-recus";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Toutes les familles de reçus de la JE, au même endroit.
 *
 * Celles du catalogue (cotisation, don, vente, job, intégration, divers) et
 * celles que la JE déclare se lisaient dans deux écrans différents : les
 * premières dans un menu déroulant, intouchables, les secondes dans une
 * liste. Elles cohabitent maintenant.
 *
 * Deux natures de champs, comme au registre clients : le **libellé** est le
 * mot que la JE emploie et se change toujours ; le **code** entre dans la
 * référence (`RC001-`**`COT`**`-2526`) et porte un cadenas dès qu'un reçu l'a
 * consommé — le renommer ferait deux séries qui prétendent être la même.
 *
 * Une famille se supprime, et part à la corbeille comme le reste de l'application.
 * Les reçus déjà émis ne bougent pas : ils portent leur référence et leur
 * libellé, figés à l'émission. Supprimer ferme la série, cela ne réécrit pas
 * le passé.
 *
 * « N numéros attribués » se lit sur le compteur de la série, pas sur les
 * reçus présents : le compteur ne redescend jamais, même reçus supprimés et
 * corbeille vidée. C'est ce qui garantit qu'un numéro n'est jamais émis deux
 * fois — et c'est pourquoi le libellé parle de numéros, pas de pièces.
 */
export function FamillesRecus({
  familles,
  peutEcrire,
}: {
  familles: FamilleRecu[];
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <ul className="space-y-1.5">
      {familles.map((f) =>
        enEdition === f.valeur ? (
          <li
            key={f.valeur}
            className="rounded-md border border-border bg-muted/40 p-2"
          >
            <form
              action={async (donnees) => {
                await modifierFamilleRecu(donnees);
                setEnEdition(null);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="valeur" value={f.valeur} />
              <Input
                name="libelle"
                defaultValue={f.libelle}
                required
                minLength={2}
                placeholder="Intitulé"
                className="h-8 min-w-40 flex-1 text-xs"
                aria-label={`Intitulé de la famille ${f.libelle}`}
              />
              {f.codeModifiable ? (
                <Input
                  name="code"
                  defaultValue={f.code}
                  required
                  pattern="[A-Za-z]{2,10}"
                  placeholder="Code"
                  className="h-8 w-28 font-mono text-xs uppercase"
                  aria-label={`Code de référence de ${f.libelle}`}
                />
              ) : (
                <span
                  title={
                    f.origine === "CATALOGUE"
                      ? "Segment livré avec l'application : les références émises d'un mandat à l'autre le portent."
                      : `${f.numerosAttribues} numéro(s) déjà attribué(s) sous ce code : la série ne se renomme plus.`
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
                >
                  <Lock size={11} aria-hidden />
                  {f.code}
                </span>
              )}
              <button
                type="submit"
                title="Enregistrer"
                aria-label="Enregistrer la famille"
                className="rounded p-1.5 text-success hover:bg-success/10"
              >
                <Check size={15} />
              </button>
              <button
                type="button"
                title="Annuler"
                aria-label="Annuler"
                onClick={() => setEnEdition(null)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={15} />
              </button>
            </form>
          </li>
        ) : (
          <li
            key={f.valeur}
            className="group flex items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-medium">{f.libelle}</span>
                {f.origine === "JE" ? <Badge variant="outline">JE</Badge> : null}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                RC001-{f.code}-…
                {f.numerosAttribues > 0 ? (
                  <span
                    className="ml-1 font-sans"
                    title="Compteur de la série. Il ne redescend pas quand un reçu est supprimé : c'est ce qui empêche d'émettre deux fois le même numéro."
                  >
                    · {f.numerosAttribues} numéro
                    {f.numerosAttribues > 1 ? "s" : ""} attribué
                    {f.numerosAttribues > 1 ? "s" : ""}
                  </span>
                ) : null}
              </p>
            </div>
            {peutEcrire ? (
              <div className="flex shrink-0 items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  title="Modifier cette famille"
                  aria-label={`Modifier la famille ${f.libelle}`}
                  onClick={() => setEnEdition(f.valeur)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={14} />
                </button>
                <form
                  action={supprimerFamilleRecu}
                  onSubmit={(e) => {
                    // Le compteur de la série n'est pas un inventaire : il ne
                    // dit pas que des reçus existent, seulement que des
                    // numéros ont été attribués. Le message doit dire cela,
                    // sinon il contredit un écran qu'on vient de vider.
                    const serie =
                      f.numerosAttribues > 0
                        ? `\n\nCette série a déjà attribué ${f.numerosAttribues} numéro(s) « RC001-${f.code}-… ». Le compteur ne redescend pas, même si les reçus ont été supprimés : c'est ce qui empêche d'émettre deux fois le même numéro. Les reçus encore présents, eux, ne sont pas touchés.`
                        : "";
                    if (
                      !window.confirm(
                        `Supprimer la famille « ${f.libelle} » ?\n\nElle ne sera plus proposée à l'émission d'un reçu. Elle part à la corbeille de la trésorerie et reste restaurable 30 jours.${serie}`
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="valeur" value={f.valeur} />
                  <button
                    type="submit"
                    title="Supprimer cette famille"
                    aria-label={`Supprimer la famille ${f.libelle}`}
                    className="rounded p-1.5 text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </form>
              </div>
            ) : null}
          </li>
        )
      )}
    </ul>
  );
}
