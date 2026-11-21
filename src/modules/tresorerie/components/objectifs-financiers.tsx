"use client";

import { useState } from "react";
import { Check, CircleDot, Clock, Lock, Send, Trash2, X } from "lucide-react";
import {
  deciderSuppressionObjectif,
  deciderValidationObjectif,
  demanderSuppressionObjectif,
  majStatutObjectif,
  supprimerObjectifFinancier,
} from "@/modules/tresorerie/actions/tableau-bord";
import {
  LIBELLES_STATUT_OBJECTIF,
  type StatutObjectifFinancier,
} from "@/modules/tresorerie/services/strategie-financiere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Objectifs financiers du mandat.
 *
 * Deux régimes, lisibles au premier coup d'œil : ce qui est gravé porte
 * l'aplat bordeaux de la charte, ce qui reste libre est simplement encadré.
 * Les commandes sont des icônes — un objectif se lit, il ne se pilote pas à
 * coups de boutons pleins de texte qui prennent plus de place que lui.
 */

export type ObjectifVue = {
  id: string;
  libelle: string;
  kpiAssocie: string;
  cible: string;
  echeance: string;
  statut: StatutObjectifFinancier;
  verrouille: boolean;
  /** Décision du Président sur le verrouillage ; absent = Norme JE. */
  validation: "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE" | null;
  enVigueur: boolean;
  suppressionDemandee: "EN_ATTENTE" | "ACCEPTEE" | "REFUSEE" | null;
  motifSuppression: string;
};

const STATUTS: StatutObjectifFinancier[] = ["A_FAIRE", "EN_COURS", "REALISE"];

const ICONE_STATUT = {
  A_FAIRE: CircleDot,
  EN_COURS: Clock,
  REALISE: Check,
} as const;

export function ObjectifsFinanciers({
  objectifs,
  peutEcrire,
  peutValider,
}: {
  objectifs: ObjectifVue[];
  peutEcrire: boolean;
  peutValider: boolean;
}) {
  return (
    <div className="space-y-3">
      {objectifs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun objectif pour l&apos;instant.
        </p>
      ) : (
        objectifs.map((o) => (
          <Objectif
            key={o.id}
            objectif={o}
            peutEcrire={peutEcrire}
            peutValider={peutValider}
          />
        ))
      )}
    </div>
  );
}

