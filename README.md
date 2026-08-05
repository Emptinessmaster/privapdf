# 🛡️ PrivaPDF

**Strumenti PDF privati che girano interamente nel tuo browser.** Unisci, dividi, ruota e oscura (redigi) i tuoi PDF — **senza mai caricarli online**. Zero server, zero tracking, funziona anche **offline** come PWA.

> I documenti vengono elaborati localmente con WebAssembly e le API del browser. I file non lasciano mai il tuo dispositivo.

---

## ✨ Funzionalità

| Strumento | Descrizione |
|-----------|-------------|
| **Unisci** | Aggiungi più PDF, riordinali con drag-and-drop e uniscili in un unico file. |
| **Dividi** | Seleziona pagine o intervalli (`1-3, 5, 8-10`) cliccando le anteprime o scrivendoli, ed estraili in un nuovo PDF. |
| **Oscura / Redigi** | Traccia rettangoli neri sulle informazioni sensibili. Le pagine oscurate vengono **rasterizzate**: il testo sottostante è rimosso in modo permanente. |
| **Ruota & Pagine** | Ruota o elimina singole pagine. |

## 🔒 Privacy-First

- **Elaborazione 100% client-side** — nessun upload, nessun backend.
- **PWA installabile** — Service Worker + manifest per l'uso **completamente offline**.
- **Nessun tracciamento** dei documenti.

## 🧰 Stack tecnico

- **Vanilla JS** (nessun framework, nessuna build).
- [`pdf-lib`](https://github.com/Hopding/pdf-lib) — creazione e modifica dei PDF.
- [`pdf.js`](https://github.com/mozilla/pdf.js) — rendering delle pagine.
- Service Worker per la cache offline dell'app e delle librerie.


## ☕ Sostieni il progetto

PrivaPDF è gratis, privato e senza limiti. Se ti è utile:

- [☕ Buy me a coffee](https://buymeacoffee.com/emptinessmaster)
- [🅿️ PayPal](https://paypal.me/EmptinessMaster)

## 📄 Licenza

[MIT](LICENSE) © 2026 PrivaPDF
