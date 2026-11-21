"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Plus, X } from "lucide-react";
import { creerAffaire } from "@/modules/tresorerie/actions/affaires";
import {
  LIBELLES_TYPE_PROJET,
  TYPES_PROJET,
} from "@/modules/base/constantes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Nouvelle affaire — un client et un projet, en une saisie.
 *
 * C'est le bouton qui débloque la facturation : sans projet, l'écran
 * Factures ne propose rien, et il n'existe plus de module commercial pour en
 * créer un.
 *
 * Le formulaire est délibérément court. Deux champs sont obligatoires — le
 * client et le nom du projet — et tout le reste peut attendre : une affaire
 * se chiffre souvent après avoir été ouverte, et exiger le montant tout de
 * suite pousse à inventer un chiffre. Les coordonnées, elles, sont demandées
 * ici parce qu'elles finiront sur une facture : les saisir maintenant évite
 * d'émettre une première pièce avec une adresse vide.
 */

export type ClientConnu = { id: string; organisation: string };

export function NouvelleAffaire({
  clients,
  libelleBouton = "Nouvelle affaire",
}: {
  clients: ClientConnu[];
  libelleBouton?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nouveauClient, setNouveauClient] = useState(clients.length === 0);
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  function envoyer(formData: FormData) {
    // Le champ laissé de côté est retiré : envoyer les deux laisserait
    // l'action choisir à notre place, et ce n'est pas à elle de deviner.
    if (nouveauClient) formData.delete("clientId");
    else formData.delete("organisation");

    demarrer(async () => {
      const r = await creerAffaire(formData);
      setRetour(r);
      if (r.ok) {
        // On referme sur un succès, mais le message reste affiché : il nomme
        // ce qui vient d'être créé, et dit que le projet est facturable.
        setOuvert(false);
      }
    });
  }

  if (!ouvert) {
    return (
      <div className="space-y-2">
        <Button type="button" size="sm" onClick={() => setOuvert(true)}>
          <Plus size={14} /> {libelleBouton}
        </Button>
        {retour ? <Message retour={retour} /> : null}
      </div>
    );
  }

  const champ =
    "flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form
      action={envoyer}
      className="w-full max-w-xl rounded-lg border border-border bg-card p-4 text-left shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nouvelle affaire</h3>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          aria-label="Fermer"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={15} />
        </button>
      </div>

      <fieldset disabled={enCours} className="space-y-3">
        {/* --- Le client --- */}
        <div className="rounded-md border border-border/70 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium">Client</span>
            {clients.length > 0 ? (
              <>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="choixClient"
                    checked={!nouveauClient}
                    onChange={() => setNouveauClient(false)}
                    className="accent-primary"
                  />
                  Client existant
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="choixClient"
                    checked={nouveauClient}
                    onChange={() => setNouveauClient(true)}
                    className="accent-primary"
                  />
                  Nouveau client
                </label>
              </>
            ) : (
              <span className="text-muted-foreground">
                Aucun client au registre — celui-ci y sera ajouté.
              </span>
            )}
          </div>

          {nouveauClient ? (
            <div className="space-y-2">
              <Input
                name="organisation"
                required
                minLength={2}
                placeholder="Nom de l'organisation *"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="contact" placeholder="Personne de contact" />
                <Input name="email" type="email" placeholder="E-mail" />
                <Input name="telephone" placeholder="Téléphone" />
                <Input
                  name="matriculeFiscal"
                  placeholder="Matricule fiscal (sur les factures)"
                />
              </div>
              <Input
                name="adresse"
                placeholder="Adresse (sur les factures)"
              />
            </div>
          ) : (
            <select name="clientId" required className={champ}>
              <option value="">— Choisir un client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.organisation}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* --- Le projet --- */}
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          <span className="text-xs font-medium">Projet</span>
          <Input
            name="nomProjet"
            required
            minLength={2}
            placeholder="Nom du projet *"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Nature
              <select name="type" className={champ + " mt-1"}>
                {TYPES_PROJET.map((t) => (
                  <option key={t} value={t}>
                    {LIBELLES_TYPE_PROJET[t] ?? t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Montant convenu (DT HT)
              <Input
                name="caSigne"
                type="number"
                min="0"
                step="0.001"
                placeholder="facultatif"
                className="mt-1"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Fin prévue
              <Input name="finPrevue" type="date" className="mt-1" />
            </label>
          </div>
          <Input name="description" placeholder="Objet, en une ligne (facultatif)" />
          <p className="text-[11px] text-muted-foreground">
            Le montant convenu sert de référence au reste à facturer. Laissé
            vide, l&apos;écran Factures ne proposera rien de lui-même — il ne
            supposera pas zéro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            {enCours ? "Création…" : "Créer l'affaire"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOuvert(false)}
          >
            Annuler
          </Button>
        </div>
      </fieldset>

      {retour ? <Message retour={retour} /> : null}
    </form>
  );
}

function Message({ retour }: { retour: { ok: boolean; message: string } }) {
  return (
    <p
      role="status"
      className={`flex items-start gap-2 text-xs ${
        retour.ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-destructive"
      }`}
    >
      {retour.ok ? (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      )}
      <span>{retour.message}</span>
    </p>
  );
}
