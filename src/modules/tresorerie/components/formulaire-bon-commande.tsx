"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { emettreBonCommande } from "@/modules/tresorerie/actions/bons-commande";
import {
  montantLigne,
  totauxBonCommande,
} from "@/modules/tresorerie/services/bon-commande";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Émettre un bon de commande.
 *
 * Les lignes se composent à l'écran et le total se met à jour à la frappe :
 * c'est le montant qu'on s'apprête à engager, et personne ne doit le
 * découvrir après avoir signé. Elles partent au serveur en JSON — un bon en
 * compte rarement plus de cinq, et des champs indexés dans un FormData
 * seraient plus fragiles à relire qu'à écrire.
 */

type Ligne = { designation: string; quantite: string; prixUnitaire: string };

const LIGNE_VIDE: Ligne = { designation: "", quantite: "1", prixUnitaire: "" };

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export function FormulaireBonCommande({
  fournisseurs,
  sections,
}: {
  fournisseurs: string[];
  sections: string[];
}) {
  const [fournisseur, setFournisseur] = useState("");
  const [objet, setObjet] = useState("");
  const [tauxTVA, setTauxTVA] = useState("19");
  const [sectionBudget, setSectionBudget] = useState("");
  const [livraison, setLivraison] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  const lignesChiffrees = lignes
    .filter((l) => l.designation.trim())
    .map((l) => ({
      designation: l.designation.trim(),
      quantite: Number(l.quantite) || 0,
      prixUnitaire: Number(l.prixUnitaire) || 0,
    }));
  const totaux = totauxBonCommande(lignesChiffrees, Number(tauxTVA) || 0);

  function modifier(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((avant) =>
      avant.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l))
    );
  }

  function envoyer() {
    setRetour(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("fournisseur", fournisseur);
      donnees.set("objet", objet);
      donnees.set("tauxTVA", tauxTVA);
      if (sectionBudget) donnees.set("sectionBudget", sectionBudget);
      if (livraison) donnees.set("livraisonPrevue", livraison);
      donnees.set("lignes", JSON.stringify(lignesChiffrees));
      try {
        const r = await emettreBonCommande(donnees);
        setRetour(r);
        if (r.ok) {
          setFournisseur("");
          setObjet("");
          setSectionBudget("");
          setLivraison("");
          setLignes([{ ...LIGNE_VIDE }]);
        }
      } catch (err) {
        setRetour({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  const complet =
    fournisseur.trim().length > 0 &&
    objet.trim().length >= 3 &&
    totaux.totalHT > 0;

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Fournisseur *
        <Input
          list="fournisseurs-connus"
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
          placeholder="Nom du fournisseur"
          className="mt-1"
        />
        <datalist id="fournisseurs-connus">
          {fournisseurs.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>

      <label className="block text-sm">
        Objet de la commande *
        <Input
          value={objet}
          onChange={(e) => setObjet(e.target.value)}
          placeholder="Ce qui est commandé, et pourquoi"
          className="mt-1"
        />
      </label>

      <div className="space-y-2 rounded-md border border-border p-2">
        <p className="text-xs font-medium text-muted-foreground">Lignes</p>
        {lignes.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1">
            <Input
              value={l.designation}
              onChange={(e) => modifier(i, "designation", e.target.value)}
              placeholder="Désignation"
              aria-label={`Désignation de la ligne ${i + 1}`}
              className="h-8 min-w-40 flex-1 text-xs"
            />
            <Input
              type="number"
              min="0"
              step="0.5"
              value={l.quantite}
              onChange={(e) => modifier(i, "quantite", e.target.value)}
              aria-label={`Quantité de la ligne ${i + 1}`}
              className="h-8 w-16 text-xs"
            />
            <Input
              type="number"
              min="0"
              step="0.001"
              value={l.prixUnitaire}
              onChange={(e) => modifier(i, "prixUnitaire", e.target.value)}
              placeholder="P.U."
              aria-label={`Prix unitaire de la ligne ${i + 1}`}
              className="h-8 w-24 text-xs"
            />
            <span className="w-24 text-right text-xs text-muted-foreground">
              {dt(
                montantLigne({
                  designation: l.designation,
                  quantite: Number(l.quantite) || 0,
                  prixUnitaire: Number(l.prixUnitaire) || 0,
                })
              )}
            </span>
            {lignes.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                aria-label={`Retirer la ligne ${i + 1}`}
                onClick={() =>
                  setLignes((avant) => avant.filter((_, j) => j !== i))
                }
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => setLignes((avant) => [...avant, { ...LIGNE_VIDE }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Ajouter une ligne
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="block flex-1 text-sm">
          TVA (%)
          <Input
            type="number"
            min={0}
            max={100}
            value={tauxTVA}
            onChange={(e) => setTauxTVA(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block flex-1 text-sm">
          Livraison attendue
          <Input
            type="date"
            value={livraison}
            onChange={(e) => setLivraison(e.target.value)}
            className="mt-1"
          />
        </label>
      </div>

      <label className="block text-sm">
        Imputation budgétaire
        <Input
          list="sections-budget"
          value={sectionBudget}
          onChange={(e) => setSectionBudget(e.target.value)}
          placeholder="Section du budget engagée"
          className="mt-1"
        />
        <datalist id="sections-budget">
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
        Total HT {dt(totaux.totalHT)} · TVA {dt(totaux.tva)} ·{" "}
        <span className="font-semibold text-foreground">
          {dt(totaux.totalTTC)} TTC engagés
        </span>
      </p>

      <Button
        type="button"
        className="w-full"
        disabled={enCours || !complet}
        onClick={envoyer}
      >
        {enCours ? "Émission…" : "Émettre le bon de commande"}
      </Button>

      {retour ? (
        <p
          role="status"
          className={`rounded-md px-2 py-1.5 text-xs ${
            retour.ok
              ? "bg-success/10 text-success"
              : "border border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {retour.message}
        </p>
      ) : null}
    </div>
  );
}
