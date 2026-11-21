import {
  LIBELLES_NATURE_TVA,
  type Declaration,
} from "@/modules/tresorerie/services/fiscal";

/**
 * La liquidation du mois, lue comme on la raisonne.
 *
 * Elle s'affichait en dix lignes de même poids, la plupart à zéro, le
 * montant à verser en dernier et sans plus d'emphase que « Timbres fiscaux
 * émis ». On ne voyait donc pas ce qu'on cherchait : **combien, et pourquoi**.
 *
 * Trois temps, dans l'ordre du raisonnement : ce qu'on a collecté, ce qu'on
 * déduit, ce qu'il reste. Les lignes à zéro restent visibles — une
 * déclaration est une pièce, l'absence de timbres s'y lit autant que leur
 * présence — mais en retrait, pour que l'œil passe dessus sans s'arrêter.
 */

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

function Ligne({
  label,
  montant,
  aide,
}: {
  label: string;
  montant: number;
  aide?: string;
}) {
  const nul = Math.abs(montant) < 0.0005;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span
        className={`text-sm ${nul ? "text-muted-foreground/60" : "text-muted-foreground"}`}
      >
        {label}
        {aide ? (
          <span className="ml-1 text-xs text-muted-foreground/60">{aide}</span>
        ) : null}
      </span>
      <span
        className={`shrink-0 text-sm tabular-nums ${
          nul ? "text-muted-foreground/60" : "font-medium"
        }`}
      >
        {dt(montant)}
      </span>
    </div>
  );
}

function Groupe({
  titre,
  total,
  children,
}: {
  titre: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titre}
        </h4>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {dt(total)}
        </span>
      </div>
      <div className="mt-1 pl-3">{children}</div>
    </div>
  );
}

export function Liquidation({ declaration: d }: { declaration: Declaration }) {
  const deductible = d.recues.totalTVA + d.agios.totalTVA;
  const aReporter = d.nature === "A_REPORTER";

  return (
    <div className="space-y-1">
      <Groupe titre="TVA collectée" total={d.emises.totalTVA}>
        <Ligne
          label="Chiffre d'affaires facturé"
          montant={d.emises.totalHT}
          aide="HT"
        />
        <Ligne label="TVA sur les ventes" montant={d.emises.totalTVA} />
      </Groupe>

      <Groupe titre="TVA déductible" total={deductible}>
        <Ligne label="Sur les achats" montant={d.recues.totalTVA} />
        <Ligne label="Sur les agios bancaires" montant={d.agios.totalTVA} />
      </Groupe>

      <Groupe titre="Solde de TVA" total={d.soldeApresReport}>
        <Ligne label="Solde du mois" montant={d.soldeTVA} />
        <Ligne
          label="Crédit reporté du mois précédent"
          montant={d.reportPrecedent}
        />
      </Groupe>

      {/*
        Le montant dû n'est pas le solde de TVA : s'y ajoutent les timbres
        encaissés pour le compte de l'État et la retenue opérée sur les
        prestataires. Les détailler ici évite de chercher l'écart.
      */}
      <div className="rounded-lg bg-muted/50 p-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-semibold">Montant à verser</span>
          <span className="shrink-0 text-xl font-semibold tabular-nums text-primary">
            {dt(d.montantAPayer)}
          </span>
        </div>
        <div className="mt-1 pl-3">
          <Ligne
            label={LIBELLES_NATURE_TVA[d.nature]}
            montant={aReporter ? 0 : d.tvaAPayer}
          />
          <Ligne label="Timbres fiscaux encaissés" montant={d.emises.totalTimbres} />
          <Ligne
            label="Retenue à la source opérée"
            montant={d.recues.totalRAS}
          />
        </div>
        {aReporter ? (
          <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            Le crédit de {dt(Math.abs(d.tvaAReporter))}{" "}
            ne se demande pas en remboursement : il s&apos;impute sur la TVA
            du mois suivant.
          </p>
        ) : null}
      </div>
    </div>
  );
}