function Objectif({
  objectif: o,
  peutEcrire,
  peutValider,
}: {
  objectif: ObjectifVue;
  peutEcrire: boolean;
  peutValider: boolean;
}) {
  const [demande, setDemande] = useState(false);
  const grave = o.verrouille && o.enVigueur;
  const enAttente = o.validation === "EN_ATTENTE";

  return (
    <div
      className={`rounded-lg border p-4 ${
        grave
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-52 flex-1">
          <p className="flex items-center gap-2 font-medium">
            {grave ? <Lock size={14} aria-hidden /> : null}
            {o.libelle}
          </p>
          <p className={`mt-1 text-xs ${grave ? "text-white/75" : "text-muted-foreground"}`}>
            {[
              o.cible ? `Cible : ${o.cible}` : null,
              o.kpiAssocie || null,
              o.echeance ? `Échéance ${o.echeance}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Aucune cible chiffrée"}
          </p>
          {grave ? (
            <p className="mt-1 text-xs text-white/75">
              {o.validation === "ACCEPTEE"
                ? "Gravé par le Président — ni modifiable ni supprimable."
                : "Imposé par la Norme JE — sa suppression demande l'accord du Président."}
            </p>
          ) : null}
          {enAttente ? (
            <p className="mt-1 text-xs text-warning">
              Verrouillage proposé — en attente de la décision du Président.
              L&apos;objectif ne compte pas encore.
            </p>
          ) : null}
          {o.validation === "REFUSEE" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Verrouillage refusé : l&apos;objectif reste, mais librement
              modifiable.
            </p>
          ) : null}
        </div>

        {/* Avancement : trois icônes, celle en cours mise en avant. */}
        <div className="flex items-center gap-0.5">
          {STATUTS.map((s) => {
            const Icone = ICONE_STATUT[s];
            const actif = o.statut === s;
            if (!peutEcrire) {
              return actif ? (
                <span
                  key={s}
                  title={LIBELLES_STATUT_OBJECTIF[s]}
                  className="rounded p-1.5"
                >
                  <Icone size={15} />
                </span>
              ) : null;
            }
            return (
              <form key={s} action={majStatutObjectif}>
                <input type="hidden" name="objectifId" value={o.id} />
                <input type="hidden" name="statut" value={s} />
                <button
                  type="submit"
                  title={LIBELLES_STATUT_OBJECTIF[s]}
                  aria-label={`Marquer « ${o.libelle} » : ${LIBELLES_STATUT_OBJECTIF[s]}`}
                  aria-pressed={actif}
                  className={`rounded p-1.5 transition-opacity ${
                    grave
                      ? actif
                        ? "bg-white/20"
                        : "opacity-50 hover:bg-white/10 hover:opacity-100"
                      : actif
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"
                  }`}
                >
                  <Icone size={15} />
                </button>
              </form>
            );
          })}

          {peutEcrire && !o.verrouille ? (
            <form
              action={supprimerObjectifFinancier}
              onSubmit={(e) => {
                if (!window.confirm(`Supprimer l'objectif « ${o.libelle} » ?`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="objectifId" value={o.id} />
              <button
                type="submit"
                title="Supprimer cet objectif"
                aria-label={`Supprimer l'objectif ${o.libelle}`}
                className="rounded p-1.5 text-danger opacity-60 hover:bg-danger/10 hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </form>
          ) : null}

          {peutEcrire && grave && !o.suppressionDemandee ? (
            <button
              type="button"
              title="Demander au Président de retirer cet objectif"
              aria-label={`Demander le retrait de l'objectif ${o.libelle}`}
              onClick={() => setDemande((d) => !d)}
              className="rounded p-1.5 opacity-70 hover:bg-white/10 hover:opacity-100"
            >
              <Send size={15} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Demande de retrait d'un objectif gravé */}
      {demande && grave ? (
        <form
          action={demanderSuppressionObjectif}
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/20 pt-3"
        >
          <input type="hidden" name="objectifId" value={o.id} />
          <Input
            name="motif"
            required
            minLength={10}
            placeholder="Motif de la demande (obligatoire)"
            className="h-8 flex-1 min-w-52 bg-white/10 text-xs text-white placeholder:text-white/60"
          />
          <button
            type="submit"
            title="Envoyer la demande au Président"
            aria-label="Envoyer la demande au Président"
            className="rounded p-1.5 hover:bg-white/20"
          >
            <Send size={15} />
          </button>
          <button
            type="button"
            title="Annuler"
            aria-label="Annuler la demande"
            onClick={() => setDemande(false)}
            className="rounded p-1.5 hover:bg-white/20"
          >
            <X size={15} />
          </button>
        </form>
      ) : null}

      {o.suppressionDemandee === "EN_ATTENTE" ? (
        <div className="mt-3 border-t border-white/20 pt-3 text-xs">
          <p className={grave ? "text-white/80" : "text-muted-foreground"}>
            Retrait demandé — {o.motifSuppression}
          </p>
          {peutValider ? (
            <form action={deciderSuppressionObjectif} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="objectifId" value={o.id} />
              <Input
                name="motifDecision"
                placeholder="Commentaire (optionnel)"
                className="h-8 flex-1 min-w-40 bg-white/10 text-xs text-white placeholder:text-white/60"
              />
              <button
                type="submit"
                name="decision"
                value="ACCEPTEE"
                title="Accepter le retrait"
                aria-label="Accepter le retrait"
                className="rounded p-1.5 hover:bg-white/20"
              >
                <Check size={15} />
              </button>
              <button
                type="submit"
                name="decision"
                value="REFUSEE"
                title="Refuser le retrait"
                aria-label="Refuser le retrait"
                className="rounded p-1.5 hover:bg-white/20"
              >
                <X size={15} />
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Décision du Président sur un verrouillage proposé */}
      {enAttente && peutValider ? (
        <form
          action={deciderValidationObjectif}
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
        >
          <input type="hidden" name="objectifId" value={o.id} />
          <span className="text-xs text-muted-foreground">
            Graver cet objectif pour le mandat ?
          </span>
          <Input
            name="motifDecision"
            placeholder="Commentaire (optionnel)"
            className="h-8 flex-1 min-w-40 text-xs"
          />
          <Button size="sm" type="submit" name="decision" value="ACCEPTEE">
            <Check size={14} /> Graver
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="submit"
            name="decision"
            value="REFUSEE"
          >
            <X size={14} /> Refuser
          </Button>
        </form>
      ) : null}
    </div>
  );
}
