import { useCallback, useEffect, useState } from "react";
import { loadCatalog } from "@/domain/catalog";
import type { CatalogPayload } from "@/domain/types";

export function useCatalog(locale: string) {
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [catalogLoading, setLoading] = useState(true);
  const [catalogError, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryCatalog = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setCatalog(null); setLoading(true); setError(null);
    loadCatalog(locale)
      .then((value) => { if (active) setCatalog(value); })
      .catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : "目录载入失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale, attempt]);
  return { catalog: catalog?.locale === locale ? catalog : null, catalogLoading, catalogError, retryCatalog };
}
