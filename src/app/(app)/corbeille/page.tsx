import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  TYPES_ELEMENT_CORBEILLE,
  type TypeElementCorbeille,
} from "@/modules/core/models";
import {
  compterParTypeDe,
  listerCorbeilleDe,
  purgerElementsExpires,
  type ElementCorbeilleVue,
} from "@/modules/core/services/corbeille-depot";
import { DUREE_RETENTION_JOURS } from "@/modules/core/services/corbeille";
import { VueCorbeille } from "@/modules/core/components/vue-corbeille";
import { PageHeader } from "@/components/ui/page-header";
import { AlerteDb } from "@/components/ui/alerte-db";

export const dynamic = "force-dynamic";

export default async function CorbeillePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { type } = await searchParams;
  const typeActif = TYPES_ELEMENT_CORBEILLE.includes(type as TypeElementCorbeille)
    ? (type as TypeElementCorbeille)
    : undefined;

  let erreurDb: string | undefined;
  let elements: ElementCorbeilleVue[] = [];
  let compteurs: Record<string, number> = {};

  try {
    // Filet de sécurité : la purge est un cron quotidien, mais la règle des
    // 30 jours doit tenir même si ce cron n'a pas tourné.
    await purgerElementsExpires();
    [elements, compteurs] = await Promise.all([
      listerCorbeilleDe(session.user.id, typeActif),
      compterParTypeDe(session.user.id),
    ]);
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Ma corbeille"
        description={`Ce que vous avez supprimé dans l'application, quel que soit le module. Conservé ${DUREE_RETENTION_JOURS} jours, puis effacé définitivement. Vous seul y avez accès.`}
      />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <VueCorbeille
          base="/corbeille"
          elements={elements}
          compteurs={compteurs}
          typeActif={typeActif}
        />
      )}
    </div>
  );
}
