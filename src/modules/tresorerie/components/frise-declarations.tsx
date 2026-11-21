import Link from "next/link";
import { AlertTriangle, Check, FileCheck2, Pencil } from "lucide-react";
import type {
  EtatMois,
  MoisDeclaration,
} from "@/modules/tresorerie/services/calendrier-declarations";

/**
 * Les douze mois de l'exercice, chacun avec son état, et on va sur l'un
 * d'eux d'un clic.
 *
 * Avant, changer de mois demandait de taper une date dans un champ puis de
 * cliquer « Afficher », et rien ne disait où on en était : un Trésorier qui
 * reprend le mandat en cours de route ne pouvait pas voir qu'il avait trois
 * mois de retard sans les ouvrir un par un.
 *
 * Le rendu est volontairement sans état : c'est une rangée de liens, elle
 * marche sans JavaScript et se recharge avec la page.
 */

const APPARENCE: Record<
  EtatMois,
  { classe: string; titre: string; icone: React.ReactNode | null }
> = {
  DEPOSEE: {
    classe: "border-success/40 bg-success/10 text-success",
    titre: "Déposée",
    icone: <FileCheck2 className="h-3 w-3" aria-hidden />,
  },
  CLOTUREE: {
    classe: "border-success/30 bg-success/5 text-success",
    titre: "Clôturée, pas encore déposée",
    icone: <Check className="h-3 w-3" aria-hidden />,
  },
  EN_RETARD: {
    classe: "border-danger/40 bg-danger/10 text-danger",
    titre: "Mois échu, pas encore clôturé",
    icone: <AlertTriangle className="h-3 w-3" aria-hidden />,
  },
  EN_COURS: {
    classe: "border-border bg-muted/60 text-foreground",
    titre: "Mois en cours",
    icone: <Pencil className="h-3 w-3" aria-hidden />,
  },
  A_VENIR: {
    classe: "border-border/60 text-muted-foreground",
    titre: "Mois à venir",
    icone: null,
  },
};

/**
 * Abréviations françaises des mois. Tronquer le libellé à quatre lettres
 * donnait « octo. », « nove. », « déce. » : l'usage veut oct., nov., déc.,
 * et mars, mai, juin ne s'abrègent pas du tout.
 */
const ABREGES = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « 2026-10 » → « oct. ». Le libellé complet reste en infobulle. */
function abrege(cle: string): string {
  const m = Number(cle.split("-")[1]);
  return ABREGES[m - 1] ?? cle;
}

export function FriseDeclarations({
  calendrier,
  moisActif,
}: {
  calendrier: MoisDeclaration[];
  moisActif: string;
}) {
  if (!calendrier.length) return null;

  return (
    <nav
      aria-label="Mois de l'exercice"
      className="flex flex-wrap items-center gap-1"
    >
      {calendrier.map((m) => {
        const apparence = APPARENCE[m.etat];
        const actif = m.cle === moisActif;
        return (
          <Link
            key={m.cle}
            href={`/tresorerie/declaration?mois=${m.cle}`}
            aria-current={actif ? "page" : undefined}
            title={`${m.libelle} — ${apparence.titre}`}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-muted ${
              apparence.classe
            } ${actif ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
          >
            {apparence.icone}
            {abrege(m.cle)}
          </Link>
        );
      })}
    </nav>
  );
}
