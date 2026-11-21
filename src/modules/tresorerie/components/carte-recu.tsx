"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Ban,
  ExternalLink,
  Mail,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  annulerRecuTresorerie,
  envoyerRecuParEmail,
  marquerRecuEnvoye,
  messagePourRecu,
  supprimerRecuNonEnvoye,
} from "@/modules/tresorerie/actions/cycle-recus";
import { supprimerCotisation } from "@/modules/tresorerie/actions/cotisations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Un reçu établi, et ce qu'on a le droit d'en faire.
 *
 * Tout tient à une seule question : **est-il parti ?**
 *
 * - Non → c'est un brouillon. Il se supprime, son numéro est rendu, et les
 *   reçus non envoyés qui le suivent redescendent d'un cran. Rien n'a été
 *   remis à personne, il n'y a rien à justifier.
 * - Oui → sa référence est gravée. Il ne se supprime plus ; il s'annule, avec
 *   un motif, et reste consultable barré « Annulé ». C'est ce qui explique le
 *   trou dans la série à qui la relira.
 *
 * Deux gestes font partir un reçu, et la distinction n'est pas cosmétique :
 * **l'envoyer par courriel depuis l'application** (le PDF est joint, et la bascule
 * n'a lieu que si l'envoi a réussi), ou **déclarer qu'on l'a remis
 * autrement** — en main propre, par sa propre messagerie. Le second est une
 * déclaration du Trésorier ; le premier est un fait que l'application constate.
 */

export type RecuVue = {
  documentId: string;
  reference: string;
  intitule: string;
  detail: string;
  montant: number;
  envoye: boolean;
  envoyeLe: string;
  envoyeA: string;
  annule: boolean;
  motifAnnulation: string;
  /** Renseigné pour un reçu de cotisation : permet de retirer les deux. */
  cotisationId?: string;
};

type Formulaire = "courriel" | "envoi" | "annulation" | null;

/** Message proposé, chargé à l'ouverture du formulaire puis modifiable. */
type Brouillon = { destinataire: string; sujet: string; corps: string };

