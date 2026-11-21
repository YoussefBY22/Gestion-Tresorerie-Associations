import { EmptyState } from "@/components/ui/empty-state";
import { Database } from "lucide-react";

/** Affiché quand la base n'est pas joignable (MONGODB_URI absent ou erreur). */
export function AlerteDb({ erreur }: { erreur?: string }) {
  return (
    <EmptyState
      icon={<Database size={28} />}
      title="Base de données non disponible"
      description={
        erreur?.includes("MONGODB_URI")
          ? "Renseignez MONGODB_URI dans .env.local (cluster MongoDB Atlas M0 — voir .env.example), puis relancez le serveur."
          : `Connexion impossible : ${erreur ?? "erreur inconnue"}`
      }
    />
  );
}
