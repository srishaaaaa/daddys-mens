"use client";

import { useEffect, useState } from "react";
import PrintSettingsModal from "@/app/_components/PrintSettingsModal";
import { applyPrintStyle, cleanPrefs, type PrintPrefs } from "@/lib/printMode";

/* No buttons on the invoice itself — customers just see the bill.
   Staff print from Billing, which opens this page as /invoice/<id>?print=true&type=…&size=… :
   the paper settings are applied and the print dialog opens. (Opened with ?print=true and no
   paper chosen, it asks for the paper first.) */
export default function InvoiceActions() {
  const [askPrint, setAskPrint] = useState(false);

  const printWith = (prefs: PrintPrefs) => {
    applyPrintStyle(prefs);
    setAskPrint(false);
    // let the new page size apply before the print dialog opens
    setTimeout(() => window.print(), 150);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") !== "true") return;
    const prefs = cleanPrefs(params.get("type"), params.get("size"));
    const t = setTimeout(() => {
      if (prefs) printWith(prefs);
      else setAskPrint(true);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return askPrint ? <PrintSettingsModal onCancel={() => setAskPrint(false)} onPrint={printWith} /> : null;
}
