import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { MandatModel } from "@/modules/core/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  TYPES_FLUX,
  MODES_PAIEMENT,
  PLAFOND_ESPECES_DT,
} from "@/modules/tresorerie/models";
import { comptePourMode } from "@/modules/tresorerie/services/caisse";
import { compterDepassementsEspeces } from "@/modules/tresorerie/services/conformite-especes";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import {
  TableauFlux,
  type FluxVue,
} from "@/modules/tresorerie/components/tableau-flux";
import { FormulaireFlux } from "@/modules/tresorerie/components/formulaire-flux";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function FluxPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let flux: FluxVue[] = [];
  let categories: string[] = [];

  try {
    await connectDb();
    const mandatActif: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();
    if (mandatActif) {
      const bruts = await FluxTresorerieModel.find({ mandat: mandatActif._id })
        .sort({ date: -1 })
        .limit(100)
        .lean();
      flux = bruts.map((f) => ({
        id: String(f._id),
        type: f.type,
        montant: f.montant,
        date: df.format(new Date(f.date)),
        dateISO: new Date(f.date).toISOString().slice(0, 10),
        tiers: f.tiers,
        modePaiement: f.modePaiement ?? "ESPECES",
        categorie: f.categorie,
        compte: f.compte ?? comptePourMode(f.modePaiement),
        justificatifRef: f.justificatifRef ?? "",
        notes: f.notes ?? "",
      }));
      const budget = await BudgetPrevisionnelModel.findOne({ mandat: mandatActif._id })
        .select("lignes.libelle")
        .lean();
      categories = budget?.lignes.map((l) => l.libelle) ?? [];
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const horsPlafond = compterDepassementsEspeces(
    flux.map((f) => ({
      type: f.type === "DECAISSEMENT" ? "DECAISSEMENT" : "ENCAISSEMENT",
      modePaiement: f.modePaiement,
      montant: f.montant,
    }))
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Journal des flux"
        description={`Toutes les opérations tracées (EX-TRS-03) · justificatif obligatoire (lien Drive en attendant la GED) · au-delà de ${PLAFOND_ESPECES_DT} DT, les espèces sont signalées, jamais refusées.`}
      />
      <NavTresorerie actif="/tresorerie/flux" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {horsPlafond > 0 ? (
            <div
              role="alert"
              className="flex gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger lg:col-span-2"
            >
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">
                  {horsPlafond} opération(s) en espèces au-delà de{" "}
                  {PLAFOND_ESPECES_DT} DT
                </span>{" "}
                — le décret-loi n° 2011-88 du 24 septembre 2011 impose le chèque
                ou le virement à ce niveau. Elles restent en rouge ci-dessous
                jusqu&apos;à régularisation : rectifiez le mode de paiement si
                le règlement est finalement passé par la banque, sinon joignez
                la pièce et expliquez le dépassement au rapport financier.
              </span>
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{flux.length} opération(s)</CardTitle>
            </CardHeader>
            <CardContent>
              <TableauFlux
                flux={flux}
                categories={categories}
                typesFlux={TYPES_FLUX}
                modesPaiement={MODES_PAIEMENT}
                peutEcrire={peutEcrire}
              />
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Saisir un flux</CardTitle>
              </CardHeader>
              <CardContent>
                <FormulaireFlux
                  categories={categories}
                  typesFlux={TYPES_FLUX}
                  modesPaiement={MODES_PAIEMENT}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
