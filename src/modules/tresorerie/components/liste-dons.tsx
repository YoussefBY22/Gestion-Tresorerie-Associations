"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  modifierDon,
  supprimerDon,
} from "@/modules/tresorerie/actions/registres";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Registre des dons — une ligne par don, corrigeable sur place.
 *
 * Un don s'enregistre au moment où il arrive, souvent vite et de mémoire :
 * la CIN du donateur manque, l'origine est mal cochée. Le registre étant ce
 * qu'on présente en cas de contrôle (décret-loi n° 2011-88), il doit pouvoir
 * se corriger sans passer par une ressaisie complète.
 */

import {
  PiecesRegistre,
  type PieceVue,
} from "@/modules/tresorerie/components/pieces-registre";

export type LigneDon = {
  id: string;
  donateur: string;
  cin: string;
  nature: string;
  montant: number | null;
  descriptionNature: string;
  origine: string;
  provenance: string;
  date: string;
  dateISO: string;
  objet: string;
  pieces: PieceVue[];
};

type Options = {
  natures: readonly string[];
  libellesNature: Record<string, string>;
  origines: readonly string[];
  libellesOrigine: Record<string, string>;
  provenances: readonly string[];
  libellesProvenance: Record<string, string>;
};

const CHAMP =
  "h-8 rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ListeDons({
  lignes,
  options,
  peutEcrire,
}: {
  lignes: LigneDon[];
  options: Options;
  peutEcrire: boolean;
}) {
  const [enEdition, setEnEdition] = useState<string | null>(null);

  return (
    <>
      {lignes.map((d) =>
        enEdition === d.id ? (
          <div
            key={d.id}
            className="rounded-md border border-border bg-muted/40 p-3 text-sm"
          >
            <form
              action={async (donnees) => {
                await modifierDon(donnees);
                setEnEdition(null);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="donId" value={d.id} />
              <Input
                name="donateur"
                defaultValue={d.donateur}
                required
                minLength={2}
                placeholder="Donateur"
                className="h-8 w-44 text-xs"
                aria-label="Donateur"
              />
              <Input
                name="cin"
                defaultValue={d.cin}
                placeholder="CIN"
                className="h-8 w-28 text-xs"
                aria-label="CIN du donateur"
              />
              <select
                name="nature"
                defaultValue={d.nature}
                className={CHAMP}
                aria-label="Nature du don"
              >
                {options.natures.map((n) => (
                  <option key={n} value={n}>
                    {options.libellesNature[n]}
                  </option>
                ))}
              </select>
              <Input
                name="montant"
                type="number"
                min={0}
                step="0.001"
                defaultValue={d.montant ?? ""}
                placeholder="Montant DT"
                className="h-8 w-28 text-right text-xs"
                aria-label="Montant du don"
              />
              <Input
                name="descriptionNature"
                defaultValue={d.descriptionNature}
                placeholder="Bien donné (si en nature)"
                className="h-8 w-48 text-xs"
                aria-label="Description du bien"
              />
              <select
                name="origine"
                defaultValue={d.origine}
                className={CHAMP}
                aria-label="Origine du don"
              >
                {options.origines.map((o) => (
                  <option key={o} value={o}>
                    {options.libellesOrigine[o]}
                  </option>
                ))}
              </select>
              <select
                name="provenance"
                defaultValue={d.provenance}
                className={CHAMP}
                aria-label="Provenance du don"
              >
                {options.provenances.map((p) => (
                  <option key={p} value={p}>
                    {options.libellesProvenance[p]}
                  </option>
                ))}
              </select>
              <Input
                name="date"
                type="date"
                defaultValue={d.dateISO}
                required
                className="h-8 w-36 text-xs"
                aria-label="Date du don"
              />
              <Input
                name="objet"
                defaultValue={d.objet}
                placeholder="Objet du don"
                className="h-8 w-48 text-xs"
                aria-label="Objet du don"
              />
              <button
                type="submit"
                title="Enregistrer la correction"
                aria-label="Enregistrer la correction"
                className="rounded p-1.5 text-success hover:bg-success/10"
              >
                <Check size={15} />
              </button>
              <button
                type="button"
                title="Annuler"
                aria-label="Annuler la correction"
                onClick={() => setEnEdition(null)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={15} />
              </button>
            </form>
          </div>
        ) : (
          <div
            key={d.id}
            className="group rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.donateur}</span>
              <Badge variant="outline">{options.libellesNature[d.nature]}</Badge>
              <Badge variant="muted">{options.libellesOrigine[d.origine]}</Badge>
              <Badge variant="muted">
                {options.libellesProvenance[d.provenance]}
              </Badge>
              {d.nature === "NUMERAIRE" && !d.cin ? (
                <Badge variant="danger">CIN manquant</Badge>
              ) : null}
              <span className="ml-auto text-xs text-muted-foreground">
                {d.date}
              </span>
              {peutEcrire ? (
                <div className="flex items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    title="Corriger ce don"
                    aria-label={`Corriger le don de ${d.donateur}`}
                    onClick={() => setEnEdition(d.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <form
                    action={supprimerDon}
                    onSubmit={(e) => {
                      if (
                        !window.confirm(
                          `Supprimer le don de ${d.donateur} ?\n\nIl part à la corbeille de la trésorerie et reste restaurable 30 jours.`
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="donId" value={d.id} />
                    <button
                      type="submit"
                      title="Supprimer ce don"
                      aria-label={`Supprimer le don de ${d.donateur}`}
                      className="rounded p-1.5 text-danger hover:bg-danger/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.nature === "NUMERAIRE"
                ? `${(d.montant ?? 0).toLocaleString("fr-FR")} DT`
                : d.descriptionNature}
              {d.objet ? ` — ${d.objet}` : ""}
              {d.cin ? ` · CIN ${d.cin}` : ""}
            </p>
            {/* La preuve du don : c'est elle qu'on demande en audit, pas la
                ligne du registre. */}
            <PiecesRegistre
              registre="dons"
              ligneId={d.id}
              pieces={d.pieces}
              peutEcrire={peutEcrire}
            />
          </div>
        )
      )}
    </>
  );
}
