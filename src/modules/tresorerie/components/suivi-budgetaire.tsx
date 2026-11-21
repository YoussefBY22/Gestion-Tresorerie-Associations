import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Budget prévu contre réalisé, poste par poste.
 *
 * Le tableau précédent alignait charges et produits dans la même liste, sans
 * ordre, avec une colonne « écart » dont le signe voulait dire l'inverse
 * d'une famille à l'autre : un dépassement de charge est un problème, un
 * dépassement de recette est une bonne nouvelle. On sépare donc les deux, on
 * trie par montant prévu — l'œil va d'abord aux gros postes — et on montre
 * l'avancement plutôt qu'un nombre à interpréter.
 */

export type LigneSuivi = {
  categorie: string;
  type: "CHARGE" | "PRODUIT";
  prevu: number;
  realise: number;
  ecart: number;
  depassement: boolean;
};

function dt(montant: number): string {
  return montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

/** Part réalisée, bornée à 100 % pour la barre — le dépassement se dit ailleurs. */
function avancement(realise: number, prevu: number): number | null {
  if (prevu <= 0) return null;
  return Math.min(100, Math.round((realise / prevu) * 100));
}

function Groupe({
  titre,
  sens,
  lignes,
}: {
  titre: string;
  sens: "CHARGE" | "PRODUIT";
  lignes: LigneSuivi[];
}) {
  const charge = sens === "CHARGE";
  const totalPrevu = lignes.reduce((s, l) => s + l.prevu, 0);
  const totalRealise = lignes.reduce((s, l) => s + l.realise, 0);
  const teinte = charge ? "text-danger" : "text-success";
  const fond = charge ? "bg-danger" : "bg-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={`inline-block h-2.5 w-2.5 rounded-full ${fond}`}
            />
            {titre}
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            <span className={`font-medium ${teinte}`}>{dt(totalRealise)}</span>
            {" / "}
            {dt(totalPrevu)} DT
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun poste dans cette famille.
          </p>
        ) : (
          lignes.map((l) => {
            const part = avancement(l.realise, l.prevu);
            // Un poste de charge dépassé alerte ; un poste de recette dépassé
            // se félicite. Même chiffre, deux lectures.
            const alerte = charge && l.depassement;
            return (
              <div key={l.categorie}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{l.categorie}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <span
                      className={
                        l.realise > 0 ? `font-medium ${teinte}` : "font-medium"
                      }
                    >
                      {dt(l.realise)}
                    </span>
                    {" / "}
                    {dt(l.prevu)} DT
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    role="presentation"
                  >
                    <div
                      className={`h-full rounded-full ${alerte ? "bg-danger" : fond} ${
                        alerte ? "" : "opacity-70"
                      }`}
                      style={{ width: `${part ?? 0}%` }}
                    />
                  </div>
                  <span
                    className={`w-24 shrink-0 text-right text-xs tabular-nums ${
                      alerte ? "text-danger" : "text-muted-foreground"
                    }`}
                  >
                    {part === null
                      ? l.realise > 0
                        ? "hors budget"
                        : "non budgété"
                      : alerte
                        ? `dépassé de ${dt(Math.abs(l.ecart))}`
                        : `${part} %`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function SuiviBudgetaire({ lignes }: { lignes: LigneSuivi[] }) {
  const parMontant = (a: LigneSuivi, b: LigneSuivi) =>
    b.prevu - a.prevu || b.realise - a.realise || a.categorie.localeCompare(b.categorie, "fr");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Groupe
        titre="Recettes"
        sens="PRODUIT"
        lignes={lignes.filter((l) => l.type === "PRODUIT").sort(parMontant)}
      />
      <Groupe
        titre="Charges"
        sens="CHARGE"
        lignes={lignes.filter((l) => l.type === "CHARGE").sort(parMontant)}
      />
    </div>
  );
}
