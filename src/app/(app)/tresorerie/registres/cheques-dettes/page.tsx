import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArrowLeft } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import {
  ChequeOuDetteModel,
  LIBELLES_STATUT_CHEQUE_DETTE,
  LIBELLES_TYPE_CHEQUE_DETTE,
  STATUTS_CHEQUE_DETTE,
  TYPES_CHEQUE_DETTE,
} from "@/modules/tresorerie/models";
import { enregistrerChequeOuDette } from "@/modules/tresorerie/actions/registres";
import {
  ListeChequesDettes,
  type LigneChequeDette,
} from "@/modules/tresorerie/components/liste-cheques-dettes";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function RegistreChequesDettesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let lignes: LigneChequeDette[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      lignes = (
        await ChequeOuDetteModel.find({ mandat: mandat._id })
          .sort({ dateEmission: -1 })
          .lean()
      ).map((c) => ({
        id: String(c._id),
        type: c.type,
        tiers: c.tiers,
        montant: c.montant,
        dateEmission: df.format(new Date(c.dateEmission)),
        dateEmissionISO: new Date(c.dateEmission).toISOString().slice(0, 10),
        dateEcheance: c.dateEcheance
          ? df.format(new Date(c.dateEcheance))
          : "",
        dateEcheanceISO: c.dateEcheance
          ? new Date(c.dateEcheance).toISOString().slice(0, 10)
          : "",
        statut: c.statut,
        reference: c.reference ?? "",
        pieces: (c.justificatifs ?? []).map((j) => ({
          id: String(j._id),
          nom: j.nomFichier ?? "Pièce",
          libelle: j.libelle ?? "",
        })),
      }));
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const enCours = lignes.filter((l) => l.statut === "EN_COURS");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Registre des chèques et dettes"
        description="Chèques émis ou reçus en circulation, dettes et pénalités en cours."
        actions={
          <Link href="/tresorerie/registres">
            <Button size="sm">
              <ArrowLeft size={14} /> Registres
            </Button>
          </Link>
        }
      />
      <NavTresorerie actif="/tresorerie/registres" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{enCours.length} en cours sur {lignes.length}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lignes.length === 0 ? (
                <EmptyState icon={<Archive size={28} />} title="Aucune ligne enregistrée" />
              ) : (
                <ListeChequesDettes
                  lignes={lignes}
                  peutEcrire={peutEcrire}
                  options={{
                    types: TYPES_CHEQUE_DETTE,
                    libellesType: LIBELLES_TYPE_CHEQUE_DETTE,
                    statuts: STATUTS_CHEQUE_DETTE,
                    libellesStatut: LIBELLES_STATUT_CHEQUE_DETTE,
                  }}
                />
              )}
            </CardContent>
          </Card>

          {peutEcrire ? (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Nouvelle ligne</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={enregistrerChequeOuDette} className="space-y-3">
                  <label className="block text-sm">
                    Type
                    <select
                      name="type"
                      className="mt-1 flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
                    >
                      {TYPES_CHEQUE_DETTE.map((t) => (
                        <option key={t} value={t}>
                          {LIBELLES_TYPE_CHEQUE_DETTE[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input name="tiers" required minLength={2} placeholder="Tiers *" />
                  <Input name="montant" type="number" min={0.01} step="0.001" required placeholder="Montant (DT) *" />
                  <label className="block text-sm">
                    Date d&apos;émission
                    <Input name="dateEmission" type="date" required className="mt-1" />
                  </label>
                  <label className="block text-sm">
                    Échéance
                    <Input name="dateEcheance" type="date" className="mt-1" />
                  </label>
                  <Input name="reference" placeholder="Référence (n° de chèque…)" />
                  <Button type="submit" className="w-full">
                    Enregistrer
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