export function CarteRecu({
  recu: r,
  peutEcrire,
}: {
  recu: RecuVue;
  peutEcrire: boolean;
}) {
  const [ouvert, setOuvert] = useState<Formulaire>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * Compte rendu des gestes du cycle (remise, suppression, annulation).
   *
   * Ces actions rendaient leurs refus en les **levant** : en production une
   * exception d'action serveur est masquée, et c'est précisément son texte
   * qui dit pourquoi un reçu ne peut plus être supprimé.
   */
  const [retour, setRetour] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [enCours, demarrer] = useTransition();

  /**
   * Ouvre le formulaire de courriel en allant chercher le message proposé.
   *
   * Le texte dépend de la famille du reçu et des données figées à
   * l'émission : c'est le serveur qui le compose, le Trésorier qui le relit.
   */
  function ouvrirCourriel() {
    if (ouvert === "courriel") {
      setOuvert(null);
      return;
    }
    setOuvert("courriel");
    setErreur(null);
    if (brouillon) return;
    demarrer(async () => {
      try {
        const propose = await messagePourRecu(r.documentId);
        setBrouillon({
          destinataire: propose.destinataire,
          sujet: propose.sujet,
          corps: propose.corps,
        });
      } catch (err) {
        setErreur(err instanceof Error ? err.message : String(err));
      }
    });
  }

  /**
   * Envoie — et n'efface rien en cas d'échec : sans transport configuré, le
   * refus est la réponse normale, et le texte saisi doit survivre pour qu'on
   * puisse le copier ailleurs.
   */
  function envoyer() {
    if (!brouillon) return;
    setErreur(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("documentId", r.documentId);
      donnees.set("destinataire", brouillon.destinataire);
      donnees.set("sujet", brouillon.sujet);
      donnees.set("corps", brouillon.corps);
      try {
        const resultat = await envoyerRecuParEmail(donnees);
        if (resultat.ok) setOuvert(null);
        else setErreur(resultat.message);
      } catch (err) {
        setErreur(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        r.annule ? "border-border bg-muted/30" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className={r.annule ? "line-through opacity-70" : ""}>
              {r.intitule}
            </span>
            <EtatRecu recu={r} />
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <Link
              href={`/documents/${r.documentId}`}
              className={`font-mono text-xs text-primary hover:underline ${
                r.annule ? "line-through" : ""
              }`}
            >
              {r.reference}
            </Link>
            <span className="text-xs text-muted-foreground">{r.detail}</span>
          </p>
          {r.annule && r.motifAnnulation ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Motif : {r.motifAnnulation}
            </p>
          ) : null}
          {r.envoye && !r.annule ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Remis le {r.envoyeLe} · {r.envoyeA}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <a
            href={`/api/documents/${r.documentId}/fichier`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir le PDF"
            aria-label={`Ouvrir le PDF ${r.reference}`}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {peutEcrire && !r.annule ? (
            r.envoye ? (
              <button
                type="button"
                title="Annuler ce reçu"
                aria-label={`Annuler le reçu ${r.reference}`}
                onClick={() => setOuvert(ouvert === "annulation" ? null : "annulation")}
                className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  title="Envoyer le reçu par courriel"
                  aria-label={`Envoyer le reçu ${r.reference} par courriel`}
                  onClick={ouvrirCourriel}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Déclarer remis sans passer par l'application (main propre, messagerie personnelle)"
                  aria-label={`Marquer ${r.reference} comme remis`}
                  onClick={() => setOuvert(ouvert === "envoi" ? null : "envoi")}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
                <form
                  action={async (donnees) => {
                    setRetour(await supprimerRecuNonEnvoye(donnees));
                  }}
                  onSubmit={(e) => {
                    if (
                      !window.confirm(
                        `Supprimer le reçu « ${r.reference} » ?\n\nIl n'a pas été remis : son numéro est rendu, et les reçus non envoyés qui le suivent redescendent d'un cran. L'encaissement repassera dans « nécessitant un reçu ».`
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="documentId" value={r.documentId} />
                  <button
                    type="submit"
                    title="Supprimer ce reçu (non envoyé)"
                    aria-label={`Supprimer le reçu ${r.reference}`}
                    className="rounded p-1.5 text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </form>
                {/*
                  Retirer le reçu seul renvoie l'encaissement dans « à
                  émettre ». Quand c'est la cotisation elle-même qui n'a pas
                  lieu d'être, il faut pouvoir retirer les deux.
                */}
                {r.cotisationId ? (
                  <form
                    action={supprimerCotisation}
                    onSubmit={(e) => {
                      if (
                        !window.confirm(
                          `Supprimer la cotisation de ${r.intitule} (${r.montant} DT) et son reçu ${r.reference} ?\n\nLe reçu n'ayant pas été remis, son numéro est rendu. ${r.intitule} reste inscrit au registre des adhérents.`
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input
                      type="hidden"
                      name="cotisationId"
                      value={r.cotisationId}
                    />
                    <button
                      type="submit"
                      title="Supprimer la cotisation et son reçu"
                      aria-label={`Supprimer la cotisation de ${r.intitule}`}
                      className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : null}
              </>
            )
          ) : null}
        </div>
      </div>

      {ouvert === "courriel" ? (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          {brouillon ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="email"
                  value={brouillon.destinataire}
                  onChange={(e) =>
                    setBrouillon({ ...brouillon, destinataire: e.target.value })
                  }
                  placeholder="adresse@destinataire.tn"
                  className="h-8 min-w-56 flex-1 text-xs"
                  aria-label={`Adresse du destinataire de ${r.reference}`}
                />
                <BoutonFermer onClick={() => setOuvert(null)} />
              </div>
              <Input
                value={brouillon.sujet}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, sujet: e.target.value })
                }
                placeholder="Objet du message"
                className="h-8 text-xs"
                aria-label={`Objet du message de ${r.reference}`}
              />
              <textarea
                value={brouillon.corps}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, corps: e.target.value })
                }
                rows={8}
                aria-label={`Message accompagnant ${r.reference}`}
                className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={enCours || !brouillon.destinataire.trim()}
                  onClick={envoyer}
                >
                  {enCours ? "Envoi…" : `Envoyer ${r.reference}`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Le PDF part en pièce jointe.
                </span>
              </div>
              {erreur ? (
                <p className="whitespace-pre-line rounded-md border border-danger/40 bg-danger/5 px-2 py-1.5 text-xs text-danger">
                  {erreur}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  La référence n&apos;est gravée que si l&apos;envoi réussit :
                  tant qu&apos;il échoue, le reçu reste un brouillon
                  supprimable.
                </p>
              )}
            </>
          ) : erreur ? (
            <p className="text-xs text-danger">{erreur}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Préparation du message…
            </p>
          )}
        </div>
      ) : null}

      {ouvert === "envoi" ? (
        <form
          action={async (donnees) => {
            const r = await marquerRecuEnvoye(donnees);
            setRetour(r);
            if (r.ok) setOuvert(null);
          }}
          className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
        >
          <input type="hidden" name="documentId" value={r.documentId} />
          <Input
            name="destinataire"
            type="text"
            placeholder="E-mail du destinataire (ou remise en main propre)"
            className="h-8 min-w-56 flex-1 text-xs"
            aria-label={`Destinataire de ${r.reference}`}
          />
          <Button type="submit" size="sm" className="h-8 text-xs">
            Marquer remis
          </Button>
          <BoutonFermer onClick={() => setOuvert(null)} />
          <p className="w-full text-xs text-muted-foreground">
            À déclarer quand le reçu a été remis hors de l&apos;application. À partir
            de là, la référence est gravée : le reçu ne se supprimera plus, il
            faudra l&apos;annuler.
          </p>
        </form>
      ) : null}

      {ouvert === "annulation" ? (
        <form
          action={async (donnees) => {
            const r = await annulerRecuTresorerie(donnees);
            setRetour(r);
            if (r.ok) setOuvert(null);
          }}
          className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2"
        >
          <input type="hidden" name="documentId" value={r.documentId} />
          <Input
            name="motif"
            required
            minLength={3}
            placeholder="Motif de l'annulation (erreur de montant, doublon…)"
            className="h-8 min-w-56 flex-1 text-xs"
            aria-label={`Motif d'annulation de ${r.reference}`}
          />
          <Button type="submit" size="sm" className="h-8 text-xs">
            Annuler le reçu
          </Button>
          <BoutonFermer onClick={() => setOuvert(null)} />
          <p className="w-full text-xs text-muted-foreground">
            {r.reference} restera consultable, barré « Annulé ». Son numéro
            reste consommé — c&apos;est ce qui explique le trou dans la série —
            et l&apos;encaissement repassera dans « nécessitant un reçu ».
          </p>
        </form>
      ) : null}

      {retour ? (
        <p
          role="status"
          className={`mt-2 rounded-md px-2 py-1.5 text-xs ${
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

function EtatRecu({ recu }: { recu: RecuVue }) {
  if (recu.annule) return <Badge variant="muted">Annulé</Badge>;
  if (recu.envoye) return <Badge variant="success">Remis</Badge>;
  return (
    <Badge variant="warning" title="Non remis : modifiable et supprimable">
      Brouillon
    </Badge>
  );
}

function BoutonFermer({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Fermer"
      aria-label="Fermer"
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground hover:bg-muted"
    >
      <X size={15} />
    </button>
  );
}
