"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export interface MenuTab {
  key: string;
  label: string;
  icon: string;
  photos: string[];
  sections: { name: string; items: { id: string; name: string; description: string; price: number }[] }[];
}

const price = (v: number) => Math.round(v).toLocaleString("en-US");
const SLIDE_MS = 6000;

export function MenuCard({ tabs, name, address, footer, canEdit, displayFont }: {
  tabs: MenuTab[]; name: string; address: string; footer: string; canEdit: boolean; displayFont: string;
}) {
  const [active, setActive] = useState(0);
  const [slide, setSlide] = useState(0);
  const tab = tabs[active];
  const photos = tab?.photos ?? [];

  // Background photos of the selected tab fade from one to the next.
  useEffect(() => {
    setSlide(0);
    if (photos.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % photos.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [active, photos.length]);

  const choose = (i: number) => {
    setActive(i);
    document.getElementById("mcard-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mcard">
      <div className="mcard-bg" aria-hidden>
        {photos.map((p, i) => (
          <div key={p} className={`mcard-photo ${i === slide ? "on" : ""}`} style={{ backgroundImage: `url(${p})` }} />
        ))}
        <div className="mcard-shade" />
      </div>

      <header className="mcard-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="MO Stay · Eatery" width={96} height={96} className="mcard-logo" />
        <h1 className={displayFont}>{name}</h1>
        <div className="mcard-tagline">Stay · Eatery</div>
        {address && <div className="mcard-address">{address}</div>}
      </header>

      {tabs.length === 0 ? (
        <div className="mcard-paper"><p className="mcard-empty">The menu is not available right now – please ask our staff.</p></div>
      ) : (
        <>
          <nav id="mcard-tabs" className="mcard-tabs" role="tablist" aria-label="Menu sections">
            {tabs.map((t, i) => (
              <button key={t.key} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => choose(i)}>
                <span aria-hidden>{t.icon}</span> {t.label}
              </button>
            ))}
          </nav>

          <section className="mcard-paper" role="tabpanel" aria-label={tab.label}>
            {tab.sections.map((s) => {
              const compact = s.items.every((it) => !it.description);
              return (
                <div key={s.name} className="mcard-section">
                  <h2 className={displayFont}>{s.name}</h2>
                  <ul className={compact ? "compact" : ""}>
                    {s.items.map((it) => (
                      <li key={it.id}>
                        <div className="mcard-line">
                          <span className="mcard-name">{it.name}</span>
                          <span className="mcard-dots" aria-hidden />
                          <span className="mcard-price">{price(it.price)}</span>
                        </div>
                        {it.description && <p className="mcard-desc">{it.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="mcard-foot">
              <div>All prices in Sri Lankan Rupees (LKR)</div>
              {footer && <div>{footer}</div>}
            </div>
          </section>
        </>
      )}

      {canEdit && (
        <Link href="/menu/edit" className="mcard-edit">✏️ Edit menu</Link>
      )}
    </div>
  );
}
