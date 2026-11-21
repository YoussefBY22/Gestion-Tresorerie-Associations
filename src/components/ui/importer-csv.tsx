"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Formulaire d'import CSV réutilisable — <details> pour ne pas encombrer l'écran par défaut. */
export function ImporterCsv({
  action,
  colonnesAttendues,
  className,
}: {
  action: (formData: FormData) => void;
  colonnesAttendues: string[];
  className?: string;
}) {
  return (
    <details className={className}>
      <summary className="cursor-pointer list-none">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted">
          <Upload size={14} /> Importer un CSV
        </span>
      </summary>
      <form action={action} className="mt-2 w-72 space-y-2 rounded-md border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Colonnes reconnues (insensible à la casse) : {colonnesAttendues.join(", ")}.
        </p>
        <input
          type="file"
          name="fichier"
          accept=".csv,text/csv"
          required
          className="block w-full text-xs"
        />
        <Button type="submit" size="sm">
          Importer
        </Button>
      </form>
    </details>
  );
}
