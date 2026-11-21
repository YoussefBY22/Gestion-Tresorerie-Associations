import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Banknote } from "lucide-react";
import type { Types } from "mongoose";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel, MembreModel } from "@/modules/core/models";
import { CotisationModel } from "@/modules/base/models";
import { DocumentModel } from "@/modules/documents/models";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import {
  TableauCotisations,
  type LigneCotisation,
} from "@/modules/tresorerie/components/tableau-cotisations";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** L'âge se calcule, il ne se stocke pas : recopié, il devient faux dans l'année. */
function ageAu(naissance: Date, maintenant = new Date()): number {
  let age = maintenant.getFullYear() - naissance.getFullYear();
  const moisEcoule =
    maintenant.getMonth() > naissance.getMonth() ||
    (maintenant.getMonth() === naissance.getMonth() &&
      maintenant.getDate() >= naissance.getDate());
  if (!moisEcoule) age -= 1;
  return age;
}

/** Date au format d'un `<input type="date">`, vide si la date manque. */
function iso(date: Date | null | undefined): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

/**
 * Registre des cotisations — vue trésorerie du registre RH existant
 * (`CotisationModel`). Un registre autonome, distinct du brouillard de
 * caisse, comme l'exige la Norme JE — mais une seule collection : la RH le
 * saisit, la Trésorerie le tient.
 *
 * Il se remplit à l'encaissement, et se corrige ici : c'est le registre légal
 * des adhérents (décret-loi n° 2011-88, art. 8), avec la CIN qui rattache le
 * paiement à une personne identifiée, et le reçu qui l'atteste.
 */
export default async function RegistreCotisationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");

  let erreurDb: string | undefined;
  let lignes: LigneCotisation[] = [];

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId } | null = await MandatModel.findOne({
      statut: "ACTIF",
    })
      .select("_id")
      .lean();

    if (mandat) {
      const cotisations = await CotisationModel.find({ mandat: mandat._id })
        .select("_id membre montant payee datePaiement")
        .lean();
      const membreIds = cotisations.map((c) => c.membre);
      const membres = await MembreModel.find({ _id: { $in: membreIds } })
        .select("_id nom adresse cin nationalite dateNaissance profession")
        .lean();
      const parMembre = new Map(membres.map((m) => [String(m._id), m]));

      // Le reçu de la cotisation, quand il a été émis : c'est la pièce qui
      // atteste du paiement, et la retrouver depuis le registre évite de
      // fouiller la bibliothèque documentaire ligne à ligne.
      const recus = await DocumentModel.find({
        modele: "RECU_COTISATION",
        objetType: "Cotisation",
        objetId: { $in: cotisations.map((c) => c._id) },
        statut: { $ne: "ANNULE" },
      })
        .select("_id reference objetId")
        .lean();
      const recuParCotisation = new Map(
        recus.map((d) => [String(d.objetId), d])
      );

      lignes = cotisations
        .map((c) => {
          const m = parMembre.get(String(c.membre));
          const recu = recuParCotisation.get(String(c._id));
          return {
            id: String(c._id),
            membre: m?.nom ?? "Membre inconnu",
            cin: m?.cin ?? "",
            nationalite: m?.nationalite ?? "",
            age: m?.dateNaissance ? ageAu(new Date(m.dateNaissance)) : null,
            dateNaissanceISO: iso(m?.dateNaissance),
            profession: m?.profession ?? "",
            adresse: m?.adresse ?? "",
            montant: c.montant,
            payee: c.payee,
            datePaiement: c.datePaiement ? df.format(new Date(c.datePaiement)) : "—",
            datePaiementISO: iso(c.datePaiement),
            recu: recu
              ? { id: String(recu._id), reference: recu.reference }
              : null,
          };
        })
        .sort((a, b) => a.membre.localeCompare(b.membre, "fr"));
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const totalPaye = lignes.filter((l) => l.payee).reduce((s, l) => s + l.montant, 0);
  const enAttente = lignes.filter((l) => !l.payee).length;
  const sansCin = lignes.filter((l) => !l.cin).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Registre des cotisations"
        description="Cotisations du mandat, distinctes du brouillard de caisse. Chaque ligne se corrige sur place — c'est le registre légal des adhérents."
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
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard
              label="Cotisations enregistrées"
              value={lignes.length}
              icon={<Banknote size={20} />}
            />
            <StatCard
              label="Total encaissé"
              value={`${totalPaye.toLocaleString("fr-FR")} DT`}
            />
            <StatCard
              label="En attente"
              value={enAttente}
              className={enAttente > 0 ? "border-warning" : ""}
            />
            <StatCard
              label="Sans CIN"
              value={sansCin}
              hint={sansCin > 0 ? "À compléter au registre" : "Registre complet"}
              className={sansCin > 0 ? "border-danger" : ""}
            />
          </div>

          <Card className="mt-6">
            <CardContent className="pt-6">
              {lignes.length === 0 ? (
                <EmptyState
                  icon={<Banknote size={28} />}
                  title="Aucune cotisation enregistrée"
                  description="Les cotisations encaissées au journal des flux ou par appel RH arrivent ici."
                />
              ) : (
                <TableauCotisations lignes={lignes} peutEcrire={peutEcrire} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
